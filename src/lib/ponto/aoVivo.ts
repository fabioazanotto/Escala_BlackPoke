// Classificação "ao vivo" de quem está trabalhando, em intervalo, atrasado, ausente etc. Funções puras (testadas).
// Todos os horários são em MINUTOS desde 00:00 do "dia de trabalho" e podem passar de 1440 (madrugada do dia seguinte).
// É uma classificação OPERACIONAL e provisória: não gera desconto nem hora extra, e é calculada só pelas batidas RECEBIDAS.

import { AUSENTE_APOS_MIN, DIA_DE_TRABALHO_VIRA_AS, INTERVALO_ALERTA_MIN, LIMITE_RETORNO_INTERVALO_MIN, MARGEM_ENCERRAMENTO_MIN, TOLERANCIA_ATRASO_MIN, TROCA_TURNO_ANTES_MIN, TROCA_TURNO_DEPOIS_MIN } from "@/config/ponto";
import { somarDiasData } from "@/lib/vendas/datas";

export type Jornada = { inicio: number; fim: number }; // fim sempre > inicio (já somado 1440 quando vira a meia-noite)
export type Batida = { minuto: number; hora: string; manual: boolean };

export type Parametros = { tolerancia: number; ausenteApos: number; alertaIntervalo: number; margemEncerramento: number; limiteRetorno: number; trocaAntes: number; trocaDepois: number };
export const PARAMETROS_PADRAO: Parametros = { tolerancia: TOLERANCIA_ATRASO_MIN, ausenteApos: AUSENTE_APOS_MIN, alertaIntervalo: INTERVALO_ALERTA_MIN, margemEncerramento: MARGEM_ENCERRAMENTO_MIN, limiteRetorno: LIMITE_RETORNO_INTERVALO_MIN, trocaAntes: TROCA_TURNO_ANTES_MIN, trocaDepois: TROCA_TURNO_DEPOIS_MIN };

export type Situacao =
  | "aguardando" // ainda não chegou a hora (ou está dentro da tolerância, sem batida)
  | "atrasado_sem_registro" // passou da tolerância, sem batida, ainda não é "ausente"
  | "ausente" // sem batida depois do limite, turno ainda em andamento
  | "falta" // o turno acabou sem nenhuma batida
  | "trabalhando"
  | "intervalo"
  | "encerrou"
  | "folga"
  | "justificado"
  | "sem_registro_desatualizado" // sem batida, mas os dados não são confiáveis agora: nunca vira ausência
  | "sem_batida"; // sem previsão de jornada e sem batida

export type Avaliacao = {
  situacao: Situacao;
  atrasoMin: number | null; // minutos de atraso na entrada (só se passou da tolerância)
  minutosSemRegistro: number | null; // atrasado_sem_registro / ausente: há quantos minutos passou do horário previsto
  minutosNoIntervalo: number | null; // intervalo em andamento
  alertaIntervalo: boolean; // intervalo em andamento passou do limite
  intervaloCurtoMin: number | null; // primeiro intervalo já concluído com menos do limite
  semRetorno: boolean; // saiu e o turno acabou sem voltar
  semSaida: boolean; // entrou e passou muito do fim previsto sem saída
  retornoEmAberto: boolean; // saiu para o intervalo, não bateu o retorno e a próxima batida (horas depois) foi tratada como a saída
  motivo: string | null;
};

// ---------------------------------------------------------------- tempo

export const paraMinutos = (hhmm: string): number | null => {
  const m = /^(\d{1,2})[:.](\d{2})/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h > 23 || min > 59 ? null : h * 60 + min;
};

export const deMinutos = (min: number): string => {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

export function jornadaDe(inicio: string, fim: string): Jornada | null {
  const i = paraMinutos(inicio);
  const f = paraMinutos(fim);
  if (i === null || f === null) return null;
  return { inicio: i, fim: f <= i ? f + 1440 : f };
}

/** Qual é o dia de trabalho de agora e quantos minutos já se passaram dele. Antes das 05:00 ainda é o dia anterior. */
export function diaDeTrabalho(agora: { data: string; minutos: number }, viraAs = DIA_DE_TRABALHO_VIRA_AS): { dia: string; agoraMin: number } {
  if (agora.minutos < viraAs * 60) return { dia: somarDiasData(agora.data, -1), agoraMin: agora.minutos + 1440 };
  return { dia: agora.data, agoraMin: agora.minutos };
}

/** "Agora" no Brasil (UTC-3 o ano todo). */
export function agoraNoBrasil(data: Date = new Date()): { data: string; minutos: number } {
  const local = new Date(data.getTime() - 3 * 3600000);
  return { data: local.toISOString().slice(0, 10), minutos: local.getUTCHours() * 60 + local.getUTCMinutes() };
}

export type RegistroBatida = { data: string; hora: string; tipo: number };

/**
 * Batidas que pertencem ao dia de trabalho: as do próprio dia a partir das 05:00 e as do dia seguinte antes das 05:00.
 * Batida desconsiderada (tipo 3) não conta. Devolve em ordem de horário.
 */
export function batidasDoDia(registros: RegistroBatida[], dia: string, viraAs = DIA_DE_TRABALHO_VIRA_AS): Batida[] {
  const seguinte = somarDiasData(dia, 1);
  const out: Batida[] = [];
  for (const r of registros) {
    if (r.tipo === 3) continue;
    const min = paraMinutos(r.hora);
    if (min === null) continue;
    const data = r.data.slice(0, 10);
    if (data === dia && min >= viraAs * 60) out.push({ minuto: min, hora: deMinutos(min), manual: r.tipo === 1 });
    else if (data === seguinte && min < viraAs * 60) out.push({ minuto: min + 1440, hora: deMinutos(min), manual: r.tipo === 1 });
  }
  return out.sort((a, b) => a.minuto - b.minuto);
}

// ---------------------------------------------------------------- classificação

export type Entrada = {
  jornada: Jornada | null; // horário previsto (da escala/cadastro ou do Secullum)
  batidas: Batida[];
  agoraMin: number;
  folga?: boolean; // escala ou Secullum dizem que é folga
  justificativa?: string | null; // férias, atestado etc., do Secullum
  confiavel?: boolean; // false: dados atrasados ou incompletos (nunca declara ausência)
};

export function classificar(e: Entrada, p: Parametros = PARAMETROS_PADRAO): Avaliacao {
  const base: Avaliacao = { situacao: "sem_batida", atrasoMin: null, minutosSemRegistro: null, minutosNoIntervalo: null, alertaIntervalo: false, intervaloCurtoMin: null, semRetorno: false, semSaida: false, retornoEmAberto: false, motivo: null };
  const b = e.batidas;
  const n = b.length;
  const j = e.jornada;

  if (n === 0) {
    if (e.justificativa) return { ...base, situacao: "justificado", motivo: e.justificativa };
    if (e.folga) return { ...base, situacao: "folga" };
    if (!j) return base;
    if (e.agoraMin < j.inicio) return { ...base, situacao: "aguardando" };
    if (e.confiavel === false) return { ...base, situacao: "sem_registro_desatualizado" };
    if (e.agoraMin >= j.fim) return { ...base, situacao: "falta" };
    const passou = e.agoraMin - j.inicio;
    if (passou <= p.tolerancia) return { ...base, situacao: "aguardando" };
    if (passou <= p.ausenteApos) return { ...base, situacao: "atrasado_sem_registro", minutosSemRegistro: passou };
    return { ...base, situacao: "ausente", minutosSemRegistro: passou };
  }

  const atraso = j ? Math.max(0, b[0].minuto - j.inicio) : 0;
  const atrasoMin = atraso > p.tolerancia ? atraso : null;
  const intervaloCurtoMin = n >= 3 && b[2].minuto - b[1].minuto < p.alertaIntervalo ? b[2].minuto - b[1].minuto : null;
  const comum = { ...base, atrasoMin, intervaloCurtoMin, motivo: e.justificativa ?? null };

  // 3 batidas e a terceira veio muito depois da saída para o intervalo: é a SAÍDA, e o retorno ficou sem registro.
  if (retornoEmAbertoDe(b, p)) return { ...comum, situacao: "encerrou", retornoEmAberto: true };

  if (n % 2 === 1) {
    const semSaida = !!j && e.agoraMin > j.fim + p.margemEncerramento;
    return { ...comum, situacao: "trabalhando", semSaida };
  }

  const ultima = b[n - 1];
  const encerrou = j ? ultima.minuto >= j.fim - p.margemEncerramento || e.agoraMin >= j.fim : e.agoraMin - ultima.minuto > 180;
  if (encerrou) return { ...comum, situacao: "encerrou", semRetorno: !!j && n === 2 && ultima.minuto < j.fim - p.margemEncerramento };
  const minutos = Math.max(0, e.agoraMin - ultima.minuto);
  return { ...comum, situacao: "intervalo", minutosNoIntervalo: minutos, alertaIntervalo: minutos > p.alertaIntervalo };
}

// ---------------------------------------------------------------- posição das batidas

/** Com 3 batidas, a 3ª veio depois do limite do intervalo: é a saída; o retorno do intervalo ficou sem registro. */
export function retornoEmAbertoDe(b: Batida[], p: Parametros = PARAMETROS_PADRAO): boolean {
  return b.length === 3 && b[2].minuto - b[1].minuto > p.limiteRetorno;
}

/** Coloca as batidas nas 4 colunas (Entrada, Saída int., Retorno, Saída). Retorno em aberto deixa a coluna do retorno vazia. */
export function posicionar<T>(batidas: T[], retornoEmAberto: boolean): (T | null)[] {
  if (retornoEmAberto && batidas.length === 3) return [batidas[0], batidas[1], null, batidas[2]];
  return [0, 1, 2, 3].map((i) => batidas[i] ?? null);
}

/**
 * Troca de turno só por uma necessidade do dia: a pessoa é de um turno, mas bateu no horário do outro.
 * Vale o outro turno se a primeira batida está fora da janela do próprio turno e dentro da janela do outro.
 * (Antes da primeira batida não há como saber; por isso a tela sempre avisa que o turno foi deduzido.)
 */
export function inferirTurno(batidas: Batida[], propria: Jornada | null, alternativa: Jornada | null, p: Parametros = PARAMETROS_PADRAO): boolean {
  if (!propria || !alternativa || batidas.length === 0) return false;
  const primeira = batidas[0].minuto;
  const dentro = (j: Jornada) => primeira >= j.inicio - p.trocaAntes && primeira <= j.inicio + p.trocaDepois;
  return !dentro(propria) && dentro(alternativa);
}

// ---------------------------------------------------------------- rótulos

export const ROTULO_SITUACAO: Record<Situacao, string> = {
  aguardando: "Aguardando entrada",
  atrasado_sem_registro: "Atrasado, sem registro",
  ausente: "Ausente",
  falta: "Falta (sem registro no dia)",
  trabalhando: "Trabalhando",
  intervalo: "Em intervalo",
  encerrou: "Encerrou",
  folga: "Folga",
  justificado: "Justificado",
  sem_registro_desatualizado: "Sem registro (dados podem estar desatualizados)",
  sem_batida: "Sem batida",
};

/** Ordem de atenção: o que pede ação primeiro. */
export const ORDEM_SITUACAO: Situacao[] = ["falta", "ausente", "atrasado_sem_registro", "sem_registro_desatualizado", "intervalo", "trabalhando", "aguardando", "sem_batida", "encerrou", "justificado", "folga"];

export type Contagem = { trabalhando: number; intervalo: number; atrasados: number; ausentes: number; encerraram: number; folgaOuJustificado: number; aguardando: number; total: number };

export function contar(avaliacoes: Avaliacao[]): Contagem {
  const c: Contagem = { trabalhando: 0, intervalo: 0, atrasados: 0, ausentes: 0, encerraram: 0, folgaOuJustificado: 0, aguardando: 0, total: avaliacoes.length };
  for (const a of avaliacoes) {
    if (a.atrasoMin !== null || a.situacao === "atrasado_sem_registro") c.atrasados += 1;
    switch (a.situacao) {
      case "trabalhando": c.trabalhando += 1; break;
      case "intervalo": c.intervalo += 1; break;
      case "ausente":
      case "falta": c.ausentes += 1; break;
      case "encerrou": c.encerraram += 1; break;
      case "folga":
      case "justificado": c.folgaOuJustificado += 1; break;
      case "atrasado_sem_registro": break; // já contado em "atrasados"
      case "aguardando":
      case "sem_registro_desatualizado":
      case "sem_batida": c.aguardando += 1; break;
    }
  }
  return c;
}

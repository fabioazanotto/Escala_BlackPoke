// Mês de um colaborador: dia a dia, resumo e pontos de atenção. Funções puras (testadas).
// Duas fontes lado a lado: a leitura do BlackPoke (escala x batidas, mesmas regras da visão ao vivo) e o cálculo oficial do Secullum.
// É classificação OPERACIONAL: não gera desconto, hora extra nem penalidade.

import { somarDiasData } from "@/lib/vendas/datas";
import { DIA_DE_TRABALHO_VIRA_AS } from "@/config/ponto";
import { PARAMETROS_PADRAO, ROTULO_SITUACAO, batidasDoDia, classificar, deMinutos, paraMinutos, type Avaliacao, type Jornada, type Parametros } from "./aoVivo";

export type RegistroCompleto = { data: string; hora: string; tipo: number };
export type InfoDiaSecullum = { folga: boolean; justificativa: string | null };
export type DiaEscala = { situacao: string; jornada: Jornada | null };
export type DiaHorario = { jornada: Jornada | null; folga: boolean; texto: string | null };
export type LinhaOficial = Record<string, string>;

export type EntradaMes = {
  mes: string; // yyyy-mm
  hoje: string; // dia de trabalho de hoje
  agoraMin: number; // minutos desde 00:00 do dia de trabalho de hoje
  registros: RegistroCompleto[];
  agrupadas: Map<string, InfoDiaSecullum>;
  escala: Map<string, DiaEscala> | null; // null: não existe escala do BlackPoke para o mês
  horario: (dia: string) => DiaHorario; // horário do Secullum no dia
  oficial: Map<string, LinhaOficial> | null;
  parametros?: Parametros;
};

export type DiaMes = {
  dia: string;
  diaSemana: string;
  futuro: boolean;
  escala: string | null; // o que a escala diz (rótulo)
  previsto: string | null;
  fontePrevisto: "escala" | "secullum" | null;
  batidas: { hora: string; manual: boolean }[];
  avaliacao: Avaliacao | null;
  rotulo: string;
  trabalhadoMin: number;
  intervaloMin: number | null;
  semSaida: boolean;
  semIntervalo: boolean;
  saidaAntecipadaMin: number | null;
  folgaTrabalhada: boolean;
  manuais: number;
  desconsideradas: number;
  justificativa: string | null;
  oficial: LinhaOficial | null;
  divergencias: string[];
};

export type ResumoMes = {
  diasEscalados: number | null; // null sem escala
  diasComBatida: number;
  faltas: number | null; // null sem escala: nesse caso a fonte é o cálculo oficial
  atrasos: number;
  atrasoTotalMin: number;
  saidasAntecipadas: number;
  semSaida: number;
  semIntervalo: number;
  intervalosCurtos: number;
  trabalhadoMin: number;
  folgasTrabalhadas: number;
  justificados: number;
  manuais: number;
  desconsideradas: number;
  divergencias: number;
};

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const ROTULO_ESCALA: Record<string, string> = { trabalha: "Trabalha", dobra: "Dobra", folga: "Folga", domingo: "Domingo de descanso", ferias: "Férias", afastamento: "Afastamento", indisponibilidade: "Indisponível", fora: "Fora da escala" };

export const ultimoDiaDoMes = (mes: string) => {
  const [a, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
};

/** Valor de coluna do cálculo oficial que representa "alguma coisa" (não vazio nem 00:00). */
export const temValor = (v: string | undefined) => !!v && /[1-9]/.test(v);

export function parseCalcular(resposta: unknown): { colunas: string[]; porDia: Map<string, LinhaOficial>; totais: LinhaOficial } {
  const r = resposta as { Colunas?: unknown; Linhas?: unknown; Totais?: unknown } | null;
  const colunas = Array.isArray(r?.Colunas) ? r.Colunas.map((c) => String(c)) : [];
  const porDia = new Map<string, LinhaOficial>();
  for (const l of Array.isArray(r?.Linhas) ? r.Linhas : []) {
    const chave = String((l as { Key?: unknown })?.Key ?? "").slice(0, 10);
    const valores = (l as { Value?: unknown })?.Value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(chave) || !Array.isArray(valores)) continue;
    porDia.set(chave, Object.fromEntries(colunas.map((c, i) => [c, String(valores[i] ?? "")])));
  }
  const totaisBrutos = Array.isArray(r?.Totais) ? r.Totais : [];
  return { colunas, porDia, totais: Object.fromEntries(colunas.map((c, i) => [c, String(totaisBrutos[i] ?? "")])) };
}

const minutosTrabalhados = (b: { minuto: number }[]) => {
  let t = 0;
  for (let i = 0; i + 1 < b.length; i += 2) t += b[i + 1].minuto - b[i].minuto;
  return t;
};

/** Quantas batidas desconsideradas pertencem ao dia de trabalho (as que o resto do sistema ignora). */
function contarDesconsideradas(registros: RegistroCompleto[], dia: string): number {
  const seguinte = somarDiasData(dia, 1);
  let n = 0;
  for (const r of registros) {
    if (r.tipo !== 3) continue;
    const min = paraMinutos(r.hora);
    if (min === null) continue;
    const d = r.data.slice(0, 10);
    if ((d === dia && min >= DIA_DE_TRABALHO_VIRA_AS * 60) || (d === seguinte && min < DIA_DE_TRABALHO_VIRA_AS * 60)) n += 1;
  }
  return n;
}

export function montarMes(e: EntradaMes): { dias: DiaMes[]; resumo: ResumoMes } {
  const p = e.parametros ?? PARAMETROS_PADRAO;
  const dias: DiaMes[] = [];
  const ultimo = ultimoDiaDoMes(e.mes);
  const temEscala = e.escala !== null;

  for (let dia = `${e.mes}-01`; dia <= ultimo; dia = somarDiasData(dia, 1)) {
    const futuro = dia > e.hoje;
    const agoraDia = futuro ? -1 : dia < e.hoje ? 1440 + DIA_DE_TRABALHO_VIRA_AS * 60 : e.agoraMin;
    const b = batidasDoDia(e.registros, dia);
    const n = b.length;
    const esc = e.escala?.get(dia) ?? null;
    const hor = e.horario(dia);
    const info = e.agrupadas.get(dia) ?? { folga: false, justificativa: null };
    const trabalhaNaEscala = esc?.situacao === "trabalha" || esc?.situacao === "dobra";
    const diaDeFolga = esc?.situacao === "folga" || esc?.situacao === "domingo";
    const ausenciaEscala = esc && ["ferias", "afastamento", "indisponibilidade"].includes(esc.situacao) ? ROTULO_ESCALA[esc.situacao] : null;

    // Qual horário vale: o da escala; sem escala no mês, o do Secullum (só para medir atraso de quem bateu, nunca para declarar falta).
    const jornadaEscala = trabalhaNaEscala ? esc!.jornada : null;
    const jornada = n > 0 ? (jornadaEscala ?? (temEscala ? null : hor.jornada)) : jornadaEscala;
    const fonte: DiaMes["fontePrevisto"] = jornadaEscala ? "escala" : n > 0 && !temEscala && hor.jornada ? "secullum" : null;
    const jornadaMostrada = jornada ?? (!temEscala ? hor.jornada : null);
    const previsto = jornadaMostrada ? `${deMinutos(jornadaMostrada.inicio)}–${deMinutos(jornadaMostrada.fim)}` : null;

    const justificativa = info.justificativa ?? ausenciaEscala ?? (info.folga && trabalhaNaEscala ? "Folga marcada no Secullum" : null);
    const oficialDoDia = e.oficial?.get(dia) ?? null;
    // Sem escala no mês, a folga vem do Secullum (marcada no cartão de ponto ou na coluna "Folga" do cálculo oficial).
    const folga = temEscala ? diaDeFolga : info.folga || (oficialDoDia?.["Folga"] ?? "").trim() !== "";
    const avaliacao = futuro ? null : classificar({ jornada, batidas: b, agoraMin: agoraDia, folga, justificativa, confiavel: true }, p);

    const passado = dia < e.hoje;
    const semSaida = !futuro && n % 2 === 1 && (passado || !!avaliacao?.semSaida);
    const semIntervalo = !futuro && n === 2 && b[1].minuto - b[0].minuto >= 360;
    const ultima = n > 0 ? b[n - 1] : null;
    const saidaAntecipadaMin = avaliacao && jornada && n >= 2 && n % 2 === 0 && avaliacao.situacao === "encerrou" && !avaliacao.semRetorno && ultima && ultima.minuto < jornada.fim - p.tolerancia ? jornada.fim - ultima.minuto : null;
    const folgaTrabalhada = temEscala && diaDeFolga && n > 0;
    const oficial = oficialDoDia;

    const divergencias: string[] = [];
    if (oficial && avaliacao) {
      const faltaOficial = temValor(oficial["Faltas"]);
      const atrasoOficial = temValor(oficial["Atras."]);
      if (temEscala && !justificativa) {
        const nossaFalta = avaliacao.situacao === "falta" || avaliacao.situacao === "ausente";
        if (nossaFalta && !faltaOficial) divergencias.push("BlackPoke vê falta; o Secullum não lançou falta");
        if (!nossaFalta && faltaOficial && n > 0) divergencias.push("O Secullum lançou falta, mas há batidas");
      }
      if (n > 0 && (avaliacao.atrasoMin !== null) !== atrasoOficial) divergencias.push(avaliacao.atrasoMin !== null ? "Atraso no BlackPoke que o Secullum não lançou (tolerâncias diferentes?)" : "Atraso lançado pelo Secullum que o BlackPoke não vê");
    }

    const rotulo = futuro ? (trabalhaNaEscala ? "Previsto" : "—") : avaliacao ? (avaliacao.situacao === "justificado" && avaliacao.motivo ? `Justificado: ${avaliacao.motivo}` : n === 0 && !temEscala && !folga && !justificativa ? "Sem batida" : avaliacao.situacao === "folga" && !temEscala ? "Folga (Secullum)" : ROTULO_SITUACAO[avaliacao.situacao]) : "—";

    dias.push({
      dia,
      diaSemana: DIAS[new Date(`${dia}T00:00:00Z`).getUTCDay()],
      futuro,
      escala: esc ? (ROTULO_ESCALA[esc.situacao] ?? esc.situacao) : null,
      previsto,
      fontePrevisto: fonte ?? (jornadaMostrada ? (temEscala && jornadaEscala ? "escala" : "secullum") : null),
      batidas: b.map((x) => ({ hora: x.hora, manual: x.manual })),
      avaliacao,
      rotulo,
      trabalhadoMin: minutosTrabalhados(b),
      intervaloMin: n >= 3 ? b[2].minuto - b[1].minuto : null,
      semSaida,
      semIntervalo,
      saidaAntecipadaMin,
      folgaTrabalhada,
      manuais: b.filter((x) => x.manual).length,
      desconsideradas: contarDesconsideradas(e.registros, dia),
      justificativa: avaliacao?.situacao === "justificado" ? (avaliacao.motivo ?? justificativa) : justificativa,
      oficial,
      divergencias,
    });
  }

  const passados = dias.filter((d) => !d.futuro && d.avaliacao);
  const resumo: ResumoMes = {
    diasEscalados: temEscala ? dias.filter((d) => d.escala === "Trabalha" || d.escala === "Dobra").length : null,
    diasComBatida: passados.filter((d) => d.batidas.length > 0).length,
    faltas: temEscala ? passados.filter((d) => d.avaliacao!.situacao === "falta").length : null, // dia de hoje com "ausente" ainda está em andamento
    atrasos: passados.filter((d) => d.avaliacao!.atrasoMin !== null).length,
    atrasoTotalMin: passados.reduce((s, d) => s + (d.avaliacao!.atrasoMin ?? 0), 0),
    saidasAntecipadas: passados.filter((d) => d.saidaAntecipadaMin !== null).length,
    semSaida: passados.filter((d) => d.semSaida).length,
    semIntervalo: passados.filter((d) => d.semIntervalo).length,
    intervalosCurtos: passados.filter((d) => d.avaliacao!.intervaloCurtoMin !== null).length,
    trabalhadoMin: passados.reduce((s, d) => s + d.trabalhadoMin, 0),
    folgasTrabalhadas: passados.filter((d) => d.folgaTrabalhada).length,
    justificados: passados.filter((d) => d.avaliacao!.situacao === "justificado").length,
    manuais: passados.reduce((s, d) => s + d.manuais, 0),
    desconsideradas: passados.reduce((s, d) => s + d.desconsideradas, 0),
    divergencias: passados.filter((d) => d.divergencias.length > 0).length,
  };
  return { dias, resumo };
}

// ---------------------------------------------------------------- pontos de atenção

const dm = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
const lista = (ds: DiaMes[]) => ds.map((d) => dm(d.dia)).join(", ");
export const duracao = (min: number) => `${Math.floor(min / 60)}h${String(Math.abs(min) % 60).padStart(2, "0")}`;

export function pontosDeAtencao(dias: DiaMes[], resumo: ResumoMes, temEscala: boolean): string[] {
  const out: string[] = [];
  const f = (fn: (d: DiaMes) => boolean) => dias.filter((d) => !d.futuro && d.avaliacao && fn(d));
  const faltas = f((d) => d.avaliacao!.situacao === "falta");
  if (temEscala && faltas.length) out.push(`Faltas (escalado, sem nenhuma batida): ${faltas.length} — ${lista(faltas)}`);
  const atrasos = f((d) => d.avaliacao!.atrasoMin !== null);
  if (atrasos.length) out.push(`Atrasos: ${atrasos.length}, somando ${resumo.atrasoTotalMin} min — ${atrasos.map((d) => `${dm(d.dia)} (${d.avaliacao!.atrasoMin} min)`).join(", ")}`);
  const semSaida = f((d) => d.semSaida);
  if (semSaida.length) out.push(`Batida faltando (número ímpar de batidas): ${semSaida.length} — ${lista(semSaida)}`);
  const semInt = f((d) => d.semIntervalo);
  if (semInt.length) out.push(`Sem batida de intervalo em jornada longa: ${semInt.length} — ${lista(semInt)}`);
  const curtos = f((d) => d.avaliacao!.intervaloCurtoMin !== null);
  if (curtos.length) out.push(`Intervalo com menos de 1 hora: ${curtos.length} — ${curtos.map((d) => `${dm(d.dia)} (${d.avaliacao!.intervaloCurtoMin} min)`).join(", ")}`);
  const antecipadas = f((d) => d.saidaAntecipadaMin !== null);
  if (antecipadas.length) out.push(`Saídas antes do horário previsto: ${antecipadas.length} — ${antecipadas.map((d) => `${dm(d.dia)} (${d.saidaAntecipadaMin} min)`).join(", ")}`);
  const semRetorno = f((d) => d.avaliacao!.semRetorno);
  if (semRetorno.length) out.push(`Saiu e não voltou: ${lista(semRetorno)}`);
  const folgas = f((d) => d.folgaTrabalhada);
  if (folgas.length) out.push(`Trabalhou em dia de folga: ${folgas.length} — ${lista(folgas)}`);
  if (resumo.manuais) out.push(`Batidas incluídas manualmente: ${resumo.manuais}`);
  if (resumo.desconsideradas) out.push(`Batidas desconsideradas: ${resumo.desconsideradas}`);
  const dv = f((d) => d.divergencias.length > 0);
  if (dv.length) out.push(`Dias em que o BlackPoke e o Secullum divergem: ${dv.length} — ${lista(dv)}`);
  return out;
}

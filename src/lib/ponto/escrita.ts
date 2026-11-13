// Regras da ESCRITA no Secullum (justificar falta, afastamentos). Funções puras (testadas): decidem o que pode e o que será enviado.
// Nada aqui fala com a rede.

import { AFASTAMENTO_MAX_DIAS, DIAS_PARA_FRENTE_MAX, DIAS_PARA_TRAS_MAX, PALAVRA_DO_FUNCIONARIO_TESTE } from "@/config/escrita";
import { valorDoCampo } from "@/lib/integracoes/secullum";
import { somarDiasData } from "@/lib/vendas/datas";

const HORA = /^\d{1,2}[:.]\d{2}/;
const texto = (x: unknown) => (typeof x === "string" ? x.trim() : "");
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** No modo teste só escreve para quem tem "Teste" como primeira palavra do nome. */
export function liberadoParaEscrita(nome: string, modoTeste: boolean, palavra = PALAVRA_DO_FUNCIONARIO_TESTE): string | null {
  if (!modoTeste) return null;
  const primeira = semAcento(nome.trim()).split(/\s+/)[0] ?? "";
  return primeira === palavra ? null : "Modo teste: por enquanto o app só escreve no Secullum para o funcionário de teste (nome começando com “Teste”).";
}

// ---------------------------------------------------------------- o dia no Secullum

export type EstadoDoDia = {
  batidas: { coluna: string; hora: string }[]; // valores que parecem horário
  justificativas: { grupo: number; coluna: string; texto: string }[]; // texto que não é horário
};

/** Lê a linha agrupada do dia (Entrada1..5/Saida1..5): o que é batida e o que é justificativa (texto). */
export function estadoDoDia(linha: unknown): EstadoDoDia {
  const e: EstadoDoDia = { batidas: [], justificativas: [] };
  if (!linha) return e;
  for (let g = 1; g <= 5; g++) {
    for (const nome of [`Entrada${g}`, `Saida${g}`]) {
      const v = texto(valorDoCampo(linha, nome));
      if (!v) continue;
      if (HORA.test(v)) e.batidas.push({ coluna: nome, hora: v.slice(0, 5) });
      else e.justificativas.push({ grupo: g, coluna: nome, texto: v });
    }
  }
  return e;
}

/** Grupos de colunas (1..5) que o horário do dia usa. folga: o horário do dia é de folga. */
export function gruposDoHorarioDoDia(horario: unknown, diaSemanaSecullum: number): { grupos: number[]; folga: boolean } {
  const dias = valorDoCampo(horario, "Dias");
  const d = Array.isArray(dias) ? dias.find((x) => Number(valorDoCampo(x, "DiaSemana")) === diaSemanaSecullum) : undefined;
  if (!d) return { grupos: [], folga: false };
  const folga = Number(valorDoCampo(d, "TipoDia")) === 2;
  const grupos: number[] = [];
  for (let g = 1; g <= 5; g++) if (HORA.test(texto(valorDoCampo(d, `Entrada${g}`))) || HORA.test(texto(valorDoCampo(d, `Saida${g}`)))) grupos.push(g);
  return { grupos, folga };
}

/** 0 = segunda ... 6 = domingo (como no resto do app). */
export const diaSemanaSecullum = (dia: string) => (new Date(`${dia}T00:00:00Z`).getUTCDay() + 6) % 7;

// ---------------------------------------------------------------- validações

export function validarData(dia: string, hoje: string): string | null {
  if (!DATA.test(dia)) return "Data inválida.";
  if (dia < somarDiasData(hoje, -DIAS_PARA_TRAS_MAX)) return `Só dá para mexer em datas dos últimos ${DIAS_PARA_TRAS_MAX} dias.`;
  if (dia > somarDiasData(hoje, DIAS_PARA_FRENTE_MAX)) return "Data distante demais no futuro.";
  return null;
}

/** Justificar falta de um dia: só dia que já passou (hoje e futuro seguem em aberto). */
export function validarDiaDaFalta(dia: string, hoje: string): string | null {
  const base = validarData(dia, hoje);
  if (base) return base;
  if (dia >= hoje) return "Só dá para justificar falta de um dia que já passou.";
  return null;
}

export function validarPeriodo(inicio: string, fim: string, hoje: string): string | null {
  const a = validarData(inicio, hoje);
  if (a) return a;
  const b = validarData(fim, hoje);
  if (b) return b;
  if (fim < inicio) return "A data final não pode ser antes da inicial.";
  const dias = (Date.parse(`${fim}T00:00:00Z`) - Date.parse(`${inicio}T00:00:00Z`)) / 86400000 + 1;
  if (dias > AFASTAMENTO_MAX_DIAS) return `Afastamento de mais de ${AFASTAMENTO_MAX_DIAS} dias: confira as datas.`;
  return null;
}

export const NOME_ABREVIADO = /^[\p{L}\p{N}._ -]{1,7}$/u;

export type Justificativa = { abreviada: string; completa: string };

/** Justificativas ativas do Secullum, na ordem do nome. */
export function listarJustificativas(brutas: unknown): Justificativa[] {
  if (!Array.isArray(brutas)) return [];
  return brutas
    .filter((j) => valorDoCampo(j, "Desativar") !== true)
    .map((j) => ({ abreviada: texto(valorDoCampo(j, "NomeAbreviado")), completa: texto(valorDoCampo(j, "NomeCompleto")) }))
    .filter((j) => j.abreviada !== "")
    .sort((a, b) => (a.completa || a.abreviada).localeCompare(b.completa || b.abreviada, "pt-BR"));
}

// ---------------------------------------------------------------- corpos enviados

export const corpoJustificar = (cpf: string, dia: string, grupo: number, abreviada: string) => ({ Cpf: cpf, Data: dia, Grupo: grupo, Justificativa: abreviada });
export const corpoApagarColuna = (cpf: string, dia: string, coluna: string, motivo: string) => ({ Cpf: cpf, Data: dia, Coluna: coluna, Motivo: motivo.slice(0, 150) });
export const corpoAfastamento = (cpf: string, inicio: string, fim: string, abreviada: string, motivo: string) => ({ Cpf: cpf, Inicio: inicio, Fim: fim, JustificativaNome: abreviada, ...(motivo ? { Motivo: motivo.slice(0, 100) } : {}) });
export const paramsApagarAfastamento = (cpf: string, inicio: string, fim: string) => ({ dataInicio: inicio, dataFim: fim, funcionarioCpf: cpf });

// ---------------------------------------------------------------- afastamentos já existentes

export type AfastamentoLido = { inicio: string; fim: string; justificativa: string; motivo: string };

export function lerAfastamentos(brutos: unknown): AfastamentoLido[] {
  if (!Array.isArray(brutos)) return [];
  return brutos
    .map((a) => ({ inicio: texto(valorDoCampo(a, "Inicio")).slice(0, 10), fim: texto(valorDoCampo(a, "Fim")).slice(0, 10), justificativa: texto(valorDoCampo(a, "JustificativaNome")), motivo: texto(valorDoCampo(a, "Motivo")) }))
    .filter((a) => DATA.test(a.inicio) && DATA.test(a.fim))
    .sort((a, b) => b.inicio.localeCompare(a.inicio));
}

export const periodosSeSobrepoem = (a: { inicio: string; fim: string }, b: { inicio: string; fim: string }) => a.inicio <= b.fim && b.inicio <= a.fim;

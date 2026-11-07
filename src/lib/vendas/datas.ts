// Datas de caixa (sem fuso). O Brasil está em UTC-3 o ano todo (sem horário de verão).

const MS_DIA = 86400000;
const FORMATO = /^\d{4}-\d{2}-\d{2}$/;

export const dataValida = (d: string) => FORMATO.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));

/** Dia de hoje no Brasil, "2026-11-07". */
export function hojeNoBrasil(agora: Date = new Date()): string {
  return new Date(agora.getTime() - 3 * 3600000).toISOString().slice(0, 10);
}

export function somarDiasData(dia: string, n: number): string {
  return new Date(Date.parse(`${dia}T00:00:00Z`) + n * MS_DIA).toISOString().slice(0, 10);
}

/** Os últimos n dias de caixa terminando em "ate" (inclusive), do mais antigo para o mais novo. */
export function ultimosDias(n: number, ate: string): string[] {
  return Array.from({ length: n }, (_, i) => somarDiasData(ate, i - (n - 1)));
}

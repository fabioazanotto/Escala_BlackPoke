// Formatação de números e datas para a tela de Vendas (pt-BR).

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const inteiro = new Intl.NumberFormat("pt-BR");

export const brl = (n: number) => moeda.format(n);
export const num = (n: number) => inteiro.format(n);

/** Valor curto para eixos: 1.250 -> "1,3 mil", 2.400.000 -> "2,4 mi". */
export function brlCurto(n: number): string {
  const a = Math.abs(n);
  const limpo = (v: number, casas: number) => v.toFixed(casas).replace(/\.0+$/, "").replace(".", ",");
  if (a >= 1_000_000) return `R$ ${limpo(n / 1_000_000, 1)} mi`;
  if (a >= 1_000) return `R$ ${limpo(n / 1_000, a >= 10_000 ? 0 : 1)} mil`;
  return `R$ ${Math.round(n)}`;
}

export const pct = (n: number, casas = 1) => `${n.toFixed(casas).replace(".", ",")}%`;

export const dataBR = (d: string) => d.split("-").reverse().join("/");

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export const diaDaSemana = (d: string) => DIAS[new Date(`${d}T00:00:00Z`).getUTCDay()];
/** "seg 09/11" */
export const diaCurto = (d: string) => `${diaDaSemana(d)} ${d.slice(8, 10)}/${d.slice(5, 7)}`;
/** "nov/26" a partir de "2026-11" */
export const mesCurto = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;

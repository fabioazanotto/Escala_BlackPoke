// Recordes de vendas por loja (melhor dia de caixa em pedidos e em faturamento). Funções puras (testadas).

export type Metrica = "pedidos" | "faturamento";

export type Recorde = {
  id: string;
  lojaId: string;
  metrica: Metrica;
  dia: string; // dia de caixa do recorde
  valor: number;
  anterior: number | null;
  anteriorDia: string | null;
  alerta: boolean; // recorde recente: gera pop-up e faixa
  detectadoEm: string;
};

export type LojaRecorde = { id: string; nome: string; alertarRecordes: boolean };

/** O recorde vigente de cada loja e métrica é o mais recente. Chave: "lojaId|metrica". */
export function vigentes(rs: Recorde[]): Map<string, Recorde> {
  const m = new Map<string, Recorde>();
  for (const r of rs) {
    const k = `${r.lojaId}|${r.metrica}`;
    const atual = m.get(k);
    if (!atual || r.detectadoEm > atual.detectadoEm || (r.detectadoEm === atual.detectadoEm && r.valor > atual.valor)) m.set(k, r);
  }
  return m;
}

export type AlertaLoja = { lojaId: string; lojaNome: string; pedidos: Recorde | null; faturamento: Recorde | null; ids: string[] };

/** Alertas ainda não vistos/dispensados, agrupados por loja. Só conta o recorde vigente (um recorde superado deixa de valer). */
export function agruparAlertas(rs: Recorde[], lojas: LojaRecorde[], jaVistos: Set<string>): AlertaLoja[] {
  const vig = vigentes(rs);
  const out: AlertaLoja[] = [];
  for (const l of lojas) {
    if (!l.alertarRecordes) continue;
    const pedidos = vig.get(`${l.id}|pedidos`) ?? null;
    const faturamento = vig.get(`${l.id}|faturamento`) ?? null;
    const p = pedidos && pedidos.alerta && !jaVistos.has(pedidos.id) ? pedidos : null;
    const f = faturamento && faturamento.alerta && !jaVistos.has(faturamento.id) ? faturamento : null;
    if (!p && !f) continue;
    out.push({ lojaId: l.id, lojaNome: l.nome, pedidos: p, faturamento: f, ids: [p?.id, f?.id].filter((x): x is string => !!x) });
  }
  return out;
}

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** O que a loja bateu: só pedidos, só faturamento ou os dois, com os valores novo e anterior. */
export function descreverAlerta(a: AlertaLoja): { titulo: string; detalhes: string[]; qual: "pedidos" | "faturamento" | "ambos" } {
  const qual = a.pedidos && a.faturamento ? "ambos" : a.pedidos ? "pedidos" : "faturamento";
  const rotulo = qual === "ambos" ? "pedidos e de faturamento" : qual === "pedidos" ? "pedidos" : "faturamento";
  const detalhes: string[] = [];
  if (a.pedidos) detalhes.push(`${Math.round(a.pedidos.valor)} ${Math.round(a.pedidos.valor) === 1 ? "pedido" : "pedidos"} em ${dm(a.pedidos.dia)}${a.pedidos.anterior !== null ? ` (antes: ${Math.round(a.pedidos.anterior)}${a.pedidos.anteriorDia ? ` em ${dm(a.pedidos.anteriorDia)}` : ""})` : ""}`);
  if (a.faturamento) detalhes.push(`${brl(a.faturamento.valor)} de faturamento em ${dm(a.faturamento.dia)}${a.faturamento.anterior !== null ? ` (antes: ${brl(a.faturamento.anterior)}${a.faturamento.anteriorDia ? ` em ${dm(a.faturamento.anteriorDia)}` : ""})` : ""}`);
  return { titulo: `${a.lojaNome} bateu recorde de ${rotulo}!`, detalhes, qual };
}

/** Se o dia mostrado é o recorde da loja (e o valor mostrado é o da loja inteira, sem filtro de canal). */
export function recordesDoDia(vig: Map<string, Recorde>, lojaId: string, dia: string, valores: { pedidos: number; faturamento: number }): { pedidos: boolean; faturamento: boolean } {
  const eh = (m: Metrica, v: number) => {
    const r = vig.get(`${lojaId}|${m}`);
    return !!r && r.dia === dia && v > 0 && v >= r.valor - 0.005;
  };
  return { pedidos: eh("pedidos", valores.pedidos), faturamento: eh("faturamento", valores.faturamento) };
}

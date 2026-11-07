// Totais de vendas por turno e canal. Guardamos só totais: nunca uma venda individual nem dado de cliente.

import type { CanalVenda, VendaResumida } from "@/lib/tipos";

export type PeriodoResumo = "manha" | "tarde" | "noite" | "indefinido";

export type LinhaResumo = {
  periodo: PeriodoResumo;
  canal: CanalVenda;
  pedidos: number; // vendas não canceladas
  cancelados: number;
  bruto: number;
  descontoComercial: number;
  descontoFuncionarios: number;
  taxaEntrega: number;
  liquido: number; // faturamento das vendas não canceladas
  valorCancelado: number;
};

const centavos = (n: number) => Math.round(n * 100) / 100;

/** Agrupa as vendas de um dia por (turno, canal). Venda cancelada não entra no faturamento. */
export function agregarVendas(vendas: VendaResumida[]): LinhaResumo[] {
  const grupos = new Map<string, LinhaResumo>();
  for (const v of vendas) {
    const periodo: PeriodoResumo = v.periodo ?? "indefinido";
    const chave = `${periodo}|${v.canal}`;
    let g = grupos.get(chave);
    if (!g) {
      g = { periodo, canal: v.canal, pedidos: 0, cancelados: 0, bruto: 0, descontoComercial: 0, descontoFuncionarios: 0, taxaEntrega: 0, liquido: 0, valorCancelado: 0 };
      grupos.set(chave, g);
    }
    if (v.cancelada) {
      g.cancelados += 1;
      g.valorCancelado += v.liquido;
      continue;
    }
    g.pedidos += 1;
    g.bruto += v.bruto;
    g.descontoFuncionarios += v.descontoFuncionarios;
    g.descontoComercial += v.desconto - v.descontoFuncionarios;
    g.taxaEntrega += v.taxaEntrega;
    g.liquido += v.liquido;
  }
  return [...grupos.values()]
    .map((g) => ({
      ...g,
      bruto: centavos(g.bruto),
      descontoComercial: centavos(g.descontoComercial),
      descontoFuncionarios: centavos(g.descontoFuncionarios),
      taxaEntrega: centavos(g.taxaEntrega),
      liquido: centavos(g.liquido),
      valorCancelado: centavos(g.valorCancelado),
    }))
    .sort((a, b) => a.periodo.localeCompare(b.periodo) || a.canal.localeCompare(b.canal));
}

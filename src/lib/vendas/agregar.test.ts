import { describe, expect, it } from "vitest";
import { paraVendaResumida, ehDescontoDeFuncionario } from "@/lib/integracoes/xmenu";
import type { VendaResumida } from "@/lib/tipos";
import { agregarVendas } from "./agregar";
import { dataValida, hojeNoBrasil, somarDiasData, ultimosDias } from "./datas";

const v = (extra: Partial<VendaResumida> = {}): VendaResumida => ({
  lojaChave: "pg", saleId: 1, saleGuid: "g", dataCaixa: "2026-11-05", periodo: "noite", canal: "ifood",
  entrega: true, retirada: false, cancelada: false, bruto: 100, desconto: 10, descontoFuncionarios: 0, taxaEntrega: 5, liquido: 95, ...extra,
});

describe("totais por turno e canal", () => {
  it("soma pedidos e valores do mesmo turno e canal", () => {
    const r = agregarVendas([v(), v({ saleId: 2, bruto: 50, desconto: 0, taxaEntrega: 0, liquido: 50 })]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ periodo: "noite", canal: "ifood", pedidos: 2, bruto: 150, descontoComercial: 10, taxaEntrega: 5, liquido: 145 });
  });
  it("separa por turno e por canal, em ordem estável", () => {
    const r = agregarVendas([v({ canal: "balcao" }), v({ periodo: "tarde" }), v({ canal: "xmenu" }), v()]);
    expect(r.map((x) => `${x.periodo}/${x.canal}`)).toEqual(["noite/balcao", "noite/ifood", "noite/xmenu", "tarde/ifood"]);
  });
  it("venda cancelada não entra no faturamento, só na contagem de cancelados", () => {
    const [g] = agregarVendas([v(), v({ saleId: 2, cancelada: true, liquido: 70, bruto: 70 })]);
    expect(g).toMatchObject({ pedidos: 1, cancelados: 1, liquido: 95, bruto: 100, valorCancelado: 70 });
  });
  it("desconto de funcionário fica separado do comercial", () => {
    const [g] = agregarVendas([v({ desconto: 12, descontoFuncionarios: 12 }), v({ saleId: 2, desconto: 5, descontoFuncionarios: 0 })]);
    expect(g).toMatchObject({ descontoFuncionarios: 12, descontoComercial: 5 });
  });
  it("turno ausente vira 'indefinido' e o dia sem vendas não gera linhas", () => {
    expect(agregarVendas([v({ periodo: null })])[0].periodo).toBe("indefinido");
    expect(agregarVendas([])).toEqual([]);
  });
  it("arredonda em centavos, sem sobras de ponto flutuante", () => {
    const r = agregarVendas([v({ liquido: 0.1 }), v({ saleId: 2, liquido: 0.2 })]);
    expect(r[0].liquido).toBe(0.3);
  });
});

describe("desconto de funcionário", () => {
  it("reconhece pelo nome, sem depender de acento ou caixa", () => {
    for (const n of ["30% FUNCIONARIOS", "Funcionário", "desconto funcionarios"]) expect(ehDescontoDeFuncionario(n)).toBe(true);
    for (const n of ["DESCONTO PADRAO", "", null, undefined]) expect(ehDescontoDeFuncionario(n)).toBe(false);
  });
  it("a tradução marca o valor do desconto de funcionário", () => {
    const bruta = { header: { saleId: 1 }, totals: { discountValue: 11.88, totalNet: 27.72 }, discount: { discountName: "30% FUNCIONARIOS", value: 11.88 } };
    expect(paraVendaResumida("pg", bruta)).toMatchObject({ desconto: 11.88, descontoFuncionarios: 11.88 });
    const comum = { header: { saleId: 2 }, totals: { discountValue: 5 }, discount: { discountName: "DESCONTO PADRAO", value: 5 } };
    expect(paraVendaResumida("pg", comum)).toMatchObject({ desconto: 5, descontoFuncionarios: 0 });
  });
});

describe("datas de caixa", () => {
  it("hoje no Brasil acompanha o fuso -03:00", () => {
    expect(hojeNoBrasil(new Date("2026-11-08T02:30:00Z"))).toBe("2026-11-07"); // ainda é 23:30 do dia 7 no Brasil
    expect(hojeNoBrasil(new Date("2026-11-08T03:00:00Z"))).toBe("2026-11-08");
  });
  it("soma dias atravessando mês e ano", () => {
    expect(somarDiasData("2026-11-30", 1)).toBe("2026-12-01");
    expect(somarDiasData("2026-01-01", -1)).toBe("2025-12-31");
    expect(somarDiasData("2028-02-28", 1)).toBe("2028-02-29");
  });
  it("lista os últimos dias, do mais antigo ao mais novo", () => {
    expect(ultimosDias(3, "2026-11-02")).toEqual(["2026-10-31", "2026-11-01", "2026-11-02"]);
    expect(ultimosDias(90, "2026-11-07")).toHaveLength(90);
  });
  it("valida o formato", () => {
    expect(dataValida("2026-11-05")).toBe(true);
    for (const d of ["05/11/2026", "2026-13-40", "2026-11-05T00:00:00", ""]) expect(dataValida(d)).toBe(false);
  });
});

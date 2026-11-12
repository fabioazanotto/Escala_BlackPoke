import { describe, expect, it } from "vitest";
import { agruparAlertas, descreverAlerta, recordesDoDia, vigentes, type LojaRecorde, type Recorde } from "./recordes";

const r = (o: Partial<Recorde> = {}): Recorde => ({ id: "r1", lojaId: "santos", metrica: "pedidos", dia: "2026-11-12", valor: 172, anterior: 167, anteriorDia: "2026-11-06", alerta: true, detectadoEm: "2026-11-13T01:00:00Z", ...o });
const lojas: LojaRecorde[] = [
  { id: "santos", nome: "BlackPoke Santos", alertarRecordes: true },
  { id: "abc", nome: "BlackPoke ABC", alertarRecordes: false },
];

describe("recorde vigente", () => {
  it("é o mais recente de cada loja e métrica", () => {
    const v = vigentes([r({ id: "a", valor: 100, detectadoEm: "2026-01-01T00:00:00Z", alerta: false }), r({ id: "b", valor: 172 }), r({ id: "c", metrica: "faturamento", valor: 13900 })]);
    expect(v.get("santos|pedidos")?.id).toBe("b");
    expect(v.get("santos|faturamento")?.id).toBe("c");
  });
});

describe("alertas", () => {
  it("agrupa pedidos e faturamento da mesma loja e diz que foi nos dois", () => {
    const a = agruparAlertas([r({ id: "p" }), r({ id: "f", metrica: "faturamento", valor: 13900.5, anterior: 13228.59, anteriorDia: "2026-10-09" })], lojas, new Set());
    expect(a).toHaveLength(1);
    expect(a[0].ids).toEqual(["p", "f"]);
    const d = descreverAlerta(a[0]);
    expect(d.qual).toBe("ambos");
    expect(d.titulo).toBe("BlackPoke Santos bateu recorde de pedidos e de faturamento!");
    expect(d.detalhes[0]).toContain("172 pedidos em 12/11 (antes: 167 em 06/11)");
    expect(d.detalhes[1]).toContain("13.900,50");
  });
  it("só pedidos ou só faturamento", () => {
    expect(descreverAlerta(agruparAlertas([r()], lojas, new Set())[0])).toMatchObject({ qual: "pedidos", titulo: "BlackPoke Santos bateu recorde de pedidos!" });
    expect(descreverAlerta(agruparAlertas([r({ metrica: "faturamento", valor: 1 })], lojas, new Set())[0]).qual).toBe("faturamento");
  });
  it("não mostra o que o admin já viu ou dispensou, nem ponto de partida, nem loja fora dos alertas", () => {
    expect(agruparAlertas([r({ id: "p" })], lojas, new Set(["p"]))).toHaveLength(0);
    expect(agruparAlertas([r({ alerta: false })], lojas, new Set())).toHaveLength(0);
    expect(agruparAlertas([r({ lojaId: "abc" })], lojas, new Set())).toHaveLength(0);
  });
  it("visto só um dos dois: mostra o outro", () => {
    const a = agruparAlertas([r({ id: "p" }), r({ id: "f", metrica: "faturamento", valor: 1 })], lojas, new Set(["p"]));
    expect(descreverAlerta(a[0]).qual).toBe("faturamento");
  });
  it("recorde superado por outro mais novo: vale só o novo", () => {
    const a = agruparAlertas([r({ id: "velho", valor: 172 }), r({ id: "novo", valor: 180, detectadoEm: "2026-11-14T01:00:00Z" })], lojas, new Set(["velho"]));
    expect(a[0].pedidos?.id).toBe("novo");
  });
});

describe("emoji no dia do recorde", () => {
  const vig = vigentes([r({ id: "p", valor: 172 }), r({ id: "f", metrica: "faturamento", valor: 13900.5 })]);
  it("só no dia do recorde e com o valor da loja inteira", () => {
    expect(recordesDoDia(vig, "santos", "2026-11-12", { pedidos: 172, faturamento: 13900.5 })).toEqual({ pedidos: true, faturamento: true });
    expect(recordesDoDia(vig, "santos", "2026-11-12", { pedidos: 172, faturamento: 12000 })).toEqual({ pedidos: true, faturamento: false });
    expect(recordesDoDia(vig, "santos", "2026-11-11", { pedidos: 172, faturamento: 13900.5 })).toEqual({ pedidos: false, faturamento: false });
    expect(recordesDoDia(vig, "pg", "2026-11-12", { pedidos: 172, faturamento: 13900.5 })).toEqual({ pedidos: false, faturamento: false });
    expect(recordesDoDia(vig, "santos", "2026-11-12", { pedidos: 100, faturamento: 5000 })).toEqual({ pedidos: false, faturamento: false });
  });
});

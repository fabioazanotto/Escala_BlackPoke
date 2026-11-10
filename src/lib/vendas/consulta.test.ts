import { describe, expect, it } from "vitest";
import { deslocarMeses, diasEntre, filtrar, granularidadeDe, periodoAnterior, periodoDoTipo, serieDoPeriodo, somar, variacao, type LinhaVenda } from "./consulta";

const linha = (o: Partial<LinhaVenda> = {}): LinhaVenda => ({
  lojaChave: "pg", dia: "2026-11-09", periodo: "noite", canal: "balcao", pedidos: 10, cancelados: 1, bruto: 500, descontoComercial: 20, descontoFuncionarios: 30, taxaEntrega: 0, liquido: 450, valorCancelado: 40, ...o,
});

describe("períodos", () => {
  const hoje = "2026-11-10";
  it("ontem, hoje, 7 e 30 dias", () => {
    expect(periodoDoTipo("ontem", hoje)).toMatchObject({ de: "2026-11-09", ate: "2026-11-09" });
    expect(periodoDoTipo("hoje", hoje)).toMatchObject({ de: hoje, ate: hoje });
    expect(periodoDoTipo("7dias", hoje)).toMatchObject({ de: "2026-11-04", ate: hoje });
    expect(periodoDoTipo("30dias", hoje)).toMatchObject({ de: "2026-10-12", ate: hoje });
  });
  it("este mês, mês passado e este ano", () => {
    expect(periodoDoTipo("mes", hoje)).toMatchObject({ de: "2026-11-01", ate: hoje });
    expect(periodoDoTipo("mesPassado", hoje)).toMatchObject({ de: "2026-10-01", ate: "2026-10-31" });
    expect(periodoDoTipo("mesPassado", "2026-03-15")).toMatchObject({ de: "2026-02-01", ate: "2026-02-28" });
    expect(periodoDoTipo("mesPassado", "2026-01-15")).toMatchObject({ de: "2025-12-01", ate: "2025-12-31" });
    expect(periodoDoTipo("ano", hoje)).toMatchObject({ de: "2026-01-01", ate: hoje });
  });
  it("deslocar meses respeita o fim do mês", () => {
    expect(deslocarMeses("2026-03-31", -1)).toBe("2026-02-28");
    expect(deslocarMeses("2026-01-15", -1)).toBe("2025-12-15");
    expect(deslocarMeses("2026-11-10", -12)).toBe("2025-11-10");
  });
  it("comparação: um dia contra o mesmo dia da semana anterior", () => {
    const a = periodoAnterior(periodoDoTipo("ontem", "2026-11-10"));
    expect(a).toMatchObject({ de: "2026-11-02", ate: "2026-11-02" });
    expect(a.rotulo).toContain("semana");
  });
  it("comparação: intervalo contra a mesma quantidade de dias anteriores", () => {
    expect(periodoAnterior(periodoDoTipo("7dias", "2026-11-10"))).toMatchObject({ de: "2026-10-28", ate: "2026-11-03" });
  });
  it("comparação: mês até hoje contra o mesmo trecho do mês passado, e ano contra ano", () => {
    expect(periodoAnterior(periodoDoTipo("mes", "2026-11-10"))).toMatchObject({ de: "2026-10-01", ate: "2026-10-10" });
    expect(periodoAnterior(periodoDoTipo("mesPassado", "2026-11-10"))).toMatchObject({ de: "2026-09-01", ate: "2026-09-30" });
    expect(periodoAnterior(periodoDoTipo("ano", "2026-11-10"))).toMatchObject({ de: "2025-01-01", ate: "2025-11-10" });
  });
  it("conta dias", () => {
    expect(diasEntre("2026-11-01", "2026-11-01")).toBe(1);
    expect(diasEntre("2026-01-01", "2026-12-31")).toBe(365);
  });
});

describe("somas e filtros", () => {
  it("soma e calcula ticket médio", () => {
    const t = somar([linha(), linha({ canal: "ifood", pedidos: 5, liquido: 300.5 })]);
    expect(t).toMatchObject({ pedidos: 15, liquido: 750.5, descontos: 100, cancelados: 2, valorCancelado: 80, ticketMedio: 50.03 });
  });
  it("sem pedidos o ticket médio é zero", () => {
    expect(somar([]).ticketMedio).toBe(0);
  });
  it("filtra por loja e canal; lista vazia = todos", () => {
    const l = [linha(), linha({ lojaChave: "santos" }), linha({ canal: "ifood" })];
    expect(filtrar(l, { lojas: [], canais: [] })).toHaveLength(3);
    expect(filtrar(l, { lojas: ["pg"], canais: [] })).toHaveLength(2);
    expect(filtrar(l, { lojas: ["pg"], canais: ["ifood"] })).toHaveLength(1);
  });
  it("variação percentual", () => {
    expect(variacao(120, 100)).toBe(20);
    expect(variacao(50, 100)).toBe(-50);
    expect(variacao(10, 0)).toBeNull();
  });
});

describe("série do gráfico", () => {
  it("uma barra por dia, inclusive dias sem venda, com a soma por canal", () => {
    const { granularidade, pontos } = serieDoPeriodo([linha({ dia: "2026-11-02", liquido: 100 }), linha({ dia: "2026-11-02", canal: "ifood", liquido: 50 }), linha({ dia: "2026-11-04", liquido: 70 })], "2026-11-01", "2026-11-04");
    expect(granularidade).toBe("dia");
    expect(pontos.map((p) => p.total)).toEqual([0, 150, 0, 70]);
    expect(pontos[1].porCanal).toMatchObject({ balcao: 100, ifood: 50 });
  });
  it("períodos longos viram meses", () => {
    expect(granularidadeDe("2026-01-01", "2026-11-10")).toBe("mes");
    expect(granularidadeDe("2026-08-11", "2026-11-10")).toBe("dia");
    const { pontos } = serieDoPeriodo([linha({ dia: "2026-01-15", liquido: 10 }), linha({ dia: "2026-03-02", liquido: 5 })], "2026-01-01", "2026-11-10");
    expect(pontos).toHaveLength(11);
    expect(pontos[0]).toMatchObject({ chave: "2026-01", total: 10 });
    expect(pontos[2]).toMatchObject({ chave: "2026-03", total: 5 });
  });
});

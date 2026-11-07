import { describe, expect, it } from "vitest";
import { compararImpacto } from "./impacto";
import { avaliarEscala, gerarEscala } from "./motor";
import type { Celulas, EntradaMotor } from "./tipos";

const entrada = (extra: Partial<EntradaMotor> = {}): EntradaMotor => ({
  ano: 2026, mes: 11,
  colaboradores: [
    { id: "a", nome: "Ana", turno: "dia", funcaoPrincipalId: "caixa", funcoesAdicionais: [], admissao: null, desligamento: null },
    { id: "b", nome: "Bia", turno: "dia", funcaoPrincipalId: "caixa", funcoesAdicionais: [], admissao: null, desligamento: null },
  ],
  ausencias: [],
  cobertura: [{ turno: "dia", funcaoId: "caixa", diaSemana: null, ideal: 1, minimoReduzido: null }],
  jornadas: [{ turno: "dia", horaInicio: "09:00", horaFim: "17:20", intervaloMinutos: 60 }],
  feriados: [],
  parametros: { diasFolgaSemanal: [1, 2, 3], domingosPorMes: 1, legais: [] },
  travas: [],
  ...extra,
});

const copiar = (c: Celulas): Celulas => JSON.parse(JSON.stringify(c));

describe("impacto de uma alteração", () => {
  it("avisa quando uma folga a mais deixa o posto descoberto", () => {
    const e = entrada();
    const antes = gerarEscala(e);
    expect(antes.resumo.diasComDeficit).toBe(0);
    const c = copiar(antes.celulas);
    const diaDeFolgaDaAna = antes.dias.find((d) => c.a[d] === "folga")!;
    c.b[diaDeFolgaDaAna] = "folga"; // as duas folgam no mesmo dia: ninguém no caixa
    const impacto = compararImpacto(antes, avaliarEscala(e, c));
    expect(impacto.piora).toHaveLength(1);
    expect(impacto.piora[0].depois.estado).toBe("deficit");
    expect(impacto.piora[0].depois.data).toBe(diaDeFolgaDaAna);
    expect(impacto.melhora).toHaveLength(0);
  });

  it("reconhece a melhora quando o dia volta a ser coberto", () => {
    const e = entrada();
    const base = gerarEscala(e);
    const ruim = copiar(base.celulas);
    const dia = base.dias.find((d) => ruim.a[d] === "folga")!;
    ruim.b[dia] = "folga";
    const piorada = avaliarEscala(e, ruim);
    const impacto = compararImpacto(piorada, base);
    expect(impacto.melhora).toHaveLength(1);
    expect(impacto.piora).toHaveLength(0);
  });

  it("aponta conflito novo com regra trabalhista validada", () => {
    const e = entrada({ parametros: { diasFolgaSemanal: [1, 2, 3], domingosPorMes: 1, legais: [{ chave: "dias_consecutivos_maximos", valor: "6", validado: true }] } });
    const antes = gerarEscala(e);
    expect(antes.regular).toBe(true);
    const c = copiar(antes.celulas);
    for (const d of antes.dias) if (c.a[d] === "folga" || c.a[d] === "domingo") c.a[d] = "trabalha"; // sem nenhuma folga
    const impacto = compararImpacto(antes, avaliarEscala(e, c));
    expect(impacto.novosConflitos.length).toBeGreaterThan(0);
    expect(impacto.novosConflitos[0].codigo).toBe("dias_consecutivos");
  });

  it("sem mudança, não há impacto", () => {
    const e = entrada();
    const antes = gerarEscala(e);
    const impacto = compararImpacto(antes, avaliarEscala(e, copiar(antes.celulas)));
    expect(impacto.piora).toHaveLength(0);
    expect(impacto.melhora).toHaveLength(0);
    expect(impacto.novosConflitos).toHaveLength(0);
  });

  it("avaliar uma escala salva sem a linha de um colaborador novo não quebra", () => {
    const e = entrada();
    const salva = gerarEscala(e).celulas;
    delete salva.b; // colaboradora cadastrada depois de gerar a escala
    const r = avaliarEscala(e, salva);
    expect(r.celulas.b).toBeDefined();
    expect(r.dias.every((d) => r.celulas.b[d] === "trabalha")).toBe(true);
  });
});

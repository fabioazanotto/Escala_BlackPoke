import { describe, expect, it } from "vitest";
import { avaliarEscala, datasDaAlternancia, diasDoMes, gerarEscala } from "./motor";
import type { ColaboradorMotor, EntradaMotor, RegraMotor, ResultadoMotor } from "./tipos";

// Pessoas e funções fictícias, só para teste.
const CAIXA = "f-caixa";
const AJD = "f-ajd";
const davidson: ColaboradorMotor = { id: "davidson", nome: "Davidson", turno: "dia", funcaoPrincipalId: CAIXA, funcoesAdicionais: [], admissao: null, desligamento: null };
const rafaella: ColaboradorMotor = { id: "rafaella", nome: "Rafaella", turno: "noite", funcaoPrincipalId: CAIXA, funcoesAdicionais: [], admissao: null, desligamento: null };

const ALTERNANCIA: RegraMotor = { tipo: "alternancia", colaboradorA: "davidson", colaboradorB: "rafaella", diaA: 6, diaB: 0, ancora: "2026-11-07" };
const DOBRA_A: RegraMotor = { tipo: "dobra", cobreId: "davidson", cobertoId: "rafaella" };
const DOBRA_B: RegraMotor = { tipo: "dobra", cobreId: "rafaella", cobertoId: "davidson" };

const JORNADAS = [
  { turno: "dia" as const, horaInicio: "09:00", horaFim: "17:20", intervaloMinutos: 60 },
  { turno: "noite" as const, horaInicio: "16:00", horaFim: "00:20", intervaloMinutos: 60 },
];

function entrada(regras: RegraMotor[], extra: Partial<EntradaMotor> = {}): EntradaMotor {
  return {
    ano: 2026, mes: 11,
    colaboradores: [davidson, rafaella],
    ausencias: [],
    cobertura: [
      { turno: "dia", funcaoId: CAIXA, diaSemana: null, ideal: 1, minimoReduzido: 1 },
      { turno: "noite", funcaoId: CAIXA, diaSemana: null, ideal: 1, minimoReduzido: 1 },
    ],
    jornadas: JORNADAS, feriados: [],
    parametros: { diasFolgaSemanal: [1, 2, 3], domingosPorMes: 1, legais: [] },
    travas: [], regras, ...extra,
  };
}

const dias = (r: ResultadoMotor, id: string, s: string) => r.dias.filter((d) => r.celulas[id][d] === s).map((d) => Number(d.slice(8)));

describe("alternância de folgas", () => {
  it("calcula as datas: invertem a cada semana a partir da âncora", () => {
    const { a, b } = datasDaAlternancia(ALTERNANCIA as Extract<RegraMotor, { tipo: "alternancia" }>, diasDoMes(2026, 11));
    expect(a.map((d) => Number(d.slice(8)))).toEqual([1, 7, 15, 21, 29]); // sábado 07 é do Davidson
    expect(b.map((d) => Number(d.slice(8)))).toEqual([8, 14, 22, 28]);
  });

  it("vira a folga semanal dos dois, sem outra folga nem outro domingo", () => {
    const r = gerarEscala(entrada([ALTERNANCIA]));
    expect(dias(r, "davidson", "folga")).toEqual([1, 7, 15, 21, 29]);
    expect(dias(r, "rafaella", "folga")).toEqual([8, 14, 22, 28]);
    expect(dias(r, "davidson", "domingo")).toEqual([]);
    expect(dias(r, "rafaella", "domingo")).toEqual([]);
    expect(r.travados).toEqual([]); // fixadas por regra, não travadas à mão
  });

  it("a trava manual do gerente vale mais que a regra", () => {
    const travas = [{ colaboradorId: "davidson", data: "2026-11-07", situacao: "trabalha" as const }];
    const r = gerarEscala(entrada([ALTERNANCIA], { travas }));
    expect(r.celulas.davidson["2026-11-07"]).toBe("trabalha");
  });
});

describe("dobra", () => {
  it("sem a regra de dobra, cada folga de um deixa o caixa do outro turno descoberto", () => {
    const r = gerarEscala(entrada([ALTERNANCIA]));
    expect(r.resumo.diasComDeficit).toBe(9);
    expect(r.resumo.dobras).toBe(0);
  });

  it("com a regra, quem trabalha cobre o posto do outro e a célula vira Dobra", () => {
    const r = gerarEscala(entrada([ALTERNANCIA, DOBRA_A, DOBRA_B]));
    expect(r.resumo.diasComDeficit).toBe(0);
    expect(dias(r, "davidson", "dobra")).toEqual([8, 14, 22, 28]); // nos dias de folga da Rafaella
    expect(dias(r, "rafaella", "dobra")).toEqual([1, 7, 15, 21, 29]); // nos dias de folga do Davidson
    expect(r.resumo.dobras).toBe(9);
    expect(r.dobrasPorColaborador).toEqual({ davidson: 4, rafaella: 5 });
    expect(r.avisos.some((a) => a.includes("Davidson") && a.includes("dobra"))).toBe(true);
  });

  it("não dobra quando o gerente travou a pessoa trabalhando só no turno dela", () => {
    const travas = [{ colaboradorId: "davidson", data: "2026-11-08", situacao: "trabalha" as const }];
    const r = gerarEscala(entrada([ALTERNANCIA, DOBRA_A, DOBRA_B], { travas }));
    expect(r.celulas.davidson["2026-11-08"]).toBe("trabalha");
    expect(r.resumo.dobras).toBe(8);
    expect(r.resumo.diasComDeficit).toBe(1);
  });

  it("avaliar a escala salva dá o mesmo resultado", () => {
    const e = entrada([ALTERNANCIA, DOBRA_A, DOBRA_B]);
    const r = gerarEscala(e);
    const de_novo = avaliarEscala(e, r.celulas);
    expect(de_novo.resumo).toEqual(r.resumo);
  });

  it("é determinística", () => {
    const e = entrada([ALTERNANCIA, DOBRA_A, DOBRA_B]);
    expect(JSON.stringify(gerarEscala(e))).toBe(JSON.stringify(gerarEscala(e)));
  });

  it("dobra viola limites legais só quando eles estão validados", () => {
    const legais = (itens: [string, string][]) => ({ diasFolgaSemanal: [1, 2, 3], domingosPorMes: 1, legais: itens.map(([chave, valor]) => ({ chave, valor, validado: true })) });
    const regras = [ALTERNANCIA, DOBRA_A, DOBRA_B];
    // 9h às 0h20 = 15h20 no local, 13h20 de trabalho efetivo com 2 intervalos de 1h
    expect(gerarEscala(entrada(regras, { parametros: legais([["jornada_maxima_diaria_horas", "10"]]) })).conflitos.filter((c) => c.codigo === "dobra_jornada_diaria")).toHaveLength(2);
    expect(gerarEscala(entrada(regras, { parametros: legais([["jornada_maxima_diaria_horas", "14"]]) })).conflitos.filter((c) => c.codigo === "dobra_jornada_diaria")).toHaveLength(0);
    // depois da dobra o descanso até o turno seguinte é de 8h40
    expect(gerarEscala(entrada(regras, { parametros: legais([["descanso_entre_jornadas_horas", "11"]]) })).conflitos.filter((c) => c.codigo === "dobra_descanso")).toHaveLength(2);
    expect(gerarEscala(entrada(regras, { parametros: legais([["descanso_entre_jornadas_horas", "8"]]) })).conflitos.filter((c) => c.codigo === "dobra_descanso")).toHaveLength(0);
    // sem validação: só aviso, nunca conflito
    expect(gerarEscala(entrada(regras)).regular).toBe(true);
  });

  it("regra que cita alguém que não está ativo é ignorada", () => {
    const r = gerarEscala(entrada([{ tipo: "dobra", cobreId: "fantasma", cobertoId: "davidson" }, { tipo: "folga_fixa", colaboradorId: "fantasma", diasSemana: [1] }]));
    expect(r.resumo.dobras).toBe(0);
  });
});

describe("dia sem funcionamento e folga fixa", () => {
  const equipe: ColaboradorMotor[] = [
    { id: "ana", nome: "Ana", turno: "dia", funcaoPrincipalId: CAIXA, funcoesAdicionais: [], admissao: null, desligamento: null },
    { id: "bia", nome: "Bia", turno: "dia", funcaoPrincipalId: AJD, funcoesAdicionais: [], admissao: null, desligamento: null },
  ];
  const cobertura = [
    { turno: "dia" as const, funcaoId: CAIXA, diaSemana: null, ideal: 1, minimoReduzido: null },
    { turno: "dia" as const, funcaoId: AJD, diaSemana: null, ideal: 1, minimoReduzido: null },
  ];
  const base = (regras: RegraMotor[]) => entrada(regras, { colaboradores: equipe, cobertura });

  it("unidade fechada: não cobra cobertura e a folga coletiva vale como a folga da semana", () => {
    const r = gerarEscala(base([{ tipo: "dia_fechado", data: "2026-11-02", folgaColetiva: true }]));
    expect(r.fechados).toEqual(["2026-11-02"]);
    expect(r.cobertura.filter((x) => x.data === "2026-11-02")).toHaveLength(0);
    for (const id of ["ana", "bia"]) {
      expect(r.celulas[id]["2026-11-02"]).toBe("folga");
      expect(dias(r, id, "folga")).toHaveLength(4); // a coletiva (semana de 2/11) + 3 semanas
      expect(dias(r, id, "folga").filter((d) => d >= 3 && d <= 8)).toEqual([]); // nada mais nessa semana
    }
  });

  it("sem a regra, o mesmo dia seria cobrado", () => {
    const r = gerarEscala(base([]));
    expect(r.cobertura.some((x) => x.data === "2026-11-02")).toBe(true);
  });

  it("folga fixa: a pessoa folga só nos dias da regra", () => {
    const r = gerarEscala(base([{ tipo: "folga_fixa", colaboradorId: "ana", diasSemana: [1] }]));
    expect(dias(r, "ana", "folga")).toEqual([2, 9, 16, 23]); // todas as segundas
    expect(dias(r, "bia", "folga").every((d) => [2, 3, 4, 9, 10, 11, 16, 17, 18, 23, 24, 25].includes(d))).toBe(true);
  });
});

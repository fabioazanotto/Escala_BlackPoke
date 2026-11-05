import { describe, expect, it } from "vitest";
import { avaliarEscala, diasDoMes, gerarEscala, semanasDoMes, sugerirAjustes } from "./motor";
import type { ColaboradorMotor, CoberturaMotor, EntradaMotor, ResultadoMotor } from "./tipos";

// Funções fictícias, só para teste (não são dados reais).
const CAIXA = "f-caixa";
const EXP = "f-exp";
const COZ = "f-coz";
const AJD = "f-ajd";
const SUSHI = "f-sushi";
const AUXSUSHI = "f-auxsushi";

let seq = 0;
function pessoa(nome: string, turno: "dia" | "noite", funcao: string, extra: Partial<ColaboradorMotor> = {}): ColaboradorMotor {
  seq++;
  return { id: `c${seq}-${nome}`, nome, turno, funcaoPrincipalId: funcao, funcoesAdicionais: [], admissao: null, desligamento: null, ...extra };
}
const cob = (turno: "dia" | "noite", funcaoId: string, ideal: number, extra: Partial<CoberturaMotor> = {}): CoberturaMotor => ({
  turno, funcaoId, ideal, diaSemana: null, minimoReduzido: null, ...extra,
});

const JORNADAS = [
  { turno: "dia" as const, horaInicio: "09:00", horaFim: "17:20", intervaloMinutos: 60 },
  { turno: "noite" as const, horaInicio: "16:00", horaFim: "00:20", intervaloMinutos: 60 },
];

function entrada(colaboradores: ColaboradorMotor[], cobertura: CoberturaMotor[], extra: Partial<EntradaMotor> = {}): EntradaMotor {
  return {
    ano: 2026, mes: 11, colaboradores, ausencias: [], cobertura, jornadas: JORNADAS, feriados: [],
    parametros: { diasFolgaSemanal: [1, 2, 3], domingosPorMes: 1, legais: [] }, travas: [], ...extra,
  };
}

// Quadro de uma unidade com 1 pessoa por posto (equipe insuficiente para folgar sem déficit).
function quadroApertado() {
  const equipe = [
    pessoa("Ana", "dia", CAIXA), pessoa("Bia", "dia", AJD), pessoa("Caio", "dia", AJD),
    pessoa("Davi", "noite", CAIXA), pessoa("Edu", "noite", EXP), pessoa("Fabi", "noite", COZ),
    pessoa("Gil", "noite", AJD), pessoa("Hana", "noite", AJD),
  ];
  const cobertura = [
    cob("dia", CAIXA, 1), cob("dia", AJD, 2),
    cob("noite", CAIXA, 1), cob("noite", EXP, 1), cob("noite", COZ, 1), cob("noite", AJD, 2),
  ];
  return { equipe, cobertura };
}

const diaDaSemana = (iso: string) => new Date(`${iso}T12:00:00`).getDay();
const contar = (r: ResultadoMotor, id: string, s: string) => r.dias.filter((d) => r.celulas[id][d] === s).length;

describe("calendário do mês", () => {
  it("trata meses de 28, 29, 30 e 31 dias", () => {
    expect(diasDoMes(2027, 2)).toHaveLength(28);
    expect(diasDoMes(2028, 2)).toHaveLength(29);
    expect(diasDoMes(2026, 4)).toHaveLength(30);
    expect(diasDoMes(2026, 1)).toHaveLength(31);
  });

  it("a semana pertence ao mês com a maior parte de segunda a quarta", () => {
    const nov = semanasDoMes(diasDoMes(2026, 11), [1, 2, 3]).map((s) => s.segunda);
    expect(nov).toEqual(["2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23"]); // 26/10 e 30/11 ficam fora
    expect(semanasDoMes(diasDoMes(2027, 2), [1, 2, 3])).toHaveLength(4);
    expect(semanasDoMes(diasDoMes(2028, 2), [1, 2, 3])).toHaveLength(5); // inclui a semana de 31/01
  });
});

describe("regras de folga", () => {
  const { equipe, cobertura } = quadroApertado();
  const r = gerarEscala(entrada(equipe, cobertura));

  it("dá 1 folga por semana, só de segunda a quarta, e 1 domingo de descanso", () => {
    for (const c of equipe) {
      expect(contar(r, c.id, "folga")).toBe(4);
      expect(contar(r, c.id, "domingo")).toBe(1);
      for (const d of r.dias) {
        if (r.celulas[c.id][d] === "folga") expect([1, 2, 3]).toContain(diaDaSemana(d));
        if (r.celulas[c.id][d] === "domingo") expect(diaDaSemana(d)).toBe(0);
      }
    }
    expect(r.resumo.folgasProgramadas).toBe(32);
    expect(r.resumo.domingosDistribuidos).toBe(8);
  });

  it("é determinística", () => {
    expect(JSON.stringify(gerarEscala(entrada(equipe, cobertura)))).toBe(JSON.stringify(r));
  });

  it("equipe insuficiente: mostra déficits em vez de esconder", () => {
    expect(r.resumo.diasComDeficit).toBeGreaterThan(0);
    expect(r.cobertura.some((x) => x.estado === "deficit")).toBe(true);
  });

  it("funciona em fevereiro de 28 e de 29 dias", () => {
    const f27 = gerarEscala(entrada(equipe, cobertura, { ano: 2027, mes: 2 }));
    const f28 = gerarEscala(entrada(equipe, cobertura, { ano: 2028, mes: 2 }));
    expect(f27.dias).toHaveLength(28);
    expect(f28.dias).toHaveLength(29);
    expect(contar(f27, equipe[0].id, "folga")).toBe(4);
    expect(contar(f28, equipe[0].id, "folga")).toBe(5);
    expect(contar(f27, equipe[0].id, "domingo")).toBe(1);
  });
});

describe("cobertura", () => {
  it("equipe suficiente: nenhum dia com déficit", () => {
    const equipe = [
      pessoa("A", "dia", CAIXA), pessoa("B", "dia", CAIXA),
      pessoa("C", "dia", AJD), pessoa("D", "dia", AJD), pessoa("E", "dia", AJD), pessoa("F", "dia", AJD),
    ];
    const r = gerarEscala(entrada(equipe, [cob("dia", CAIXA, 1), cob("dia", AJD, 2)]));
    expect(r.resumo.diasComDeficit).toBe(0);
    expect(r.resumo.diasCompletos).toBe(30);
  });

  it("separa cobertura reduzida autorizada de déficit", () => {
    const equipe = [pessoa("Sozinha", "dia", CAIXA)];
    const cobertura = [
      cob("dia", CAIXA, 1),
      ...[1, 2, 3].map((d) => cob("dia", CAIXA, 1, { diaSemana: d, minimoReduzido: 0 })),
    ];
    const r = gerarEscala(entrada(equipe, cobertura));
    expect(r.resumo.diasReduzidos).toBe(4); // as 4 folgas, de segunda a quarta
    expect(r.resumo.diasComDeficit).toBe(1); // o domingo de descanso
  });

  it("função adicional só cobre quando autorizada no cadastro", () => {
    const cobertura = [cob("noite", SUSHI, 1)];
    const sushiman = pessoa("Sushiman", "noite", SUSHI);
    const semAutorizacao = gerarEscala(entrada([sushiman, pessoa("Aux", "noite", AUXSUSHI)], cobertura));
    expect(semAutorizacao.resumo.diasComDeficit).toBe(5); // 4 folgas + 1 domingo do sushiman

    const comAutorizacao = gerarEscala(
      entrada([sushiman, pessoa("Aux", "noite", AUXSUSHI, { funcoesAdicionais: [SUSHI] })], cobertura),
    );
    expect(comAutorizacao.resumo.diasComDeficit).toBe(0);
  });

  it("sugere mover folga e dobra, sem aplicar nada", () => {
    const sushiDia = pessoa("SushiDia", "dia", SUSHI);
    const sushiNoite = pessoa("SushiNoite", "noite", SUSHI);
    // O sushiman do dia fica travado trabalhando de segunda a quarta; assim a folga do da noite
    // cai num dia em que o outro está trabalhando.
    const travas = ["02", "03", "04", "09", "10", "11", "16", "17", "18", "23", "24", "25"].map((d) => ({
      colaboradorId: sushiDia.id, data: `2026-11-${d}`, situacao: "trabalha" as const,
    }));
    const e = entrada([sushiDia, sushiNoite], [cob("dia", SUSHI, 1), cob("noite", SUSHI, 1)], { travas });
    const r = gerarEscala(e);
    const dia = r.dias.find((d) => r.celulas[sushiNoite.id][d] === "folga" && r.celulas[sushiDia.id][d] === "trabalha")!;
    const ajustes = sugerirAjustes(e, r, dia, "noite", SUSHI);
    expect(ajustes.map((a) => a.tipo).sort()).toEqual(["dobra", "mover_folga"]);
    expect(r.celulas[sushiDia.id][dia]).toBe("trabalha"); // nada foi alterado
  });
});

describe("ausências, admissão e travas", () => {
  const { equipe, cobertura } = quadroApertado();
  const alvo = equipe[0];

  it("semana inteira de férias dispensa a folga daquela semana", () => {
    const r = gerarEscala(entrada(equipe, cobertura, { ausencias: [{ colaboradorId: alvo.id, tipo: "ferias", inicio: "2026-11-09", fim: "2026-11-15" }] }));
    expect(contar(r, alvo.id, "ferias")).toBe(7);
    expect(contar(r, alvo.id, "folga")).toBe(3);
    expect(r.celulas[alvo.id]["2026-11-15"]).toBe("ferias"); // domingo em férias não vira descanso extra
  });

  it("afastamento no mês todo: sem folga nem domingo", () => {
    const r = gerarEscala(entrada(equipe, cobertura, { ausencias: [{ colaboradorId: alvo.id, tipo: "afastamento", inicio: "2026-11-01", fim: "2026-11-30" }] }));
    expect(contar(r, alvo.id, "afastamento")).toBe(30);
    expect(contar(r, alvo.id, "folga")).toBe(0);
    expect(contar(r, alvo.id, "domingo")).toBe(0);
  });

  it("admissão no meio do mês: dias anteriores ficam fora", () => {
    const nova = { ...alvo, admissao: "2026-11-12" };
    const r = gerarEscala(entrada([nova, ...equipe.slice(1)], cobertura));
    expect(r.celulas[alvo.id]["2026-11-11"]).toBe("fora");
    expect(contar(r, alvo.id, "folga")).toBe(2); // semanas de 16 e 23
    expect(r.dias.filter((d) => r.celulas[alvo.id][d] === "domingo").every((d) => d >= "2026-11-12")).toBe(true);
  });

  it("preserva folgas e domingos travados pelo gerente", () => {
    const travas = [
      { colaboradorId: alvo.id, data: "2026-11-04", situacao: "folga" as const },
      { colaboradorId: alvo.id, data: "2026-11-22", situacao: "domingo" as const },
    ];
    const r = gerarEscala(entrada(equipe, cobertura, { travas }));
    expect(r.celulas[alvo.id]["2026-11-04"]).toBe("folga");
    expect(r.celulas[alvo.id]["2026-11-22"]).toBe("domingo");
    expect(["2026-11-02", "2026-11-03"].every((d) => r.celulas[alvo.id][d] === "trabalha")).toBe(true);
    expect(contar(r, alvo.id, "folga")).toBe(4);
    expect(contar(r, alvo.id, "domingo")).toBe(1);
    expect(r.travados).toContain(`${alvo.id}|2026-11-04`);
  });

  it("feriado não altera a distribuição, só é informado", () => {
    const base = gerarEscala(entrada(equipe, cobertura));
    const r = gerarEscala(entrada(equipe, cobertura, { feriados: ["2026-11-02", "2026-12-25"] }));
    expect(r.feriados).toEqual(["2026-11-02"]);
    expect(r.celulas).toEqual(base.celulas);
  });

  it("nunca muda o turno nem a função de ninguém", () => {
    const r = gerarEscala(entrada(equipe, cobertura));
    expect(Object.keys(r.celulas).sort()).toEqual(equipe.map((c) => c.id).sort());
  });
});

describe("regras trabalhistas", () => {
  const { equipe, cobertura } = quadroApertado();
  const legais = (itens: [string, string | null, boolean][]) =>
    itens.map(([chave, valor, validado]) => ({ chave, valor, validado }));

  it("parâmetro legal sem validação não gera conflito, só aviso", () => {
    const r = gerarEscala(entrada(equipe, cobertura, {
      parametros: { diasFolgaSemanal: [1, 2, 3], domingosPorMes: 1, legais: legais([["descanso_entre_jornadas_horas", null, false]]) },
    }));
    expect(r.regular).toBe(true);
    expect(r.resumo.legaisNaoVerificados).toBe(1);
    expect(r.avisos.some((a) => a.includes("descanso_entre_jornadas_horas"))).toBe(true);
  });

  it("descanso entre jornadas validado: 15h40 nos dois turnos (inclusive o que passa da meia-noite)", () => {
    const parametros = (h: string) => ({ diasFolgaSemanal: [1, 2, 3], domingosPorMes: 1, legais: legais([["descanso_entre_jornadas_horas", h, true]]) });
    expect(gerarEscala(entrada(equipe, cobertura, { parametros: parametros("11") })).regular).toBe(true);
    const r = gerarEscala(entrada(equipe, cobertura, { parametros: parametros("16") }));
    expect(r.regular).toBe(false);
    expect(r.conflitos.filter((c) => c.codigo === "descanso_entre_jornadas")).toHaveLength(2);
  });

  it("máximo de dias seguidos validado é respeitado quando há solução", () => {
    const r = gerarEscala(entrada(equipe, cobertura, {
      parametros: { diasFolgaSemanal: [1, 2, 3], domingosPorMes: 1, legais: legais([["dias_consecutivos_maximos", "6", true]]) },
    }));
    expect(r.conflitos.filter((c) => c.codigo === "dias_consecutivos")).toHaveLength(0);
    expect(r.regular).toBe(true);
  });

  it("uma regra impossível deixa a escala marcada com conflito, nunca regular", () => {
    const r = gerarEscala(entrada(equipe, cobertura, {
      parametros: { diasFolgaSemanal: [1, 2, 3], domingosPorMes: 1, legais: legais([["dias_consecutivos_maximos", "2", true]]) },
    }));
    expect(r.regular).toBe(false);
    expect(r.resumo.conflitos).toBeGreaterThan(0);
  });

  it("jornada semanal e diária validadas", () => {
    const r = gerarEscala(entrada(equipe, cobertura, {
      parametros: { diasFolgaSemanal: [1, 2, 3], domingosPorMes: 1, legais: legais([["jornada_maxima_diaria_horas", "7", true], ["jornada_semanal_horas", "44", true]]) },
    }));
    expect(r.conflitos.filter((c) => c.codigo === "jornada_diaria")).toHaveLength(2); // 7h20 efetivas > 7h
    expect(r.conflitos.filter((c) => c.codigo === "jornada_semanal")).toHaveLength(0); // 6 x 7h20 = 44h
  });

  it("avaliarEscala recalcula uma escala editada à mão", () => {
    const base = gerarEscala(entrada(equipe, cobertura));
    const editada = JSON.parse(JSON.stringify(base.celulas));
    for (const d of base.dias) editada[equipe[0].id][d] = "folga"; // absurdo: folga o mês todo
    const r = avaliarEscala(entrada(equipe, cobertura), editada);
    expect(r.resumo.folgasProgramadas).toBeGreaterThan(base.resumo.folgasProgramadas);
    expect(r.resumo.diasComDeficit).toBeGreaterThan(base.resumo.diasComDeficit);
  });
});

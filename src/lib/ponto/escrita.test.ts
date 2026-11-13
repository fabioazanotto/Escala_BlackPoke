import { describe, expect, it } from "vitest";
import { corpoAfastamento, corpoApagarColuna, corpoJustificar, estadoDoDia, gruposDoHorarioDoDia, lerAfastamentos, liberadoParaEscrita, listarJustificativas, paramsApagarAfastamento, periodosSeSobrepoem, validarDiaDaFalta, validarPeriodo } from "./escrita";

describe("liberadoParaEscrita (modo teste)", () => {
  it("só libera nome que começa com Teste", () => {
    expect(liberadoParaEscrita("Teste", true)).toBeNull();
    expect(liberadoParaEscrita("  TESTE BlackPoke ", true)).toBeNull();
    expect(liberadoParaEscrita("Maria Teste", true)).toMatch(/Modo teste/);
    expect(liberadoParaEscrita("Testemunha Silva", true)).toMatch(/Modo teste/);
  });
  it("fora do modo teste libera todos", () => {
    expect(liberadoParaEscrita("Maria Silva", false)).toBeNull();
  });
});

describe("estadoDoDia", () => {
  it("separa batidas (horário) de justificativas (texto) por grupo", () => {
    const e = estadoDoDia({ Entrada1: "09:00", Saida1: "12:00", Entrada2: "ATEST", Saida2: "ATEST", Entrada3: null });
    expect(e.batidas.map((b) => b.coluna)).toEqual(["Entrada1", "Saida1"]);
    expect(e.justificativas.map((j) => [j.grupo, j.coluna, j.texto])).toEqual([[2, "Entrada2", "ATEST"], [2, "Saida2", "ATEST"]]);
  });
  it("sem linha, nada", () => {
    expect(estadoDoDia(undefined)).toEqual({ batidas: [], justificativas: [] });
  });
});

describe("gruposDoHorarioDoDia", () => {
  const horario = { Dias: [{ DiaSemana: 0, Entrada1: "16:00", Saida1: "17:30", Entrada2: "18:30", Saida2: "00:20", TipoDia: 0 }, { DiaSemana: 1, Entrada1: "09:00", Saida1: "17:20", TipoDia: 0 }, { DiaSemana: 6, TipoDia: 2 }] };
  it("conta os grupos usados e detecta folga", () => {
    expect(gruposDoHorarioDoDia(horario, 0)).toEqual({ grupos: [1, 2], folga: false });
    expect(gruposDoHorarioDoDia(horario, 1)).toEqual({ grupos: [1], folga: false });
    expect(gruposDoHorarioDoDia(horario, 6)).toEqual({ grupos: [], folga: true });
    expect(gruposDoHorarioDoDia(horario, 3)).toEqual({ grupos: [], folga: false });
  });
});

describe("validações de data", () => {
  it("falta: só dia passado e dentro da janela", () => {
    expect(validarDiaDaFalta("2026-11-10", "2026-11-13")).toBeNull();
    expect(validarDiaDaFalta("2026-11-13", "2026-11-13")).toMatch(/já passou/);
    expect(validarDiaDaFalta("2026-11-20", "2026-11-13")).toMatch(/já passou/);
    expect(validarDiaDaFalta("2025-01-01", "2026-11-13")).toMatch(/últimos/);
    expect(validarDiaDaFalta("13/11/2026", "2026-11-13")).toMatch(/inválida/);
  });
  it("período: ordem, tamanho e janela", () => {
    expect(validarPeriodo("2026-11-10", "2026-11-12", "2026-11-13")).toBeNull();
    expect(validarPeriodo("2026-11-12", "2026-11-10", "2026-11-13")).toMatch(/antes da inicial/);
    expect(validarPeriodo("2026-11-01", "2027-12-31", "2026-11-13")).toMatch(/mais de|distante/);
  });
});

describe("corpos enviados ao Secullum", () => {
  it("monta exatamente os campos do manual", () => {
    expect(corpoJustificar("111", "2026-11-10", 2, "ATEST")).toEqual({ Cpf: "111", Data: "2026-11-10", Grupo: 2, Justificativa: "ATEST" });
    expect(corpoApagarColuna("111", "2026-11-10", "Entrada2", "x".repeat(200)).Motivo).toHaveLength(150);
    expect(corpoAfastamento("111", "2026-11-10", "2026-11-12", "ATEST", "")).toEqual({ Cpf: "111", Inicio: "2026-11-10", Fim: "2026-11-12", JustificativaNome: "ATEST" });
    expect(corpoAfastamento("111", "2026-11-10", "2026-11-12", "ATEST", "Consulta").Motivo).toBe("Consulta");
    expect(paramsApagarAfastamento("111", "2026-11-10", "2026-11-12")).toEqual({ dataInicio: "2026-11-10", dataFim: "2026-11-12", funcionarioCpf: "111" });
  });
});

describe("justificativas e afastamentos lidos", () => {
  it("lista só as ativas, em ordem de nome", () => {
    const r = listarJustificativas([{ NomeAbreviado: "FERIAS", NomeCompleto: "Férias" }, { NomeAbreviado: "ATEST", NomeCompleto: "Atestado" }, { NomeAbreviado: "OLD", NomeCompleto: "Antiga", Desativar: true }]);
    expect(r.map((j) => j.abreviada)).toEqual(["ATEST", "FERIAS"]);
  });
  it("lê afastamentos e detecta sobreposição", () => {
    const l = lerAfastamentos([{ Inicio: "2026-11-10T00:00:00", Fim: "2026-11-12T00:00:00", JustificativaNome: "ATEST", Motivo: "x" }, { Inicio: "lixo", Fim: "2026-11-12" }]);
    expect(l).toEqual([{ inicio: "2026-11-10", fim: "2026-11-12", justificativa: "ATEST", motivo: "x" }]);
    expect(periodosSeSobrepoem({ inicio: "2026-11-12", fim: "2026-11-14" }, l[0])).toBe(true);
    expect(periodosSeSobrepoem({ inicio: "2026-11-13", fim: "2026-11-14" }, l[0])).toBe(false);
  });
});

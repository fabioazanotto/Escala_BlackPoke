import { describe, expect, it } from "vitest";
import { colunasDoDia, horaValida, montarMotivo, planoBatidaManual, rotuloColuna, analisarVisibilidade, corpoAfastamento, formatosDataInclusao, corpoApagarColuna, corpoJustificar, estadoDoDia, gruposDoHorarioDoDia, lerAfastamentos, liberadoParaEscrita, listarJustificativas, paramsApagarAfastamento, periodosSeSobrepoem, validarDiaDaFalta, validarPeriodo, validarVinculo } from "./escrita";

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
    expect(corpoAfastamento("111", "2026-11-10", "2026-11-12", "ATEST", "", "2026-11-17T14:05:00")).toEqual({ Cpf: "111", Inicio: "2026-11-10", Fim: "2026-11-12", JustificativaNome: "ATEST", DataInclusao: "2026-11-17T14:05:00" });
    expect(corpoAfastamento("111", "2026-11-10", "2026-11-12", "ATEST", "Consulta", "x").Motivo).toBe("Consulta");
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

describe("validarVinculo", () => {
  it("recusa dia antes da admissão ou depois da demissão", () => {
    expect(validarVinculo("2026-11-01", "2026-11-14", null)).toContain("antes da admissão do funcionário (14/11/2026)");
    expect(validarVinculo("2026-11-20", "2026-01-01", "2026-11-10")).toContain("depois da demissão");
    expect(validarVinculo("2026-11-15", "2026-11-14", null)).toBeNull();
    expect(validarVinculo("2026-11-15", null, null)).toBeNull();
  });
});

describe("analisarVisibilidade", () => {
  const projeto = [{ empresaId: 1, nome: "EMP SANTOS" }, { empresaId: 2, nome: "EMP ABC" }];
  it("aponta empresa do projeto que a conta não enxerga e se o funcionário de teste aparece", () => {
    const v = analisarVisibilidade(projeto, [{ Id: 1, Nome: "EMP SANTOS" }], [{ Nome: "Maria Silva" }]);
    expect(v).toEqual({ empresasVisiveis: ["EMP SANTOS"], empresasDoProjetoQueNaoEnxerga: ["EMP ABC"], funcionarios: 1, testeVisivel: false });
  });
  it("conta que enxerga tudo", () => {
    const v = analisarVisibilidade(projeto, [{ Id: 1, Nome: "A" }, { Id: 2, Nome: "B" }], [{ Nome: "teste" }, { Nome: "Ana" }]);
    expect(v.empresasDoProjetoQueNaoEnxerga).toEqual([]);
    expect(v.testeVisivel).toBe(true);
    expect(v.funcionarios).toBe(2);
  });
});

describe("formatosDataInclusao", () => {
  it("tenta data e hora e depois só a data", () => {
    expect(formatosDataInclusao({ data: "2026-11-17", minutos: 14 * 60 + 5 })).toEqual(["2026-11-17T14:05:00", "2026-11-17"]);
    expect(formatosDataInclusao({ data: "2026-11-17", minutos: 9 })).toEqual(["2026-11-17T00:09:00", "2026-11-17"]);
  });
});

describe("batida manual", () => {
  it("rótulos, hora e motivo", () => {
    expect(rotuloColuna("Entrada2")).toBe("Entrada 2");
    expect(rotuloColuna("Saida1")).toBe("Saída 1");
    expect(horaValida("16:05")).toBe(true);
    expect(horaValida("24:00")).toBe(false);
    expect(horaValida("9:5")).toBe(false);
    expect(montarMotivo("Esqueceu de bater", "")).toEqual({ motivo: "Esqueceu de bater" });
    expect(montarMotivo("Erro no relógio", "ponto virtual fora do ar")).toEqual({ motivo: "Erro no relógio: ponto virtual fora do ar" });
    expect(montarMotivo("Outro", "  Saiu mais cedo  ")).toEqual({ motivo: "Saiu mais cedo" });
    expect(montarMotivo("Outro", "")).toEqual({ erro: "Escreva o motivo." });
    expect(montarMotivo("", "x")).toEqual({ erro: "Escolha o motivo." });
    expect("motivo" in montarMotivo("Outro", "x".repeat(300)) && (montarMotivo("Outro", "x".repeat(300)) as { motivo: string }).motivo.length).toBe(150);
  });

  const linha = { Entrada1: "09:58", Saida1: "17:11", Entrada2: "ATEST", FonteDadosEntrada1: { Tipo: 0 }, FonteDadosSaida1: { Tipo: 1 } };
  it("lê as colunas e o tipo de cada uma", () => {
    const c = colunasDoDia(linha);
    expect(c).toHaveLength(10);
    expect(c.slice(0, 4).map((x) => [x.tipo, x.valor])).toEqual([["original", "09:58"], ["manual", "17:11"], ["justificativa", "ATEST"], ["vazia", ""]]);
  });
  it("coluna com batida original é recusada; vazia inclui; manual edita; justificativa substitui (com aviso)", () => {
    const c = colunasDoDia(linha);
    expect(planoBatidaManual(c, "Entrada1", "10:00")).toMatchObject({ erro: expect.stringContaining("batida original") });
    expect(planoBatidaManual(c, "Saida2", "19:08")).toMatchObject({ acao: "incluir" });
    expect(planoBatidaManual(c, "Saida1", "17:20")).toMatchObject({ acao: "editar" });
    const sub = planoBatidaManual(c, "Entrada2", "18:30");
    expect(sub).toMatchObject({ acao: "substituir" });
    expect((sub as { avisos: string[] }).avisos.join()).toContain("justificativa ATEST");
  });
  it("avisa ordem trocada e possível duplicada; trata madrugada como depois da noite", () => {
    const c = colunasDoDia({ Entrada1: "16:00", Saida1: "17:30", FonteDadosEntrada1: { Tipo: 0 }, FonteDadosSaida1: { Tipo: 0 } });
    const antes = planoBatidaManual(c, "Entrada2", "17:00") as { avisos: string[] };
    expect(antes.avisos.join()).toContain("Fora de ordem");
    const perto = planoBatidaManual(c, "Entrada2", "17:35") as { avisos: string[] };
    expect(perto.avisos.join()).toContain("duplicada");
    const madrugada = colunasDoDia({ Entrada1: "16:00", Saida1: "17:30", Entrada2: "18:30", FonteDadosEntrada1: { Tipo: 0 }, FonteDadosSaida1: { Tipo: 0 }, FonteDadosEntrada2: { Tipo: 0 } });
    expect((planoBatidaManual(madrugada, "Saida2", "00:20") as { avisos: string[] }).avisos).toEqual([]);
  });
  it("coluna e hora inválidas", () => {
    expect(planoBatidaManual(colunasDoDia({}), "Xpto", "10:00")).toEqual({ erro: "Escolha a coluna." });
    expect(planoBatidaManual(colunasDoDia({}), "Entrada1", "25:00")).toEqual({ erro: "Informe a hora no formato HH:mm." });
  });
});

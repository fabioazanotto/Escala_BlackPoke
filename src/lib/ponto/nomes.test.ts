import { describe, expect, it } from "vitest";
import { formatarNomeCompleto, propor } from "./nomes";

describe("nome completo", () => {
  it("nome todo em maiúsculas vira capitalizado, com as partículas em minúsculas", () => {
    expect(formatarNomeCompleto("LENILTON GOMES DE SÁ")).toBe("Lenilton Gomes de Sá");
    expect(formatarNomeCompleto("  MARIA  DAS DORES  E SILVA ")).toBe("Maria das Dores e Silva");
  });
  it("nome que já tem minúsculas não é mexido", () => {
    expect(formatarNomeCompleto("Davidson Alves Pinto")).toBe("Davidson Alves Pinto");
    expect(formatarNomeCompleto("DaVidson  Alves")).toBe("DaVidson Alves");
  });
});

describe("proposta", () => {
  const base = { colaboradorId: "c1", nomeCurto: "Lenilto", nomeCompletoAtual: null, empresaAtual: null, nomeSecullum: "LENILTON GOMES", empresaSecullum: "B. P COMERCIO DE ALIMENTOS " };
  it("preenche o que falta e marca como mudança", () => {
    const [p] = propor([base]);
    expect(p).toMatchObject({ nomeCompletoNovo: "Lenilton Gomes", empresaNova: "B. P COMERCIO DE ALIMENTOS", muda: true });
  });
  it("não propõe nada quando já está igual", () => {
    const [p] = propor([{ ...base, nomeCompletoAtual: "Lenilton Gomes", empresaAtual: "B. P COMERCIO DE ALIMENTOS" }]);
    expect(p.muda).toBe(false);
  });
  it("a empresa mudar (transferência) também é mudança", () => {
    const [p] = propor([{ ...base, nomeCompletoAtual: "Lenilton Gomes", empresaAtual: "OUTRA EMPRESA" }]);
    expect(p.muda).toBe(true);
  });
  it("o nome curto nunca entra na proposta de gravação", () => {
    const [p] = propor([base]);
    expect(Object.keys(p)).not.toContain("nome");
  });
});

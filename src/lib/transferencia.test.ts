import { describe, expect, it } from "vitest";
import { avisosDaTransferencia, mesesComDiasAposData, regrasQueCitam, validarTransferencia } from "./transferencia";

const linha = (data: string, situacao: string, status = "publicada") => ({ data, situacao, ano: Number(data.slice(0, 4)), mes: Number(data.slice(5, 7)), status });

describe("mesesComDiasAposData", () => {
  it("conta só dias de trabalho a partir da data, por mês", () => {
    const r = mesesComDiasAposData([linha("2026-11-10", "trabalha"), linha("2026-11-12", "trabalha"), linha("2026-11-13", "folga"), linha("2026-11-20", "dobra"), linha("2026-12-02", "trabalha", "rascunho")], "2026-11-12");
    expect(r).toEqual([{ mes: "2026-11", dias: 2, status: "publicada" }, { mes: "2026-12", dias: 1, status: "rascunho" }]);
  });
  it("sem dias a partir da data, lista vazia", () => {
    expect(mesesComDiasAposData([linha("2026-11-01", "trabalha")], "2026-11-12")).toEqual([]);
  });
});

describe("regrasQueCitam", () => {
  it("acha regra que cita o id do colaborador", () => {
    const regras = [{ id: "r1", tipo: "folga_fixa", nome: "Folga do Ana", parametros: { colaboradorId: "c1", dia: 2 } }, { id: "r2", tipo: "dia_fechado", nome: "Segunda fechada", parametros: { dia: 1 } }];
    expect(regrasQueCitam(regras, "c1").map((r) => r.id)).toEqual(["r1"]);
    expect(regrasQueCitam(regras, "c9")).toEqual([]);
  });
});

describe("validarTransferencia", () => {
  const ok = { origem: "u1", destino: "u2", funcao: "f1", turno: "dia", data: "2026-11-25" };
  it("aceita o pedido completo", () => expect(validarTransferencia(ok)).toBeNull());
  it("recusa o que falta ou não faz sentido", () => {
    expect(validarTransferencia({ ...ok, destino: "" })).toMatch(/destino/);
    expect(validarTransferencia({ ...ok, destino: "u1" })).toMatch(/já está/);
    expect(validarTransferencia({ ...ok, funcao: "" })).toMatch(/função/);
    expect(validarTransferencia({ ...ok, turno: "" })).toMatch(/turno/);
    expect(validarTransferencia({ ...ok, data: "25/11/2026" })).toMatch(/data/i);
  });
});

describe("avisosDaTransferencia", () => {
  it("monta um aviso por assunto e nada quando não há o que avisar", () => {
    expect(avisosDaTransferencia({ meses: [], funcoesAdicionais: 0, regras: [], matriculaRepetida: false })).toEqual([]);
    const a = avisosDaTransferencia({ meses: [{ mes: "2026-11", dias: 5, status: "publicada" }], funcoesAdicionais: 2, regras: [{ id: "r", tipo: "folga_fixa", nome: "Folga fixa", parametros: {} }], matriculaRepetida: true });
    expect(a).toHaveLength(4);
    expect(a[0]).toContain("5 dia(s)");
    expect(a[0]).toContain("11/2026");
    expect(a[0]).toContain("publicada");
  });
});

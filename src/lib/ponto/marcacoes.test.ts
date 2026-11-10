import { describe, expect, it } from "vitest";
import { hashDaMarcacao, normalizarMarcacao, traduzirLote } from "./marcacoes";

const incluidos = new Map([[10, 3]]); // funcionário 10, empresa 3
const bruto = (o: Record<string, unknown> = {}) => ({
  Id: 500, Data: "2026-11-09T00:00:00", EquipamentoId: 2, Hora: "16:04", FuncionarioId: 10, FuncionarioPis: "12345678901", FuncionarioCpf: "99999999999",
  Tipo: 0, Origem: 4, Motivo: null, DataInclusao: "2026-11-09T16:04:10", ...o,
});

describe("normalização de batidas", () => {
  it("traduz, descarta CPF e PIS e guarda a origem bruta", () => {
    const r = normalizarMarcacao(bruto({ Origem: 16 }), incluidos);
    expect("marcacao" in r).toBe(true);
    if (!("marcacao" in r)) return;
    expect(r.marcacao).toMatchObject({ fonte_id: 500, secullum_funcionario_id: 10, secullum_empresa_id: 3, data: "2026-11-09", hora: "16:04", tipo: 0, origem: 16, equipamento_id: 2 });
    const texto = JSON.stringify(r.marcacao);
    expect(texto).not.toContain("99999999999");
    expect(texto).not.toContain("12345678901");
  });

  it("descarta funcionário de empresa fora do projeto e registros incompletos", () => {
    expect(normalizarMarcacao(bruto({ FuncionarioId: 77 }), incluidos)).toEqual({ descartada: "fora_do_projeto" });
    expect(normalizarMarcacao(bruto({ Hora: null }), incluidos)).toEqual({ descartada: "incompleta" });
    expect(normalizarMarcacao(bruto({ Data: "ontem" }), incluidos)).toEqual({ descartada: "incompleta" });
    expect(normalizarMarcacao(bruto({ Id: undefined }), incluidos)).toEqual({ descartada: "incompleta" });
  });

  it("hora que cruza a meia-noite não é convertida", () => {
    const r = normalizarMarcacao(bruto({ Hora: "00:20" }), incluidos);
    if (!("marcacao" in r)) throw new Error();
    expect(r.marcacao.hora).toBe("00:20");
    expect(r.marcacao.data).toBe("2026-11-09");
  });

  it("o hash muda quando um campo relevante muda (batida desconsiderada) e não muda por campo irrelevante", () => {
    const a = normalizarMarcacao(bruto(), incluidos);
    const b = normalizarMarcacao(bruto({ Tipo: 3 }), incluidos);
    const c = normalizarMarcacao(bruto({ FuncionarioCpf: "00000000000" }), incluidos);
    if (!("marcacao" in a) || !("marcacao" in b) || !("marcacao" in c)) throw new Error();
    expect(a.marcacao.hash).not.toBe(b.marcacao.hash);
    expect(a.marcacao.hash).toBe(c.marcacao.hash);
    const { hash, ...resto } = a.marcacao;
    expect(hashDaMarcacao(resto)).toBe(hash);
  });

  it("lote: conta o que foi descartado", () => {
    const l = traduzirLote([bruto(), bruto({ Id: 501, FuncionarioId: 99 }), bruto({ Id: 502, Hora: undefined })], incluidos);
    expect(l.marcacoes).toHaveLength(1);
    expect(l.foraDoProjeto).toBe(1);
    expect(l.incompletas).toBe(1);
  });
});

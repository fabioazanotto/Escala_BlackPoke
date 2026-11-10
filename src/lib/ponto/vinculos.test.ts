import { describe, expect, it } from "vitest";
import type { FuncionarioSecullum } from "./conferencia";
import { lerPedido, validarVinculo } from "./vinculos";

const f = (o: Partial<FuncionarioSecullum> = {}): FuncionarioSecullum => ({ id: 7, nome: "X", cpf: "", empresaId: 1, empresaNome: "E", ativo: true, admissao: null, demissao: null, horarioId: 1, departamento: "", funcao: "", ...o });
const ID = "123e4567-e89b-12d3-a456-426614174000";

describe("pedido de vínculo", () => {
  it("aceita só UUID e número inteiro positivo", () => {
    expect(lerPedido({ colaboradorId: ID, funcionarioId: 7 })).toEqual({ colaboradorId: ID, funcionarioId: 7 });
    expect(lerPedido({ colaboradorId: "x", funcionarioId: 7 })).toBeNull();
    expect(lerPedido({ colaboradorId: ID, funcionarioId: "7" })).toBeNull();
    expect(lerPedido({ colaboradorId: ID, funcionarioId: -1 })).toBeNull();
    expect(lerPedido({ colaboradorId: ID, funcionarioId: 1.5 })).toBeNull();
    expect(lerPedido(null)).toBeNull();
  });
});

describe("validação ao vivo", () => {
  const pedido = { colaboradorId: ID, funcionarioId: 7 };
  it("aceita ativo de empresa incluída", () => {
    expect(validarVinculo(pedido, [f()], { ativo: true }).ok).toBe(true);
  });
  it("recusa funcionário fora das empresas incluídas, desligado ou colaborador inativo/inexistente", () => {
    expect(validarVinculo(pedido, [], { ativo: true })).toMatchObject({ ok: false });
    expect(validarVinculo(pedido, [f({ ativo: false })], { ativo: true })).toMatchObject({ ok: false, motivo: expect.stringContaining("desligado") });
    expect(validarVinculo(pedido, [f()], { ativo: false })).toMatchObject({ ok: false, motivo: expect.stringContaining("inativo") });
    expect(validarVinculo(pedido, [f()], null)).toMatchObject({ ok: false });
  });
});

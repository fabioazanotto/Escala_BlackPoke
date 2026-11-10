// Regras para confirmar um vínculo colaborador x funcionário do Secullum. Funções puras.

import type { FuncionarioSecullum } from "./conferencia";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PedidoVinculo = { colaboradorId: string; funcionarioId: number };

export function lerPedido(corpo: unknown): PedidoVinculo | null {
  if (!corpo || typeof corpo !== "object") return null;
  const { colaboradorId, funcionarioId } = corpo as Record<string, unknown>;
  if (typeof colaboradorId !== "string" || !UUID.test(colaboradorId)) return null;
  if (typeof funcionarioId !== "number" || !Number.isInteger(funcionarioId) || funcionarioId <= 0) return null;
  return { colaboradorId, funcionarioId };
}

/**
 * Confere, com os dados ao vivo, se o vínculo faz sentido. `funcionarios` já vem filtrado para as empresas incluídas no projeto:
 * quem não está na lista pertence a uma empresa fora do projeto (ou não existe) e é recusado.
 */
export function validarVinculo(pedido: PedidoVinculo, funcionarios: FuncionarioSecullum[], colaborador: { ativo: boolean } | null): { ok: true; funcionario: FuncionarioSecullum } | { ok: false; motivo: string } {
  if (!colaborador) return { ok: false, motivo: "Colaborador não encontrado (ou sem permissão)." };
  const f = funcionarios.find((x) => x.id === pedido.funcionarioId);
  if (!f) return { ok: false, motivo: "Esse funcionário não existe nas empresas incluídas no projeto." };
  if (!f.ativo) return { ok: false, motivo: "Esse funcionário está desligado no Secullum." };
  if (!colaborador.ativo) return { ok: false, motivo: "Esse colaborador está inativo no BlackPoke." };
  return { ok: true, funcionario: f };
}

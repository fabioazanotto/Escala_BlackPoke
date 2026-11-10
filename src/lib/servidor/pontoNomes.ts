// Proposta (e aplicação) de nome completo e empresa para os colaboradores VINCULADOS ao Secullum. Só no servidor.
// O Secullum só é lido. A gravação é no cadastro do BlackPoke (colunas nome_completo e empresa), nunca no nome curto.

import type { SupabaseClient } from "@supabase/supabase-js";
import { propor, type PropostaNome } from "@/lib/ponto/nomes";
import { comCache } from "./cacheCurto";
import { carregarContexto, traduzirFuncionarios } from "./pontoDados";

const lista = (x: unknown) => (Array.isArray(x) ? x : []);

export async function propostasDeNomes(db: SupabaseClient): Promise<PropostaNome[]> {
  const { contexto } = await comCache("contexto", 10 * 60000, () => carregarContexto(db));
  const brutos = await contexto.sessao.obter("Funcionarios"); // sem cache: é uma ação pontual e confirma com o dado atual
  const funcionarios = new Map(traduzirFuncionarios(lista(brutos), contexto.empresas).funcionarios.map((f) => [f.id, f]));

  const { data: vincs } = await db.from("colaborador_ponto_ids").select("colaborador_id, secullum_funcionario_id").eq("banco_id", contexto.bancoId).is("vigencia_fim", null);
  const ids = (vincs ?? []).map((v) => v.colaborador_id as string);
  if (ids.length === 0) return [];
  const { data: colabs, error } = await db.from("colaboradores").select("id, nome, nome_completo, empresa").in("id", ids);
  if (error) throw new Error(error.message);
  const colabPorId = new Map((colabs ?? []).map((c) => [c.id as string, c]));

  const pares = [];
  for (const v of vincs ?? []) {
    const f = funcionarios.get(Number(v.secullum_funcionario_id));
    const c = colabPorId.get(v.colaborador_id as string);
    if (!f || !c) continue;
    pares.push({
      colaboradorId: c.id as string,
      nomeCurto: String(c.nome),
      nomeCompletoAtual: (c.nome_completo as string | null) ?? null,
      empresaAtual: (c.empresa as string | null) ?? null,
      nomeSecullum: f.nome,
      empresaSecullum: f.empresaNome,
    });
  }
  return propor(pares);
}

/** Grava só as propostas que mudam (e, se vierem ids, só as desses colaboradores). A proposta é recalculada aqui: o cliente não manda nomes. */
export async function aplicarNomes(db: SupabaseClient, ids?: string[]): Promise<{ atualizados: number }> {
  const propostas = (await propostasDeNomes(db)).filter((p) => p.muda && (!ids || ids.includes(p.colaboradorId)));
  let atualizados = 0;
  for (const p of propostas) {
    const { error } = await db.from("colaboradores").update({ nome_completo: p.nomeCompletoNovo, empresa: p.empresaNova }).eq("id", p.colaboradorId);
    if (error) throw new Error(`Não consegui atualizar ${p.nomeCurto}: ${error.message}`);
    atualizados += 1;
  }
  return { atualizados };
}

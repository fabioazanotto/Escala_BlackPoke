// Liga a sincronização de batidas ao Secullum (somente leitura) e ao banco (chave de serviço). Só no servidor.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AmbienteSync, TipoSync } from "@/lib/ponto/sincronizacao";
import { hojeNoBrasil } from "@/lib/vendas/datas";
import { carregarContexto, traduzirFuncionarios } from "./pontoDados";

const lista = (x: unknown) => (Array.isArray(x) ? x : []);
const LOTE_RPC = 1000;
const TRAVA_VENCE_MIN = 10;

export async function ambientePonto(db: SupabaseClient, origem: "automatica" | "manual"): Promise<AmbienteSync> {
  const { contexto } = await carregarContexto(db);
  const { bancoId, sessao, empresas } = contexto;

  return {
    hoje: () => hojeNoBrasil(),

    funcionariosIncluidos: async () => {
      const { funcionarios } = traduzirFuncionarios(lista(await sessao.obter("Funcionarios")), empresas);
      return new Map(funcionarios.map((f) => [f.id, f.empresaId]));
    },

    lerPorPeriodo: async (de, ate) => lista(await sessao.obter("FonteDados", { dataInicio: de, dataFim: ate })),
    lerAPartirDoId: async (id) => lista(await sessao.obter("FonteDados/APartirDoId", { fonteDadosId: id })),

    gravar: async (marcacoes, janela) => {
      const total = { novas: 0, alteradas: 0, iguais: 0, removidas: 0 };
      // Com janela (reprocesso), tudo vai de uma vez: a remoção compara o lote inteiro com o que está guardado.
      const lotes = janela ? [marcacoes] : Array.from({ length: Math.ceil(marcacoes.length / LOTE_RPC) }, (_, i) => marcacoes.slice(i * LOTE_RPC, (i + 1) * LOTE_RPC));
      for (const lote of lotes) {
        const { data, error } = await db.rpc("ponto_gravar_marcacoes", { p_banco: bancoId, p_linhas: lote, p_de: janela?.de ?? null, p_ate: janela?.ate ?? null });
        if (error) throw new Error(`Não consegui gravar as batidas: ${error.message}`);
        const c = data as { novas: number; alteradas: number; iguais: number; removidas: number };
        total.novas += c.novas;
        total.alteradas += c.alteradas;
        total.iguais += c.iguais;
        total.removidas += c.removidas;
      }
      return total;
    },

    lerCursor: async () => {
      const { data } = await db.from("ponto_bancos").select("ultimo_fonte_id").eq("id", bancoId).maybeSingle();
      const v = data?.ultimo_fonte_id;
      return v === null || v === undefined ? null : Number(v);
    },
    gravarCursor: async (id) => {
      const { error } = await db.from("ponto_bancos").update({ ultimo_fonte_id: id }).eq("id", bancoId);
      if (error) throw new Error(`Não consegui guardar o ponto de leitura: ${error.message}`);
    },

    iniciar: async (tipo: TipoSync, de, ate) => {
      // Rodada que ficou "rodando" por mais de 10 minutos morreu no meio (tempo esgotado): libera a trava.
      const limite = new Date(Date.now() - TRAVA_VENCE_MIN * 60000).toISOString();
      await db.from("ponto_sincronizacoes").update({ status: "erro", mensagem: "Interrompida (tempo esgotado).", concluido_em: new Date().toISOString() }).eq("banco_id", bancoId).eq("status", "rodando").lt("iniciado_em", limite);
      const { data, error } = await db.from("ponto_sincronizacoes").insert({ banco_id: bancoId, tipo, origem, data_de: de, data_ate: ate }).select("id").single();
      if (error) {
        if (error.code === "23505") return null; // já existe uma rodada em andamento
        throw new Error(`Não consegui registrar a sincronização: ${error.message}`);
      }
      return { id: data.id as string };
    },

    concluir: async (r, d) => {
      await db
        .from("ponto_sincronizacoes")
        .update({ status: d.status, lidas: d.lidas ?? 0, descartadas: d.descartadas ?? 0, novas: d.novas ?? 0, alteradas: d.alteradas ?? 0, removidas: d.removidas ?? 0, mensagem: d.mensagem ?? null, concluido_em: new Date().toISOString() })
        .eq("id", r.id);
    },
  };
}

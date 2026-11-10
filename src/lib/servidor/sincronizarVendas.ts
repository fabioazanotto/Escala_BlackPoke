// Liga a sincronização de vendas ao Xmenu e ao banco de verdade. Roda só no servidor.

import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarVendasCaixaFechado, limitesDoDiaDeCaixa, tokenDaLoja } from "@/lib/integracoes/xmenu";
import { hojeNoBrasil } from "@/lib/vendas/datas";
import type { Ambiente } from "@/lib/vendas/sincronizar";

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
const PAUSA_ENTRE_CONSULTAS_MS = 300; // o Xmenu limita chamadas: vamos com calma

export function ambienteReal(db: SupabaseClient): Ambiente {
  const idDaLoja = new Map<string, string>();

  async function lojaId(chave: string): Promise<string> {
    const em = idDaLoja.get(chave);
    if (em) return em;
    const { data, error } = await db.from("lojas_xmenu").select("id").eq("chave", chave).maybeSingle();
    if (error || !data) throw new Error("Loja não cadastrada no banco. Rode o SQL 09_vendas.sql.");
    idDaLoja.set(chave, data.id as string);
    return data.id as string;
  }

  return {
    hoje: () => hojeNoBrasil(),
    tokenConfigurado: (loja) => tokenDaLoja(loja) !== null,
    buscarVendas: async (loja, dia) => {
      await dormir(PAUSA_ENTRE_CONSULTAS_MS);
      // Mais tentativas e espera maior que o padrão, para atravessar o limite de chamadas do Xmenu.
      return buscarVendasCaixaFechado(loja, { ...limitesDoDiaDeCaixa(dia), incluirCanceladas: true }, { tentativas: 5, esperaMs: 1500 });
    },
    gravarDia: async (loja, dia, linhas) => {
      const { error } = await db.rpc("substituir_vendas_dia", {
        p_loja_id: await lojaId(loja.chave),
        p_data: dia,
        p_linhas: linhas.map((l) => ({
          periodo: l.periodo,
          canal: l.canal,
          pedidos: l.pedidos,
          cancelados: l.cancelados,
          bruto: l.bruto,
          desconto_comercial: l.descontoComercial,
          desconto_funcionarios: l.descontoFuncionarios,
          taxa_entrega: l.taxaEntrega,
          liquido: l.liquido,
          valor_cancelado: l.valorCancelado,
        })),
      });
      if (error) throw new Error(`Não consegui gravar ${dia}: ${error.message}`);
    },
    registrar: async (loja, p) => {
      await db.from("sincronizacoes").insert({
        loja_id: await lojaId(loja.chave),
        origem: p.origem,
        data_de: p.de,
        data_ate: p.ate,
        status: p.status,
        dias_gravados: p.dias,
        mensagem: p.mensagem?.slice(0, 500) ?? null,
      });
    },
  };
}

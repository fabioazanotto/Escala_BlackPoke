// Leitura dos totais de vendas guardados no banco (só o admin enxerga; as regras de acesso valem aqui).

import { supabase } from "@/lib/supabase";
import type { CanalVenda } from "@/lib/tipos";
import type { LinhaVenda } from "./consulta";

export type LojaVenda = { id: string; chave: string; nome: string; historicoDesde: string | null };

const PAGINA = 1000; // limite de linhas por consulta do Supabase

type LinhaBruta = {
  loja_id: string;
  data_caixa: string;
  periodo: LinhaVenda["periodo"];
  canal: CanalVenda;
  pedidos: number;
  cancelados: number;
  bruto: number | string;
  desconto_comercial: number | string;
  desconto_funcionarios: number | string;
  taxa_entrega: number | string;
  liquido: number | string;
  valor_cancelado: number | string;
};

export async function carregarLojas(): Promise<LojaVenda[]> {
  const { data, error } = await supabase().from("lojas_xmenu").select("id, chave, nome, historico_desde").eq("ativa", true).order("nome");
  if (error) throw new Error(error.message);
  return (data ?? []).map((l) => ({ id: l.id as string, chave: l.chave as string, nome: l.nome as string, historicoDesde: (l.historico_desde as string | null) ?? null }));
}

/** Todas as linhas do período, de todas as lojas (o filtro de lojas e canais é feito na tela). */
export async function carregarLinhas(de: string, ate: string, lojas: LojaVenda[]): Promise<LinhaVenda[]> {
  const chaveDaLoja = new Map(lojas.map((l) => [l.id, l.chave]));
  const todas: LinhaVenda[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await supabase()
      .from("vendas_resumo")
      .select("loja_id, data_caixa, periodo, canal, pedidos, cancelados, bruto, desconto_comercial, desconto_funcionarios, taxa_entrega, liquido, valor_cancelado")
      .gte("data_caixa", de)
      .lte("data_caixa", ate)
      .order("data_caixa")
      .order("loja_id")
      .order("periodo")
      .order("canal")
      .range(desde, desde + PAGINA - 1);
    if (error) throw new Error(error.message);
    const lote = (data ?? []) as LinhaBruta[];
    for (const l of lote) {
      const lojaChave = chaveDaLoja.get(l.loja_id);
      if (!lojaChave) continue;
      todas.push({
        lojaChave,
        dia: l.data_caixa,
        periodo: l.periodo,
        canal: l.canal,
        pedidos: l.pedidos,
        cancelados: l.cancelados,
        bruto: Number(l.bruto),
        descontoComercial: Number(l.desconto_comercial),
        descontoFuncionarios: Number(l.desconto_funcionarios),
        taxaEntrega: Number(l.taxa_entrega),
        liquido: Number(l.liquido),
        valorCancelado: Number(l.valor_cancelado),
      });
    }
    if (lote.length < PAGINA) return todas;
  }
}

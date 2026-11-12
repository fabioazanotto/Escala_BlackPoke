// Leitura dos totais de vendas guardados no banco (só o admin enxerga; as regras de acesso valem aqui).

import { supabase } from "@/lib/supabase";
import type { CanalVenda } from "@/lib/tipos";
import type { LinhaVenda } from "./consulta";

export type LojaVenda = { id: string; chave: string; nome: string; historicoDesde: string | null; alertarRecordes: boolean };

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
  const { data, error } = await supabase().from("lojas_xmenu").select("id, chave, nome, historico_desde, alertar_recordes").eq("ativa", true).order("nome");
  if (error) throw new Error(error.message);
  return (data ?? []).map((l) => ({ id: l.id as string, chave: l.chave as string, nome: l.nome as string, historicoDesde: (l.historico_desde as string | null) ?? null, alertarRecordes: l.alertar_recordes !== false }));
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

// ---------------------------------------------------------------- recordes

import type { Recorde } from "./recordes";

export async function carregarRecordes(): Promise<Recorde[]> {
  const { data, error } = await supabase().from("vendas_recordes").select("id, loja_id, metrica, dia, valor, anterior, anterior_dia, alerta, detectado_em");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    lojaId: r.loja_id as string,
    metrica: r.metrica as Recorde["metrica"],
    dia: r.dia as string,
    valor: Number(r.valor),
    anterior: r.anterior === null ? null : Number(r.anterior),
    anteriorDia: (r.anterior_dia as string | null) ?? null,
    alerta: Boolean(r.alerta),
    detectadoEm: r.detectado_em as string,
  }));
}

/** Ids dos recordes que este admin já viu no pop-up ("popup") ou dispensou na faixa ("faixa"). */
export async function carregarVistos(tipo: "popup" | "faixa"): Promise<Set<string>> {
  const { data } = await supabase().from("vendas_recordes_vistos").select("recorde_id").eq("tipo", tipo);
  return new Set((data ?? []).map((v) => v.recorde_id as string));
}

export async function marcarVistos(ids: string[], tipo: "popup" | "faixa"): Promise<void> {
  const { data } = await supabase().auth.getUser();
  const usuario = data.user?.id;
  if (!usuario || ids.length === 0) return;
  await supabase().from("vendas_recordes_vistos").upsert(ids.map((recorde_id) => ({ recorde_id, usuario_id: usuario, tipo })), { onConflict: "recorde_id,usuario_id,tipo", ignoreDuplicates: true });
}

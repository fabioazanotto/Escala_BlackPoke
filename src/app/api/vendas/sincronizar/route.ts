import { timingSafeEqual } from "node:crypto";
import { chamadorDaRequisicao } from "@/lib/servidor/admin";
import { ambienteReal } from "@/lib/servidor/sincronizarVendas";
import { supabaseAdmin } from "@/lib/servidor/supabaseAdmin";
import { sincronizarVendas, type Origem, type Pedido } from "@/lib/vendas/sincronizar";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const semCache = { "Cache-Control": "no-store" };

function segredoConfere(request: Request): boolean {
  const esperado = process.env.SINCRONIZAR_SEGREDO?.trim();
  const recebido = request.headers.get("x-sincronizar-segredo")?.trim();
  if (!esperado || !recebido) return false;
  const a = Buffer.from(esperado);
  const b = Buffer.from(recebido);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Traz as vendas do Xmenu e grava os totais no banco.
 * Quem chama: o agendador do banco (cabeçalho x-sincronizar-segredo) ou o admin logado (botões da tela Vendas).
 * Corpo opcional: { dataDe, dataAte, lojas }. Sem datas, atualiza hoje e os 2 dias anteriores.
 */
export async function POST(request: Request) {
  let origem: Origem;
  if (segredoConfere(request)) {
    origem = "automatica";
  } else {
    const chamador = await chamadorDaRequisicao(request);
    if (!chamador) return Response.json({ erro: "Não autenticado." }, { status: 401, headers: semCache });
    if (chamador.perfil !== "admin") return Response.json({ erro: "Sem permissão." }, { status: 403, headers: semCache });
    origem = "manual";
  }

  const corpo = (await request.json().catch(() => ({}))) as { dataDe?: unknown; dataAte?: unknown; lojas?: unknown };
  const texto = (v: unknown) => (typeof v === "string" ? v : undefined);
  const pedido: Pedido = {
    origem,
    dataDe: texto(corpo.dataDe),
    dataAte: texto(corpo.dataAte),
    lojas: Array.isArray(corpo.lojas) ? corpo.lojas.filter((l): l is string => typeof l === "string") : undefined,
  };
  if (origem === "manual" && pedido.dataDe) pedido.origem = "historico";

  const db = supabaseAdmin();
  if (!db) {
    return Response.json({ erro: "O servidor ainda não tem a chave de serviço do banco (SUPABASE_SERVICE_ROLE_KEY)." }, { status: 503, headers: semCache });
  }

  try {
    const lojas = await sincronizarVendas(pedido, ambienteReal(db));
    return Response.json({ lojas, concluidoEm: new Date().toISOString() }, { headers: semCache });
  } catch (e) {
    return Response.json({ erro: (e as Error).message }, { status: 400, headers: semCache });
  }
}

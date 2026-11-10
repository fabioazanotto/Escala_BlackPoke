import { timingSafeEqual } from "node:crypto";
import { ErroSecullum } from "@/lib/integracoes/secullum";
import { sincronizarPonto, type TipoSync } from "@/lib/ponto/sincronizacao";
import { chamadorDaRequisicao } from "@/lib/servidor/admin";
import { ErroConfiguracaoPonto } from "@/lib/servidor/pontoDados";
import { ambientePonto } from "@/lib/servidor/sincronizarPonto";
import { supabaseAdmin } from "@/lib/servidor/supabaseAdmin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const semCache = { "Cache-Control": "no-store" };
const MODOS: TipoSync[] = ["inicial", "incremental", "reprocesso"];

function segredoConfere(request: Request): boolean {
  const esperado = process.env.SINCRONIZAR_SEGREDO?.trim();
  const recebido = request.headers.get("x-sincronizar-segredo")?.trim();
  if (!esperado || !recebido) return false;
  const a = Buffer.from(esperado);
  const b = Buffer.from(recebido);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Traz as batidas do Secullum (SOMENTE LEITURA lá) e grava no banco do BlackPoke.
 * Quem chama: o agendador do banco (cabeçalho x-sincronizar-segredo) ou o admin logado (botões da aba Ponto).
 * Corpo: { modo: "inicial" | "incremental" | "reprocesso" }.
 */
export async function POST(request: Request) {
  let origem: "automatica" | "manual";
  if (segredoConfere(request)) {
    origem = "automatica";
  } else {
    const chamador = await chamadorDaRequisicao(request);
    if (!chamador) return Response.json({ erro: "Não autenticado." }, { status: 401, headers: semCache });
    if (chamador.perfil !== "admin") return Response.json({ erro: "Sem permissão." }, { status: 403, headers: semCache });
    origem = "manual";
  }

  const corpo = (await request.json().catch(() => ({}))) as { modo?: unknown };
  const modo = MODOS.find((m) => m === corpo.modo);
  if (!modo) return Response.json({ erro: "Informe o modo: inicial, incremental ou reprocesso." }, { status: 400, headers: semCache });

  const db = supabaseAdmin();
  if (!db) return Response.json({ erro: "O servidor ainda não tem a chave de serviço do banco (SUPABASE_SERVICE_ROLE_KEY)." }, { status: 503, headers: semCache });

  try {
    const resultado = await sincronizarPonto(modo, await ambientePonto(db, origem));
    const status = resultado.status === "ocupado" ? 409 : resultado.status === "erro" ? 502 : 200;
    return Response.json({ resultado, concluidoEm: new Date().toISOString() }, { status, headers: semCache });
  } catch (e) {
    const mensagem = e instanceof ErroSecullum || e instanceof ErroConfiguracaoPonto ? e.message : "Erro inesperado ao preparar a sincronização.";
    return Response.json({ erro: mensagem }, { status: 502, headers: semCache });
  }
}

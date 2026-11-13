import { chamadorDaRequisicao, clienteDoChamador } from "@/lib/servidor/admin";
import { ErroConfiguracaoPonto } from "@/lib/servidor/pontoDados";
import { ErroEscrita, processarEscrita, type Pedido } from "@/lib/servidor/pontoEscrita";
import { ErroSecullum } from "@/lib/integracoes/secullum";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const semCache = { "Cache-Control": "no-store" };

const ACOES = ["opcoes", "listar_afastamentos", "justificar", "remover_justificativa", "afastamento", "remover_afastamento"];

/**
 * ESCRITA no Secullum (justificar falta e afastamentos). Só o creator. No modo teste só vale para o funcionário de teste.
 * Sem `confirmar: true` a rota só devolve a PRÉVIA; nada é gravado. A resposta não é registrada em log.
 */
export async function POST(request: Request) {
  const chamador = await chamadorDaRequisicao(request);
  if (!chamador) return Response.json({ erro: "Não autenticado." }, { status: 401, headers: semCache });
  if (chamador.perfil !== "admin" || !chamador.creator) return Response.json({ erro: "Sem permissão." }, { status: 403, headers: semCache });
  const db = clienteDoChamador(request);
  if (!db) return Response.json({ erro: "Sessão inválida." }, { status: 401, headers: semCache });

  const pedido = (await request.json().catch(() => null)) as (Record<string, unknown> & { acao?: string }) | null;
  if (!pedido || typeof pedido.acao !== "string" || !ACOES.includes(pedido.acao)) return Response.json({ erro: "Pedido inválido." }, { status: 400, headers: semCache });

  try {
    const { data: perfil } = await db.from("perfis").select("nome").eq("id", chamador.usuarioId).maybeSingle();
    const resposta = await processarEscrita(db, { nome: String(perfil?.nome ?? "") }, pedido as unknown as Pedido);
    return Response.json(resposta, { headers: semCache });
  } catch (e) {
    const status = e instanceof ErroEscrita ? 400 : 502;
    return Response.json({ erro: e instanceof ErroSecullum || e instanceof ErroConfiguracaoPonto || e instanceof Error ? e.message : "Erro inesperado." }, { status, headers: semCache });
  }
}

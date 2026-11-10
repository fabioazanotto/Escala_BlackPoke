import { ErroSecullum } from "@/lib/integracoes/secullum";
import { chamadorDaRequisicao, clienteDoChamador } from "@/lib/servidor/admin";
import { ErroConfiguracaoPonto } from "@/lib/servidor/pontoDados";
import { aplicarNomes, propostasDeNomes } from "@/lib/servidor/pontoNomes";

export const dynamic = "force-dynamic";
export const maxDuration = 30;
const semCache = { "Cache-Control": "no-store" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Nome completo e empresa pelo Secullum, só para colaboradores vinculados. Só admin. SOMENTE LEITURA no Secullum.
 * Corpo: { modo: "ver" } devolve a proposta; { modo: "aplicar", ids?: string[] } grava (recalculando a proposta no servidor).
 */
export async function POST(request: Request) {
  const chamador = await chamadorDaRequisicao(request);
  if (!chamador) return Response.json({ erro: "Não autenticado." }, { status: 401, headers: semCache });
  if (chamador.perfil !== "admin") return Response.json({ erro: "Sem permissão." }, { status: 403, headers: semCache });
  const db = clienteDoChamador(request);
  if (!db) return Response.json({ erro: "Sessão inválida." }, { status: 401, headers: semCache });

  const corpo = (await request.json().catch(() => ({}))) as { modo?: unknown; ids?: unknown };
  try {
    if (corpo.modo === "ver") return Response.json({ propostas: await propostasDeNomes(db) }, { headers: semCache });
    if (corpo.modo === "aplicar") {
      const ids = Array.isArray(corpo.ids) && corpo.ids.every((i) => typeof i === "string" && UUID.test(i)) ? (corpo.ids as string[]) : undefined;
      if (Array.isArray(corpo.ids) && !ids) return Response.json({ erro: "Lista de colaboradores inválida." }, { status: 400, headers: semCache });
      return Response.json(await aplicarNomes(db, ids), { headers: semCache });
    }
    return Response.json({ erro: "Informe o modo: ver ou aplicar." }, { status: 400, headers: semCache });
  } catch (e) {
    return Response.json({ erro: e instanceof ErroSecullum || e instanceof ErroConfiguracaoPonto || e instanceof Error ? e.message : "Erro inesperado." }, { status: 502, headers: semCache });
  }
}

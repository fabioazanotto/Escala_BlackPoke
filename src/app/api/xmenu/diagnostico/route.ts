import { LOJAS_XMENU } from "@/config/lojas";
import { diagnosticarLoja } from "@/lib/integracoes/xmenu";
import { chamadorDaRequisicao } from "@/lib/servidor/admin";

export const dynamic = "force-dynamic";

const semCache = { "Cache-Control": "no-store" };

/** Testa a conexão com cada loja do Xmenu. Só o admin pode chamar. Nunca devolve token nem dados de venda. */
export async function GET(request: Request) {
  const chamador = await chamadorDaRequisicao(request);
  if (!chamador) return Response.json({ erro: "Não autenticado." }, { status: 401, headers: semCache });
  if (chamador.perfil !== "admin") return Response.json({ erro: "Sem permissão." }, { status: 403, headers: semCache });

  const lojas = await Promise.all(LOJAS_XMENU.map((l) => diagnosticarLoja(l)));
  return Response.json({ lojas, verificadoEm: new Date().toISOString() }, { headers: semCache });
}

import { lerPedido } from "@/lib/ponto/vinculos";
import { chamadorDaRequisicao, clienteDoChamador } from "@/lib/servidor/admin";

export const dynamic = "force-dynamic";

const semCache = { "Cache-Control": "no-store" };

/** Desfaz um vínculo: encerra a vigência (o histórico fica). Só o admin. Não apaga nada e não toca no Secullum. */
export async function POST(request: Request) {
  const chamador = await chamadorDaRequisicao(request);
  if (!chamador) return Response.json({ erro: "Não autenticado." }, { status: 401, headers: semCache });
  if (chamador.perfil !== "admin") return Response.json({ erro: "Sem permissão." }, { status: 403, headers: semCache });
  const db = clienteDoChamador(request);
  if (!db) return Response.json({ erro: "Sessão inválida." }, { status: 401, headers: semCache });

  const pedido = lerPedido(await request.json().catch(() => null));
  if (!pedido) return Response.json({ erro: "Pedido inválido." }, { status: 400, headers: semCache });

  const hoje = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
  const { data, error } = await db
    .from("colaborador_ponto_ids")
    .update({ vigencia_fim: hoje })
    .eq("colaborador_id", pedido.colaboradorId)
    .eq("secullum_funcionario_id", pedido.funcionarioId)
    .is("vigencia_fim", null)
    .select("id");
  if (error) return Response.json({ erro: "Não consegui desfazer o vínculo." }, { status: 500, headers: semCache });
  if (!data || data.length === 0) return Response.json({ erro: "Não havia vínculo em vigor para desfazer." }, { status: 404, headers: semCache });
  return Response.json({ ok: true }, { headers: semCache });
}

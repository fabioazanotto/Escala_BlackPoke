import { ErroSecullum } from "@/lib/integracoes/secullum";
import { chamadorDaRequisicao, clienteDoChamador } from "@/lib/servidor/admin";
import { ErroConfiguracaoPonto } from "@/lib/servidor/pontoDados";
import { montarAoVivo } from "@/lib/servidor/pontoAoVivo";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const semCache = { "Cache-Control": "no-store" };

/**
 * Painel ao vivo do ponto: quem está trabalhando, em intervalo, atrasado, ausente etc., por loja.
 * SOMENTE LEITURA no Secullum. Só o admin (traz nomes). A resposta não é registrada em log.
 */
export async function GET(request: Request) {
  const chamador = await chamadorDaRequisicao(request);
  if (!chamador) return Response.json({ erro: "Não autenticado." }, { status: 401, headers: semCache });
  if (chamador.perfil !== "admin") return Response.json({ erro: "Sem permissão." }, { status: 403, headers: semCache });
  const db = clienteDoChamador(request);
  if (!db) return Response.json({ erro: "Sessão inválida." }, { status: 401, headers: semCache });

  try {
    return Response.json(await montarAoVivo(db), { headers: semCache });
  } catch (e) {
    const mensagem = e instanceof ErroSecullum || e instanceof ErroConfiguracaoPonto ? e.message : e instanceof Error ? e.message : "Erro inesperado.";
    return Response.json({ erro: mensagem }, { status: 502, headers: semCache });
  }
}

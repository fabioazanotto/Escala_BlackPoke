import { ErroSecullum } from "@/lib/integracoes/secullum";
import { chamadorDaRequisicao, clienteDoChamador } from "@/lib/servidor/admin";
import { ErroConfiguracaoPonto } from "@/lib/servidor/pontoDados";
import { listarFuncionarios } from "@/lib/servidor/pontoMes";

export const dynamic = "force-dynamic";
export const maxDuration = 30;
const semCache = { "Cache-Control": "no-store" };

/** Lista de funcionários (empresas do projeto) para o seletor da tela "Ponto por colaborador". Só admin. Traz nomes. */
export async function GET(request: Request) {
  const chamador = await chamadorDaRequisicao(request);
  if (!chamador) return Response.json({ erro: "Não autenticado." }, { status: 401, headers: semCache });
  if (chamador.perfil !== "admin") return Response.json({ erro: "Sem permissão." }, { status: 403, headers: semCache });
  const db = clienteDoChamador(request);
  if (!db) return Response.json({ erro: "Sessão inválida." }, { status: 401, headers: semCache });
  try {
    return Response.json({ funcionarios: await listarFuncionarios(db) }, { headers: semCache });
  } catch (e) {
    return Response.json({ erro: e instanceof ErroSecullum || e instanceof ErroConfiguracaoPonto || e instanceof Error ? e.message : "Erro inesperado." }, { status: 502, headers: semCache });
  }
}

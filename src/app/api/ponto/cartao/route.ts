import { ErroSecullum } from "@/lib/integracoes/secullum";
import { chamadorDaRequisicao, clienteDoChamador } from "@/lib/servidor/admin";
import { ErroConfiguracaoPonto } from "@/lib/servidor/pontoDados";
import { ErroMes, cabecalhoDoCartao, montarMesDoColaborador } from "@/lib/servidor/pontoMes";

export const dynamic = "force-dynamic";
export const maxDuration = 30;
const semCache = { "Cache-Control": "no-store" };

/**
 * Dados do Cartão Ponto de um colaborador no mês: o mês (mesmo cálculo da tela, em cache curto) e o cabeçalho
 * com CPF completo. SOMENTE LEITURA no Secullum. Só admin. A resposta não é registrada em log nem guardada.
 */
export async function GET(request: Request) {
  const chamador = await chamadorDaRequisicao(request);
  if (!chamador) return Response.json({ erro: "Não autenticado." }, { status: 401, headers: semCache });
  if (chamador.perfil !== "admin") return Response.json({ erro: "Sem permissão." }, { status: 403, headers: semCache });
  const db = clienteDoChamador(request);
  if (!db) return Response.json({ erro: "Sessão inválida." }, { status: 401, headers: semCache });

  const url = new URL(request.url);
  const funcionario = Number(url.searchParams.get("funcionario"));
  const mes = url.searchParams.get("mes") ?? "";
  if (!Number.isInteger(funcionario) || funcionario <= 0) return Response.json({ erro: "Informe o funcionário." }, { status: 400, headers: semCache });

  try {
    const [dadosMes, cabecalho] = await Promise.all([montarMesDoColaborador(db, funcionario, mes), cabecalhoDoCartao(db, funcionario)]);
    return Response.json({ mes: dadosMes, cabecalho }, { headers: semCache });
  } catch (e) {
    const status = e instanceof ErroMes ? 400 : 502;
    return Response.json({ erro: e instanceof ErroSecullum || e instanceof ErroConfiguracaoPonto || e instanceof Error ? e.message : "Erro inesperado." }, { status, headers: semCache });
  }
}

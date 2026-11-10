import { ErroSecullum } from "@/lib/integracoes/secullum";
import { conferirFuncionarios, type ColaboradorBlackPoke, type VinculoConfirmado } from "@/lib/ponto/conferencia";
import { resumirHorarios } from "@/lib/ponto/horarios";
import { chamadorDaRequisicao, clienteDoChamador } from "@/lib/servidor/admin";
import { ErroConfiguracaoPonto, carregarContexto, traduzirFuncionarios } from "@/lib/servidor/pontoDados";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const semCache = { "Cache-Control": "no-store" };
const lista = (x: unknown) => (Array.isArray(x) ? x : []);

/**
 * Compara os funcionários do Secullum com os colaboradores do BlackPoke. SOMENTE LEITURA: não grava nada em lugar nenhum.
 * Só o admin. A resposta traz nomes e CPF mascarado; por isso só vai para a tela de quem tem permissão e não é registrada em log.
 */
export async function GET(request: Request) {
  const chamador = await chamadorDaRequisicao(request);
  if (!chamador) return Response.json({ erro: "Não autenticado." }, { status: 401, headers: semCache });
  if (chamador.perfil !== "admin") return Response.json({ erro: "Sem permissão." }, { status: 403, headers: semCache });
  const db = clienteDoChamador(request);
  if (!db) return Response.json({ erro: "Sessão inválida." }, { status: 401, headers: semCache });

  try {
    const { contexto } = await carregarContexto(db);
    const [funcionariosApi, horariosApi] = await Promise.all([contexto.sessao.obter("Funcionarios"), contexto.sessao.obter("Horarios")]);
    const { funcionarios, usoPorHorario, comHorarioAlternativo } = traduzirFuncionarios(lista(funcionariosApi), contexto.empresas);

    const { data: colabs, error } = await db.from("colaboradores").select("id, nome, cpf, unidade_id, ativo, data_admissao, data_desligamento, unidades(nome)");
    if (error) throw new Error(error.message);
    const blackpoke: ColaboradorBlackPoke[] = (colabs ?? []).map((c) => ({
      id: c.id as string,
      nome: String(c.nome ?? "").trim(),
      cpf: (c.cpf as string | null) ?? null,
      unidadeId: c.unidade_id as string,
      unidadeNome: ((c.unidades as unknown as { nome?: string } | null)?.nome as string | undefined) ?? "",
      ativo: Boolean(c.ativo),
      admissao: (c.data_admissao as string | null) ?? null,
      desligamento: (c.data_desligamento as string | null) ?? null,
    }));

    const { data: vincs } = await db.from("colaborador_ponto_ids").select("colaborador_id, secullum_funcionario_id").eq("banco_id", contexto.bancoId).is("vigencia_fim", null);
    const vinculos: VinculoConfirmado[] = (vincs ?? []).map((v) => ({ colaboradorId: v.colaborador_id as string, funcionarioId: Number(v.secullum_funcionario_id) }));

    const conferencia = conferirFuncionarios(funcionarios, blackpoke, contexto.empresas, vinculos);
    const horarios = resumirHorarios(lista(horariosApi), usoPorHorario);
    return Response.json({ conferencia, horarios: { ...horarios, funcionariosComHorarioAlternativo: comHorarioAlternativo }, verificadoEm: new Date().toISOString() }, { headers: semCache });
  } catch (e) {
    const mensagem = e instanceof ErroSecullum || e instanceof ErroConfiguracaoPonto || e instanceof Error ? e.message : "Erro inesperado.";
    return Response.json({ erro: mensagem }, { status: 502, headers: semCache });
  }
}

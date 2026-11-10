import { ErroSecullum } from "@/lib/integracoes/secullum";
import { lerPedido, validarVinculo } from "@/lib/ponto/vinculos";
import { chamadorDaRequisicao, clienteDoChamador } from "@/lib/servidor/admin";
import { ErroConfiguracaoPonto, carregarContexto, traduzirFuncionarios } from "@/lib/servidor/pontoDados";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const semCache = { "Cache-Control": "no-store" };

/**
 * Confirma que um colaborador do BlackPoke é um funcionário do Secullum. Só o admin.
 * Confere ao vivo (empresa incluída, ativo) antes de gravar. O vínculo guarda só números de identificação, nunca CPF.
 * NÃO escreve nada no Secullum.
 */
export async function POST(request: Request) {
  const chamador = await chamadorDaRequisicao(request);
  if (!chamador) return Response.json({ erro: "Não autenticado." }, { status: 401, headers: semCache });
  if (chamador.perfil !== "admin") return Response.json({ erro: "Sem permissão." }, { status: 403, headers: semCache });
  const db = clienteDoChamador(request);
  if (!db) return Response.json({ erro: "Sessão inválida." }, { status: 401, headers: semCache });

  const pedido = lerPedido(await request.json().catch(() => null));
  if (!pedido) return Response.json({ erro: "Pedido inválido." }, { status: 400, headers: semCache });

  try {
    const { contexto } = await carregarContexto(db);
    const { funcionarios } = traduzirFuncionarios((await contexto.sessao.obter("Funcionarios")) as unknown[], contexto.empresas);
    const { data: colab } = await db.from("colaboradores").select("id, ativo").eq("id", pedido.colaboradorId).maybeSingle();
    const v = validarVinculo(pedido, funcionarios, colab ? { ativo: Boolean(colab.ativo) } : null);
    if (!v.ok) return Response.json({ erro: v.motivo }, { status: 422, headers: semCache });

    const { error } = await db.from("colaborador_ponto_ids").insert({
      colaborador_id: pedido.colaboradorId,
      banco_id: contexto.bancoId,
      secullum_funcionario_id: pedido.funcionarioId,
      secullum_empresa_id: v.funcionario.empresaId,
      origem: "manual",
      confirmado_por: chamador.usuarioId,
    });
    if (error) {
      const duplicado = error.code === "23505";
      return Response.json({ erro: duplicado ? "Um dos dois já está ligado a outra pessoa. Desfaça o vínculo anterior primeiro." : "Não consegui gravar o vínculo." }, { status: duplicado ? 409 : 500, headers: semCache });
    }
    return Response.json({ ok: true }, { headers: semCache });
  } catch (e) {
    const mensagem = e instanceof ErroSecullum || e instanceof ErroConfiguracaoPonto ? e.message : "Erro inesperado.";
    return Response.json({ erro: mensagem }, { status: 502, headers: semCache });
  }
}

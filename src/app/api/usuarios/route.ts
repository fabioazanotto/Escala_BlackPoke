import { chamadorDaRequisicao } from "@/lib/servidor/admin";
import { supabaseAdmin } from "@/lib/servidor/supabaseAdmin";
import { ErroUsuario, alterarUsuario, criarUsuario, listarUsuarios, redefinirSenha } from "@/lib/servidor/usuarios";
import { ehUuid, lerMudanca, lerNovoUsuario } from "@/lib/usuarios";

export const dynamic = "force-dynamic";
export const maxDuration = 30;
const semCache = { "Cache-Control": "no-store" };

async function admin(request: Request) {
  const chamador = await chamadorDaRequisicao(request);
  if (!chamador) return { erro: Response.json({ erro: "Não autenticado." }, { status: 401, headers: semCache }) };
  if (chamador.perfil !== "admin") return { erro: Response.json({ erro: "Sem permissão." }, { status: 403, headers: semCache }) };
  const db = supabaseAdmin();
  if (!db) return { erro: Response.json({ erro: "O servidor ainda não tem a chave de serviço do banco (SUPABASE_SERVICE_ROLE_KEY)." }, { status: 503, headers: semCache }) };
  return { chamador, db };
}

/** Lista os usuários. Só o admin. Nunca devolve senha. */
export async function GET(request: Request) {
  const r = await admin(request);
  if (r.erro) return r.erro;
  try {
    return Response.json({ usuarios: await listarUsuarios(r.db), eu: r.chamador.usuarioId }, { headers: semCache });
  } catch (e) {
    return resposta(e);
  }
}

/**
 * Ações do admin sobre usuários. Corpo: { acao: "criar" | "alterar" | "senha", ... }.
 *  criar:   nome, email, perfil, senha, unidadeIds
 *  alterar: id, e qualquer de nome, perfil, ativo, unidadeIds
 *  senha:   id, senha (temporária: a pessoa troca no próximo login)
 */
export async function POST(request: Request) {
  const r = await admin(request);
  if (r.erro) return r.erro;
  const corpo = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  try {
    if (corpo?.acao === "criar") {
      const l = lerNovoUsuario(corpo);
      if (!l.ok) return Response.json({ erro: l.erro }, { status: 400, headers: semCache });
      return Response.json(await criarUsuario(r.db, r.chamador.usuarioId, l.dados), { headers: semCache });
    }
    if (corpo?.acao === "alterar") {
      if (!ehUuid(corpo.id)) return Response.json({ erro: "Usuário inválido." }, { status: 400, headers: semCache });
      const l = lerMudanca(corpo);
      if (!l.ok) return Response.json({ erro: l.erro }, { status: 400, headers: semCache });
      await alterarUsuario(r.db, r.chamador.usuarioId, corpo.id, l.mudanca);
      return Response.json({ ok: true }, { headers: semCache });
    }
    if (corpo?.acao === "senha") {
      if (!ehUuid(corpo.id) || typeof corpo.senha !== "string") return Response.json({ erro: "Pedido inválido." }, { status: 400, headers: semCache });
      await redefinirSenha(r.db, r.chamador.usuarioId, corpo.id, corpo.senha);
      return Response.json({ ok: true }, { headers: semCache });
    }
    return Response.json({ erro: "Ação inválida." }, { status: 400, headers: semCache });
  } catch (e) {
    return resposta(e);
  }
}

function resposta(e: unknown) {
  if (e instanceof ErroUsuario) return Response.json({ erro: e.message }, { status: e.status, headers: semCache });
  return Response.json({ erro: "Erro inesperado." }, { status: 500, headers: semCache }); // sem detalhes: nunca ecoa dados do pedido
}

// Cadastro de usuários (Supabase Auth + tabela perfis). Roda só no servidor, com a chave de serviço.
// Senhas NUNCA são gravadas em log, em auditoria nem devolvidas pela API: quem digita ou gera é o admin, na tela.

import type { SupabaseClient } from "@supabase/supabase-js";
import { validarAlteracao, validarSenha, type DadosNovoUsuario, type Mudanca, type PerfilUsuario } from "@/lib/usuarios";

export type UsuarioDaLista = {
  id: string;
  email: string;
  nome: string;
  perfil: PerfilUsuario;
  ativo: boolean;
  unidadeIds: string[];
  ultimoAcesso: string | null;
  precisaTrocarSenha: boolean;
};

export class ErroUsuario extends Error {
  constructor(
    mensagem: string,
    public status = 400,
  ) {
    super(mensagem);
  }
}

async function auditar(admin: SupabaseClient, chamadorId: string, acao: string, alvoId: string, depois: Record<string, unknown>) {
  // Sem senha: só o que mudou. A auditoria é registro, então uma falha aqui não desfaz a ação.
  await admin.from("auditoria").insert({ usuario_id: chamadorId, acao, tabela: "usuarios", registro_id: alvoId, depois }).then(() => undefined, () => undefined);
}

export async function listarUsuarios(admin: SupabaseClient): Promise<UsuarioDaLista[]> {
  const { data: lista, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw new ErroUsuario("Não consegui ler os usuários.", 502);
  const [{ data: perfis }, { data: acessos }] = await Promise.all([admin.from("perfis").select("id, nome, perfil, ativo"), admin.from("usuario_unidades").select("usuario_id, unidade_id")]);
  const perfilPorId = new Map((perfis ?? []).map((p) => [p.id as string, p]));
  const out: UsuarioDaLista[] = [];
  for (const u of lista.users) {
    const p = perfilPorId.get(u.id);
    out.push({
      id: u.id,
      email: u.email ?? "",
      nome: p ? String(p.nome) : (u.email ?? ""),
      perfil: (p?.perfil as PerfilUsuario | undefined) ?? "gerencia",
      ativo: p ? Boolean(p.ativo) : false, // sem perfil = sem acesso
      unidadeIds: (acessos ?? []).filter((a) => a.usuario_id === u.id).map((a) => String(a.unidade_id)),
      ultimoAcesso: u.last_sign_in_at ?? null,
      precisaTrocarSenha: u.user_metadata?.trocar_senha === true,
    });
  }
  return out.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export async function criarUsuario(admin: SupabaseClient, chamadorId: string, d: DadosNovoUsuario): Promise<{ id: string }> {
  const { data, error } = await admin.auth.admin.createUser({ email: d.email, password: d.senha, email_confirm: true, user_metadata: { trocar_senha: true } });
  if (error || !data.user) {
    const jaExiste = /already|registered|exists/i.test(error?.message ?? "");
    throw new ErroUsuario(jaExiste ? "Já existe um usuário com esse e-mail." : "Não consegui criar o usuário.", jaExiste ? 409 : 502);
  }
  const id = data.user.id;
  const { error: erroPerfil } = await admin.from("perfis").insert({ id, nome: d.nome, perfil: d.perfil, ativo: true });
  if (erroPerfil) {
    await admin.auth.admin.deleteUser(id).catch(() => undefined); // desfaz: não deixa usuário sem perfil para trás
    throw new ErroUsuario("Não consegui criar o perfil do usuário.", 502);
  }
  if (d.unidadeIds.length > 0 && d.perfil === "gerencia") {
    const { error: erroUn } = await admin.from("usuario_unidades").insert(d.unidadeIds.map((unidade_id) => ({ usuario_id: id, unidade_id })));
    if (erroUn) {
      await admin.from("perfis").delete().eq("id", id);
      await admin.auth.admin.deleteUser(id).catch(() => undefined);
      throw new ErroUsuario("Não consegui liberar as unidades do usuário.", 502);
    }
  }
  await auditar(admin, chamadorId, "usuario_criado", id, { email: d.email, nome: d.nome, perfil: d.perfil, unidades: d.unidadeIds.length });
  return { id };
}

export async function alterarUsuario(admin: SupabaseClient, chamadorId: string, id: string, m: Mudanca): Promise<void> {
  const { data: alvo } = await admin.from("perfis").select("id, perfil, ativo").eq("id", id).maybeSingle();
  if (!alvo) throw new ErroUsuario("Usuário não encontrado.", 404);
  const { data: admins } = await admin.from("perfis").select("id").eq("perfil", "admin").eq("ativo", true);
  const erro = validarAlteracao({ chamadorId, alvo: { id, perfil: alvo.perfil as PerfilUsuario, ativo: Boolean(alvo.ativo) }, mudanca: m, adminsAtivos: (admins ?? []).map((a) => String(a.id)) });
  if (erro) throw new ErroUsuario(erro, 409);

  const campos: Record<string, unknown> = {};
  if (m.nome !== undefined) campos.nome = m.nome;
  if (m.perfil !== undefined) campos.perfil = m.perfil;
  if (m.ativo !== undefined) campos.ativo = m.ativo;
  if (Object.keys(campos).length > 0) {
    const { error } = await admin.from("perfis").update(campos).eq("id", id);
    if (error) throw new ErroUsuario("Não consegui salvar a alteração.", 502);
  }
  if (m.unidadeIds !== undefined) {
    await admin.from("usuario_unidades").delete().eq("usuario_id", id);
    const perfilFinal = (m.perfil ?? alvo.perfil) as PerfilUsuario;
    if (m.unidadeIds.length > 0 && perfilFinal === "gerencia") {
      const { error } = await admin.from("usuario_unidades").insert(m.unidadeIds.map((unidade_id) => ({ usuario_id: id, unidade_id })));
      if (error) throw new ErroUsuario("Não consegui salvar as unidades.", 502);
    }
  }
  await auditar(admin, chamadorId, "usuario_alterado", id, { ...campos, ...(m.unidadeIds !== undefined ? { unidades: m.unidadeIds.length } : {}) });
}

/** O admin define uma senha temporária; no próximo login a pessoa é obrigada a trocá-la. */
export async function redefinirSenha(admin: SupabaseClient, chamadorId: string, id: string, senha: string): Promise<void> {
  const erro = validarSenha(senha);
  if (erro) throw new ErroUsuario(erro, 400);
  const { data: atual } = await admin.auth.admin.getUserById(id);
  if (!atual?.user) throw new ErroUsuario("Usuário não encontrado.", 404);
  const { error } = await admin.auth.admin.updateUserById(id, { password: senha, user_metadata: { ...atual.user.user_metadata, trocar_senha: true } });
  if (error) throw new ErroUsuario("Não consegui redefinir a senha.", 502);
  await auditar(admin, chamadorId, "usuario_senha_redefinida", id, {}); // nunca a senha
}

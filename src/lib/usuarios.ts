// Regras do cadastro de usuários. Funções puras (testadas): validações, senha forte e proteção contra o admin se trancar para fora.

export const PERFIS = ["admin", "rh", "gerencia"] as const;
export type PerfilUsuario = (typeof PERFIS)[number];

export const SENHA_MINIMA = 8;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ehUuid = (s: unknown): s is string => typeof s === "string" && UUID.test(s);

export function validarEmail(email: unknown): string | null {
  if (typeof email !== "string") return "Informe o e-mail.";
  const e = email.trim();
  if (e.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return "E-mail inválido.";
  return null;
}

/** Senha: pelo menos 8 caracteres, com letra e número, e sem espaço no começo ou no fim. */
export function validarSenha(senha: unknown): string | null {
  if (typeof senha !== "string") return "Informe a senha.";
  if (senha.length < SENHA_MINIMA) return `A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`;
  if (senha.length > 72) return "A senha pode ter no máximo 72 caracteres.";
  if (senha !== senha.trim()) return "A senha não pode começar nem terminar com espaço.";
  if (!/[A-Za-z]/.test(senha) || !/\d/.test(senha)) return "A senha precisa ter letras e números.";
  return null;
}

const MAIUSCULAS = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // sem I e O
const MINUSCULAS = "abcdefghijkmnpqrstuvwxyz"; // sem l e o
const NUMEROS = "23456789"; // sem 0 e 1

function sorteio(n: number): number {
  const v = new Uint32Array(1);
  const limite = Math.floor(0x100000000 / n) * n; // evita viés
  do globalThis.crypto.getRandomValues(v);
  while (v[0] >= limite);
  return v[0] % n;
}

/** Senha aleatória fácil de ler e digitar no celular (sem letras e números que se confundem). Sempre passa em validarSenha. */
export function gerarSenha(tamanho = 12): string {
  const todos = MAIUSCULAS + MINUSCULAS + NUMEROS;
  const n = Math.max(tamanho, SENHA_MINIMA);
  const chars = [MAIUSCULAS[sorteio(MAIUSCULAS.length)], MINUSCULAS[sorteio(MINUSCULAS.length)], NUMEROS[sorteio(NUMEROS.length)]];
  while (chars.length < n) chars.push(todos[sorteio(todos.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = sorteio(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

export type DadosNovoUsuario = { nome: string; email: string; perfil: PerfilUsuario; senha: string; unidadeIds: string[] };

export function lerNovoUsuario(corpo: unknown): { ok: true; dados: DadosNovoUsuario } | { ok: false; erro: string } {
  const c = (corpo ?? {}) as Record<string, unknown>;
  const nome = typeof c.nome === "string" ? c.nome.trim() : "";
  if (nome.length < 2 || nome.length > 100) return { ok: false, erro: "Informe o nome (de 2 a 100 letras)." };
  const erroEmail = validarEmail(c.email);
  if (erroEmail) return { ok: false, erro: erroEmail };
  if (!PERFIS.includes(c.perfil as PerfilUsuario)) return { ok: false, erro: "Escolha o perfil." };
  const erroSenha = validarSenha(c.senha);
  if (erroSenha) return { ok: false, erro: erroSenha };
  const unidadeIds = Array.isArray(c.unidadeIds) ? c.unidadeIds : [];
  if (!unidadeIds.every(ehUuid)) return { ok: false, erro: "Lista de unidades inválida." };
  return { ok: true, dados: { nome, email: (c.email as string).trim().toLowerCase(), perfil: c.perfil as PerfilUsuario, senha: c.senha as string, unidadeIds: [...new Set(unidadeIds as string[])] } };
}

export type Mudanca = { nome?: string; perfil?: PerfilUsuario; ativo?: boolean; unidadeIds?: string[] };

export function lerMudanca(corpo: unknown): { ok: true; mudanca: Mudanca } | { ok: false; erro: string } {
  const c = (corpo ?? {}) as Record<string, unknown>;
  const m: Mudanca = {};
  if (c.nome !== undefined) {
    const nome = typeof c.nome === "string" ? c.nome.trim() : "";
    if (nome.length < 2 || nome.length > 100) return { ok: false, erro: "Informe o nome (de 2 a 100 letras)." };
    m.nome = nome;
  }
  if (c.perfil !== undefined) {
    if (!PERFIS.includes(c.perfil as PerfilUsuario)) return { ok: false, erro: "Perfil inválido." };
    m.perfil = c.perfil as PerfilUsuario;
  }
  if (c.ativo !== undefined) {
    if (typeof c.ativo !== "boolean") return { ok: false, erro: "Situação inválida." };
    m.ativo = c.ativo;
  }
  if (c.unidadeIds !== undefined) {
    if (!Array.isArray(c.unidadeIds) || !c.unidadeIds.every(ehUuid)) return { ok: false, erro: "Lista de unidades inválida." };
    m.unidadeIds = [...new Set(c.unidadeIds as string[])];
  }
  if (Object.keys(m).length === 0) return { ok: false, erro: "Nada para alterar." };
  return { ok: true, mudanca: m };
}

/** Impede o administrador de se trancar para fora: não mexe no próprio perfil/situação e sempre sobra outro admin ativo. */
export function validarAlteracao(p: { chamadorId: string; alvo: { id: string; perfil: PerfilUsuario; ativo: boolean }; mudanca: Mudanca; adminsAtivos: string[] }): string | null {
  const { chamadorId, alvo, mudanca, adminsAtivos } = p;
  if (alvo.id === chamadorId && ((mudanca.perfil !== undefined && mudanca.perfil !== alvo.perfil) || mudanca.ativo === false)) {
    return "Você não pode tirar o seu próprio acesso de administrador nem inativar o seu próprio usuário.";
  }
  const deixaDeSerAdminAtivo = alvo.perfil === "admin" && alvo.ativo && ((mudanca.perfil !== undefined && mudanca.perfil !== "admin") || mudanca.ativo === false);
  if (deixaDeSerAdminAtivo && adminsAtivos.filter((id) => id !== alvo.id).length === 0) return "Precisa sobrar pelo menos um administrador ativo.";
  return null;
}

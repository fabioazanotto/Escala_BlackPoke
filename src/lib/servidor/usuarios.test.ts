import { describe, expect, it } from "vitest";
import { ErroUsuario, alterarUsuario, criarUsuario, listarUsuarios, redefinirSenha } from "./usuarios";

type Linha = Record<string, unknown>;

/** Banco e autenticação de mentira, em memória, que lembram o que foi chamado. */
function falso(opcoes: { falhaPerfil?: boolean; perfis?: Linha[] } = {}) {
  const chamadas: string[] = [];
  const tabelas: Record<string, Linha[]> = { perfis: opcoes.perfis ?? [], usuario_unidades: [], auditoria: [] };
  const authUsers: { id: string; email: string; last_sign_in_at?: string; user_metadata: Record<string, unknown> }[] = [];
  const senhas: Record<string, string> = {};
  function tabela(nome: string) {
    let filtro: ((l: Linha) => boolean) | null = null;
    let op: "select" | "update" | "delete" = "select";
    let campos: Linha = {};
    const b: Record<string, unknown> = {};
    const executar = () => {
      const linhas = tabelas[nome] ?? (tabelas[nome] = []);
      if (op === "update") for (const l of linhas.filter(filtro ?? (() => true))) Object.assign(l, campos);
      if (op === "delete") tabelas[nome] = linhas.filter((l) => !(filtro ?? (() => false))(l));
      return { data: (tabelas[nome] ?? []).filter(filtro ?? (() => true)), error: null };
    };
    b.select = () => b;
    b.eq = (c: string, v: unknown) => { const f = filtro; filtro = (l) => (f ? f(l) : true) && l[c] === v; return b; };
    b.update = (c: Linha) => { op = "update"; campos = c; return b; };
    b.delete = () => { op = "delete"; return b; };
    b.insert = (l: Linha | Linha[]) => {
      chamadas.push(`insert:${nome}`);
      if (nome === "perfis" && opcoes.falhaPerfil) return Promise.resolve({ error: { message: "falhou" } });
      tabelas[nome].push(...(Array.isArray(l) ? l : [l]));
      return Promise.resolve({ error: null });
    };
    b.maybeSingle = () => Promise.resolve({ data: executar().data[0] ?? null, error: null });
    b.then = (ok: (v: unknown) => unknown, ruim?: (e: unknown) => unknown) => Promise.resolve(executar()).then(ok, ruim);
    return b;
  }
  const admin = {
    from: tabela,
    auth: {
      admin: {
        listUsers: async () => ({ data: { users: authUsers }, error: null }),
        getUserById: async (id: string) => ({ data: { user: authUsers.find((u) => u.id === id) ?? null } }),
        createUser: async (d: { email: string; password: string; user_metadata: Record<string, unknown> }) => {
          chamadas.push("createUser");
          if (authUsers.some((u) => u.email === d.email)) return { data: { user: null }, error: { message: "User already registered" } };
          const u = { id: `u${authUsers.length + 1}`.padEnd(36, "0").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12}).*$/, "$1-$2-$3-$4-$5"), email: d.email, user_metadata: d.user_metadata };
          authUsers.push(u);
          senhas[u.id] = d.password;
          return { data: { user: u }, error: null };
        },
        deleteUser: async (id: string) => { chamadas.push("deleteUser"); authUsers.splice(authUsers.findIndex((u) => u.id === id), 1); return { error: null }; },
        updateUserById: async (id: string, d: { password?: string; user_metadata?: Record<string, unknown> }) => {
          const u = authUsers.find((x) => x.id === id)!;
          if (d.password) senhas[id] = d.password;
          if (d.user_metadata) u.user_metadata = d.user_metadata;
          return { error: null };
        },
      },
    },
  };
  return { admin: admin as never, chamadas, tabelas, authUsers, senhas };
}

const novo = { nome: "Maria", email: "maria@exemplo.com", perfil: "gerencia" as const, senha: "Abcdefghi1", unidadeIds: ["11111111-1111-1111-1111-111111111111"] };

describe("criar usuário", () => {
  it("cria no Auth, cria o perfil, libera as unidades e marca para trocar a senha", async () => {
    const f = falso();
    const { id } = await criarUsuario(f.admin, "admin-1", novo);
    expect(f.authUsers[0].user_metadata).toEqual({ trocar_senha: true });
    expect(f.tabelas.perfis[0]).toMatchObject({ id, nome: "Maria", perfil: "gerencia", ativo: true });
    expect(f.tabelas.usuario_unidades).toHaveLength(1);
  });
  it("e-mail repetido: mensagem clara (409) e nada fica para trás", async () => {
    const f = falso();
    await criarUsuario(f.admin, "admin-1", novo);
    await expect(criarUsuario(f.admin, "admin-1", novo)).rejects.toMatchObject({ status: 409, message: expect.stringContaining("Já existe") });
    expect(f.authUsers).toHaveLength(1);
  });
  it("se o perfil falhar, o usuário do Auth é desfeito (não sobra usuário sem perfil)", async () => {
    const f = falso({ falhaPerfil: true });
    await expect(criarUsuario(f.admin, "admin-1", novo)).rejects.toBeInstanceOf(ErroUsuario);
    expect(f.authUsers).toHaveLength(0);
    expect(f.chamadas).toContain("deleteUser");
  });
  it("só gerência recebe unidades; a auditoria não leva a senha", async () => {
    const f = falso();
    await criarUsuario(f.admin, "admin-1", { ...novo, perfil: "rh" });
    expect(f.tabelas.usuario_unidades).toHaveLength(0);
    expect(JSON.stringify(f.tabelas.auditoria)).not.toContain("Abcdefghi1");
  });
});

describe("alterar e senha", () => {
  const perfis = [
    { id: "a", nome: "Admin", perfil: "admin", ativo: true },
    { id: "b", nome: "Outro", perfil: "rh", ativo: true },
  ];
  it("não deixa inativar o único admin nem a si mesmo", async () => {
    const f = falso({ perfis });
    await expect(alterarUsuario(f.admin, "a", "a", { ativo: false })).rejects.toMatchObject({ status: 409 });
    expect(f.tabelas.perfis[0].ativo).toBe(true);
  });
  it("altera perfil e situação de outro usuário", async () => {
    const f = falso({ perfis });
    await alterarUsuario(f.admin, "a", "b", { perfil: "gerencia", ativo: false });
    expect(f.tabelas.perfis[1]).toMatchObject({ perfil: "gerencia", ativo: false });
  });
  it("usuário que não existe: 404", async () => {
    const f = falso({ perfis });
    await expect(alterarUsuario(f.admin, "a", "zz", { ativo: false })).rejects.toMatchObject({ status: 404 });
  });
  it("redefinir senha: valida, grava a senha e exige troca no próximo login", async () => {
    const f = falso();
    const { id } = await criarUsuario(f.admin, "admin-1", novo);
    await expect(redefinirSenha(f.admin, "admin-1", id, "curta")).rejects.toMatchObject({ status: 400 });
    await redefinirSenha(f.admin, "admin-1", id, "NovaSenha123");
    expect(f.senhas[id]).toBe("NovaSenha123");
    expect(f.authUsers[0].user_metadata.trocar_senha).toBe(true);
    expect(JSON.stringify(f.tabelas.auditoria)).not.toContain("NovaSenha123");
  });
  it("listar: junta e-mail, perfil e unidades; usuário sem perfil aparece inativo", async () => {
    const f = falso();
    await criarUsuario(f.admin, "admin-1", novo);
    f.authUsers.push({ id: "sem-perfil", email: "x@y.com", user_metadata: {} });
    const l = await listarUsuarios(f.admin);
    expect(l.find((u) => u.email === "maria@exemplo.com")).toMatchObject({ perfil: "gerencia", ativo: true, precisaTrocarSenha: true, unidadeIds: novo.unidadeIds });
    expect(l.find((u) => u.id === "sem-perfil")).toMatchObject({ ativo: false });
  });
});

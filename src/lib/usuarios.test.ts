import { describe, expect, it } from "vitest";
import { gerarSenha, lerMudanca, lerNovoUsuario, validarAlteracao, validarEmail, validarSenha } from "./usuarios";

const ID = "123e4567-e89b-12d3-a456-426614174000";

describe("senha e e-mail", () => {
  it("valida e-mail", () => {
    expect(validarEmail("fabio@exemplo.com")).toBeNull();
    expect(validarEmail("fabio@exemplo")).not.toBeNull();
    expect(validarEmail(" ")).not.toBeNull();
    expect(validarEmail(42)).not.toBeNull();
  });
  it("senha: mínimo, letras e números, sem espaço nas pontas", () => {
    expect(validarSenha("Abcdefghi1")).toBeNull();
    expect(validarSenha("curta1A")).toContain("pelo menos 10");
    expect(validarSenha("somente-letras-aqui")).toContain("letras e números");
    expect(validarSenha("1234567890123")).toContain("letras e números");
    expect(validarSenha(" Abcdefghi12")).toContain("espaço");
    expect(validarSenha("A1" + "x".repeat(80))).toContain("no máximo");
  });
  it("senha gerada sempre é válida, tem o tamanho pedido e não repete", () => {
    const vistas = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const s = gerarSenha();
      expect(s).toHaveLength(14);
      expect(validarSenha(s)).toBeNull();
      expect(s).not.toMatch(/[0O1lI]/);
      vistas.add(s);
    }
    expect(vistas.size).toBe(200);
    expect(gerarSenha(4)).toHaveLength(10); // nunca abaixo do mínimo
  });
});

describe("pedidos", () => {
  const ok = { nome: " Maria Souza ", email: " Maria@Exemplo.com ", perfil: "gerencia", senha: "Abcdefghi1", unidadeIds: [ID, ID] };
  it("novo usuário: normaliza nome e e-mail e tira unidades repetidas", () => {
    const r = lerNovoUsuario(ok);
    expect(r).toMatchObject({ ok: true, dados: { nome: "Maria Souza", email: "maria@exemplo.com", perfil: "gerencia", unidadeIds: [ID] } });
  });
  it("novo usuário: recusa dados ruins", () => {
    expect(lerNovoUsuario({ ...ok, nome: "A" })).toMatchObject({ ok: false });
    expect(lerNovoUsuario({ ...ok, email: "x" })).toMatchObject({ ok: false });
    expect(lerNovoUsuario({ ...ok, perfil: "dono" })).toMatchObject({ ok: false });
    expect(lerNovoUsuario({ ...ok, senha: "123" })).toMatchObject({ ok: false });
    expect(lerNovoUsuario({ ...ok, unidadeIds: ["x"] })).toMatchObject({ ok: false });
    expect(lerNovoUsuario(null)).toMatchObject({ ok: false });
  });
  it("mudança: só aceita campos válidos e não aceita vazia", () => {
    expect(lerMudanca({ ativo: false })).toEqual({ ok: true, mudanca: { ativo: false } });
    expect(lerMudanca({ perfil: "rh", unidadeIds: [] })).toMatchObject({ ok: true });
    expect(lerMudanca({})).toMatchObject({ ok: false });
    expect(lerMudanca({ perfil: "x" })).toMatchObject({ ok: false });
    expect(lerMudanca({ ativo: "sim" })).toMatchObject({ ok: false });
    expect(lerMudanca({ senha: "Abcdefghi1" })).toMatchObject({ ok: false }); // senha não passa por aqui
  });
});

describe("proteção contra se trancar", () => {
  const eu = { id: "a", perfil: "admin" as const, ativo: true };
  it("não deixa o admin rebaixar ou inativar a si mesmo", () => {
    expect(validarAlteracao({ chamadorId: "a", alvo: eu, mudanca: { perfil: "rh" }, adminsAtivos: ["a", "b"] })).toContain("próprio");
    expect(validarAlteracao({ chamadorId: "a", alvo: eu, mudanca: { ativo: false }, adminsAtivos: ["a", "b"] })).toContain("próprio");
    expect(validarAlteracao({ chamadorId: "a", alvo: eu, mudanca: { nome: "Novo nome" }, adminsAtivos: ["a"] })).toBeNull();
    expect(validarAlteracao({ chamadorId: "a", alvo: eu, mudanca: { perfil: "admin" }, adminsAtivos: ["a"] })).toBeNull();
  });
  it("sempre sobra outro admin ativo", () => {
    const outro = { id: "b", perfil: "admin" as const, ativo: true };
    expect(validarAlteracao({ chamadorId: "a", alvo: outro, mudanca: { ativo: false }, adminsAtivos: ["b"] })).toContain("pelo menos um administrador");
    expect(validarAlteracao({ chamadorId: "a", alvo: outro, mudanca: { ativo: false }, adminsAtivos: ["a", "b"] })).toBeNull();
    expect(validarAlteracao({ chamadorId: "a", alvo: { id: "c", perfil: "rh", ativo: true }, mudanca: { ativo: false }, adminsAtivos: ["a"] })).toBeNull();
  });
});

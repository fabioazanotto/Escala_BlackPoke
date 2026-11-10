import { describe, expect, it, vi } from "vitest";
import { ErroSecullum, SessaoSecullum, camposDe, candidatosDoCabecalhoBanco, listarBancos, montarUrl, obterToken, rotaPermitida } from "./secullum";

const env = { SECULLUM_USUARIO: "integracao@exemplo.com", SECULLUM_SENHA: "senha-super-secreta" };
const json = (corpo: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json", ...headers } });
const rapido = { esperaMs: 1, tentativas: 3, env };

/** Espera a promessa falhar e devolve o erro (falha o teste se ela der certo). */
async function erroDe(p: Promise<unknown>): Promise<ErroSecullum> {
  try {
    await p;
  } catch (e) {
    return e as ErroSecullum;
  }
  throw new Error("Era esperado um erro, mas deu certo.");
}

describe("rotas permitidas (somente leitura)", () => {
  it("libera as consultas", () => {
    for (const r of ["Funcionarios", "/Batidas", "FonteDados/APartirDoId", "horarios", "Funcionarios/Cpf"]) expect(rotaPermitida("GET", r)).toBe(true);
    expect(rotaPermitida("POST", "Calcular")).toBe(true);
    expect(rotaPermitida("POST", "/Calcular/SomenteTotais")).toBe(true);
  });
  it("recusa qualquer escrita", () => {
    for (const r of ["Funcionarios", "Horarios", "Empresas", "Departamentos", "Funcoes", "Justificativas", "FuncionariosAfastamentos"]) {
      expect(rotaPermitida("POST", r)).toBe(false);
      expect(rotaPermitida("DELETE", r)).toBe(false);
    }
    for (const r of ["CartaoPonto/Manual", "CartaoPonto/Justificativa", "CartaoPonto/Troca", "InclusaoPonto/Incluir", "GestaoArquivos", "GravarLogsIniciarBkp"]) {
      expect(rotaPermitida("POST", r)).toBe(false);
      expect(rotaPermitida("GET", r)).toBe(false);
    }
    expect(rotaPermitida("DELETE", "CartaoPonto")).toBe(false);
    expect(rotaPermitida("PUT", "Funcionarios")).toBe(false);
  });
  it("a sessão lança ROTA_BLOQUEADA sem chamar a rede", async () => {
    const f = vi.fn();
    const s = new SessaoSecullum("1", { ...rapido, fetchFn: f as unknown as typeof fetch });
    await expect(s.chamar("POST", "Funcionarios", {}, { Cpf: "1" })).rejects.toMatchObject({ codigo: "ROTA_BLOQUEADA" });
    expect(f).not.toHaveBeenCalled();
  });
});

describe("autenticação", () => {
  it("envia os campos corretos e devolve o token", async () => {
    const f = vi.fn(async (_u: string, init?: RequestInit) => {
      expect(String(init?.body)).toContain("grant_type=password");
      expect(String(init?.body)).toContain("client_id=3");
      return json({ access_token: "T123" });
    });
    expect(await obterToken({ ...rapido, fetchFn: f as unknown as typeof fetch })).toBe("T123");
    expect(f.mock.calls[0][0]).toBe("https://autenticador.secullum.com.br/Token");
  });
  it("sem variáveis: SEM_CONFIGURACAO", async () => {
    await expect(obterToken({ env: {}, fetchFn: vi.fn() as unknown as typeof fetch })).rejects.toMatchObject({ codigo: "SEM_CONFIGURACAO" });
  });
  it("login recusado: NAO_AUTORIZADO e a senha nunca aparece na mensagem", async () => {
    const f = vi.fn(async () => json({ error: "invalid_grant" }, 400));
    const e = await erroDe(obterToken({ ...rapido, fetchFn: f as unknown as typeof fetch }));
    expect(e.codigo).toBe("NAO_AUTORIZADO");
    expect(e.message).not.toContain(env.SECULLUM_SENHA);
    expect(e.message).not.toContain(env.SECULLUM_USUARIO);
  });
  it("resposta sem token: RESPOSTA_INVALIDA", async () => {
    const f = vi.fn(async () => json({ outro: 1 }));
    await expect(obterToken({ ...rapido, fetchFn: f as unknown as typeof fetch })).rejects.toMatchObject({ codigo: "RESPOSTA_INVALIDA" });
  });
  it("falha de rede e tempo esgotado viram erros claros", async () => {
    const rede = vi.fn(async () => { throw new TypeError("fetch failed: senha-super-secreta"); });
    const e = await erroDe(obterToken({ ...rapido, fetchFn: rede as unknown as typeof fetch }));
    expect(e.codigo).toBe("ERRO_DE_REDE");
    expect(e.message).not.toContain("secreta");
  });
});

describe("bancos", () => {
  it("lista e escolhe os valores possíveis do cabeçalho", async () => {
    const f = vi.fn(async () => json([{ id: 12345, identificador: "AB-123", nome: "Banco X", plano: 2 }]));
    const b = await listarBancos("T", { ...rapido, fetchFn: f as unknown as typeof fetch });
    expect(b).toEqual([{ id: 12345, identificador: "AB-123", nome: "Banco X" }]);
    expect(candidatosDoCabecalhoBanco(b[0])).toEqual(["12345", "AB123"]);
    expect(candidatosDoCabecalhoBanco({ id: "777", identificador: "777", nome: "" })).toEqual(["777"]);
  });
});

describe("chamadas à API", () => {
  const ok = (corpo: unknown) => json(corpo);
  function roteador(tratadores: Record<string, (init?: RequestInit) => Response>) {
    return vi.fn(async (url: string, init?: RequestInit) => {
      const chave = Object.keys(tratadores).find((k) => url.includes(k))!;
      return tratadores[chave](init);
    });
  }

  it("manda o token e o banco nos cabeçalhos", async () => {
    let cab: Headers | undefined;
    const f = roteador({
      "/Token": () => ok({ access_token: "T1" }),
      "/IntegracaoExterna/Departamentos": (init) => { cab = new Headers(init?.headers); return ok([{ Id: 1 }]); },
    });
    const s = new SessaoSecullum("12345", { ...rapido, fetchFn: f as unknown as typeof fetch });
    expect(await s.obter("Departamentos")).toEqual([{ Id: 1 }]);
    expect(cab?.get("authorization")).toBe("Bearer T1");
    expect(cab?.get("secullumidbancoselecionado")).toBe("12345");
  });

  it("401: reautentica UMA vez e repete; segundo 401 vira NAO_AUTORIZADO", async () => {
    let tokens = 0;
    let chamadas = 0;
    const f = roteador({
      "/Token": () => ok({ access_token: `T${++tokens}` }),
      "/IntegracaoExterna/Funcionarios": () => (++chamadas === 1 ? new Response("", { status: 401 }) : ok([{ ok: 1 }])),
    });
    const s = new SessaoSecullum("1", { ...rapido, fetchFn: f as unknown as typeof fetch });
    expect(await s.obter("Funcionarios")).toEqual([{ ok: 1 }]);
    expect(tokens).toBe(2);

    let toks = 0;
    const sempre401 = roteador({ "/Token": () => ok({ access_token: `X${++toks}` }), "/IntegracaoExterna/": () => new Response("", { status: 401 }) });
    const s2 = new SessaoSecullum("1", { ...rapido, fetchFn: sempre401 as unknown as typeof fetch });
    await expect(s2.obter("Funcionarios")).rejects.toMatchObject({ codigo: "NAO_AUTORIZADO" });
    expect(toks).toBe(2); // login inicial + uma renovação, não mais
  });

  it("GET repete em 429/5xx e para quando dá certo", async () => {
    let n = 0;
    const f = roteador({ "/Token": () => ok({ access_token: "T" }), "/IntegracaoExterna/Batidas": () => (++n < 3 ? new Response("", { status: n === 1 ? 429 : 503 }) : ok([1])) });
    const s = new SessaoSecullum("1", { ...rapido, fetchFn: f as unknown as typeof fetch });
    expect(await s.obter("Batidas", { dataInicio: "2026-11-09", dataFim: "2026-11-09" })).toEqual([1]);
    expect(n).toBe(3);
  });

  it("erro 400 traz a validação do Secullum, e 400 não é repetido", async () => {
    let n = 0;
    const f = roteador({ "/Token": () => ok({ access_token: "T" }), "/IntegracaoExterna/Batidas": () => { n++; return json([{ Property: "DataInicio", Message: "obrigatório" }], 400); } });
    const s = new SessaoSecullum("1", { ...rapido, fetchFn: f as unknown as typeof fetch });
    const e = await erroDe(s.obter("Batidas"));
    expect(e.codigo).toBe("REQUISICAO_INVALIDA");
    expect(e.message).toContain("DataInicio");
    expect(n).toBe(1);
  });

  it("Calcular (POST de consulta) não é repetido sozinho", async () => {
    let n = 0;
    const f = roteador({ "/Token": () => ok({ access_token: "T" }), "/IntegracaoExterna/Calcular": () => { n++; return new Response("", { status: 503 }); } });
    const s = new SessaoSecullum("1", { ...rapido, fetchFn: f as unknown as typeof fetch });
    await expect(s.chamar("POST", "Calcular", {}, { FuncionarioCpf: "1" })).rejects.toMatchObject({ codigo: "ERRO_DO_SERVIDOR" });
    expect(n).toBe(1);
  });

  it("banco incorreto: o erro do servidor aparece sem expor credenciais", async () => {
    const f = roteador({ "/Token": () => ok({ access_token: "T" }), "/IntegracaoExterna/": () => new Response("", { status: 403 }) });
    const s = new SessaoSecullum("999", { ...rapido, fetchFn: f as unknown as typeof fetch });
    const e = await erroDe(s.obter("Funcionarios"));
    expect(e.codigo).toBe("NAO_AUTORIZADO");
    expect(e.message).not.toContain("senha-super-secreta");
  });
});

describe("utilitários", () => {
  it("monta URL com parâmetros e ignora vazios", () => {
    expect(montarUrl("Batidas", { dataInicio: "2026-11-09", dataFim: "2026-11-09", funcionarioCpf: undefined, x: "" })).toBe(
      "https://pontowebintegracaoexterna.secullum.com.br/IntegracaoExterna/Batidas?dataInicio=2026-11-09&dataFim=2026-11-09",
    );
  });
  it("campos: nomes e tipos, nunca valores", () => {
    const c = camposDe([{ Nome: "Fulano", Cpf: "123", Demissao: null }, { Nome: "X", Demissao: "2026-01-01" }]);
    expect(JSON.stringify(c)).not.toContain("Fulano");
    expect(c.find((x) => x.campo === "Demissao")?.tipos).toEqual(["null", "string"]);
  });
});

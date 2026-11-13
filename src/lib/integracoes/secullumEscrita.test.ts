import { describe, expect, it, vi } from "vitest";
import { ErroSecullum } from "./secullum";
import { SessaoSecullumEscrita, credenciaisDeEscrita, rotaDeEscritaPermitida } from "./secullumEscrita";

const env = { SECULLUM_ESCRITA_USUARIO: "escrita@x.com", SECULLUM_ESCRITA_SENHA: "segredo", SECULLUM_USUARIO: "leitura@x.com", SECULLUM_SENHA: "outra" };

function falso(respostas: { status: number; corpo?: unknown }[]) {
  const chamadas: { url: string; init: RequestInit }[] = [];
  let i = 0;
  const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    chamadas.push({ url: String(url), init: init ?? {} });
    const r = String(url).includes("/Token") ? { status: 200, corpo: { access_token: "tok" } } : (respostas[i++] ?? { status: 200 });
    return new Response(r.corpo === undefined ? "" : JSON.stringify(r.corpo), { status: r.status });
  });
  return { fetchFn: fetchFn as unknown as typeof fetch, chamadas };
}

describe("lista de operações de escrita", () => {
  it("libera só as 4 operações desta etapa", () => {
    expect(rotaDeEscritaPermitida("POST", "CartaoPonto/Justificativa")).toBe(true);
    expect(rotaDeEscritaPermitida("DELETE", "/CartaoPonto/")).toBe(true);
    expect(rotaDeEscritaPermitida("POST", "FuncionariosAfastamentos")).toBe(true);
    expect(rotaDeEscritaPermitida("DELETE", "FuncionariosAfastamentos/Cpf")).toBe(true);
  });
  it("recusa tudo o mais: apagar/alterar funcionário, batida manual, troca, horários, empresas, leitura", () => {
    for (const [m, c] of [["DELETE", "Funcionarios"], ["DELETE", "Funcionarios/Cpf"], ["POST", "Funcionarios"], ["POST", "CartaoPonto/Manual"], ["POST", "CartaoPonto/Troca"], ["POST", "CartaoPonto/TrocaDia"], ["POST", "Horarios"], ["DELETE", "Empresas"], ["POST", "Empresas"], ["GET", "Funcionarios"], ["POST", "CartaoPonto"]]) {
      expect(rotaDeEscritaPermitida(m, c), `${m} ${c}`).toBe(false);
    }
  });
});

describe("SessaoSecullumEscrita", () => {
  it("usa a conta de ESCRITA (não a de leitura) e manda os cabeçalhos certos", async () => {
    const { fetchFn, chamadas } = falso([{ status: 200 }]);
    const s = new SessaoSecullumEscrita("123", { env, fetchFn, esperaMs: 0 });
    await s.escrever("POST", "CartaoPonto/Justificativa", { corpo: { Cpf: "1", Data: "2026-11-10", Grupo: 1, Justificativa: "ATEST" } });
    expect(String(chamadas[0].init.body)).toContain("escrita%40x.com");
    expect(String(chamadas[0].init.body)).not.toContain("leitura");
    const h = chamadas[1].init.headers as Record<string, string>;
    expect(h.secullumidbancoselecionado).toBe("123");
    expect(h.Authorization).toBe("Bearer tok");
    expect(chamadas[1].url).toContain("/IntegracaoExterna/CartaoPonto/Justificativa");
  });
  it("recusa rota fora da lista sem chamar a rede", async () => {
    const { fetchFn, chamadas } = falso([]);
    const s = new SessaoSecullumEscrita("123", { env, fetchFn });
    await expect(s.escrever("DELETE", "Funcionarios/Cpf", { params: { cpf: "1" } })).rejects.toMatchObject({ codigo: "ROTA_BLOQUEADA" });
    expect(chamadas).toHaveLength(0);
  });
  it("não repete a escrita quando o Secullum recusa, e mostra o motivo do 400", async () => {
    const { fetchFn, chamadas } = falso([{ status: 400, corpo: [{ Property: "Grupo", Message: "Já existe batida original" }] }]);
    const s = new SessaoSecullumEscrita("123", { env, fetchFn, esperaMs: 0 });
    const e = await s.escrever("POST", "CartaoPonto/Justificativa", { corpo: {} }).catch((x) => x as ErroSecullum);
    expect(e).toBeInstanceOf(ErroSecullum);
    expect((e as ErroSecullum).message).toContain("Já existe batida original");
    expect(chamadas.filter((c) => c.url.includes("CartaoPonto"))).toHaveLength(1);
  });
  it("reautentica uma vez no 401", async () => {
    const { fetchFn, chamadas } = falso([{ status: 401 }, { status: 200 }]);
    const s = new SessaoSecullumEscrita("123", { env, fetchFn, esperaMs: 0 });
    await s.escrever("POST", "FuncionariosAfastamentos", { corpo: {} });
    expect(chamadas.filter((c) => c.url.includes("/Token"))).toHaveLength(2);
  });
  it("DELETE com parâmetros na URL e sem corpo", async () => {
    const { fetchFn, chamadas } = falso([{ status: 200 }]);
    await new SessaoSecullumEscrita("1", { env, fetchFn }).escrever("DELETE", "FuncionariosAfastamentos/Cpf", { params: { dataInicio: "2026-11-10", dataFim: "2026-11-12", funcionarioCpf: "111" } });
    expect(chamadas[1].url).toContain("dataInicio=2026-11-10");
    expect(chamadas[1].init.body).toBeUndefined();
  });
  it("sem as variáveis de escrita, diz quais faltam", () => {
    expect(() => credenciaisDeEscrita({})).toThrowError(/SECULLUM_ESCRITA_USUARIO/);
  });
});

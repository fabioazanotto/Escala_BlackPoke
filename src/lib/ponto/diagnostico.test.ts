import { describe, expect, it, vi } from "vitest";
import { diagnosticar, textosEspeciaisDeBatidas } from "./diagnostico";

const env = { SECULLUM_USUARIO: "u@x.com", SECULLUM_SENHA: "SenhaMuitoSecreta123" };
const json = (c: unknown, s = 200) => new Response(JSON.stringify(c), { status: s, headers: { "Content-Type": "application/json" } });

function servidor(opts: { bancoAceitaId?: boolean; bancos?: unknown[] } = {}) {
  const { bancoAceitaId = true, bancos = [{ id: 111, identificador: "AB-111", nome: "Banco Teste" }] } = opts;
  return vi.fn(async (url: string, init?: RequestInit) => {
    const h = new Headers(init?.headers);
    if (url.endsWith("/Token")) return json({ access_token: "TOK" });
    if (url.includes("ListarBancos")) return json(bancos);
    const banco = h.get("secullumidbancoselecionado");
    if (banco !== (bancoAceitaId ? "111" : "AB111")) return json([], 403);
    if (url.includes("/Departamentos")) return json([{ Id: 1, Descricao: "Cozinha" }]);
    if (url.includes("/Empresas")) return json([{ Id: 10, Nome: "Empresa A ", Documento: "11.111.111/0001-11" }, { Id: 20, Nome: "Empresa B", Documento: "22.222.222/0001-22" }]);
    if (url.includes("/Funcionarios")) return json([
      { Nome: "Fulano Secreto", Cpf: "99999999999", EmpresaId: 10, Demissao: null },
      { Nome: "Ciclano Secreto", Cpf: "88888888888", EmpresaId: 10, Demissao: "2026-01-01" },
      { Nome: "Beltrano Secreto", Cpf: "77777777777", EmpresaId: 20, Demissao: null },
      { Nome: "Outro Secreto", Cpf: "66666666666", EmpresaId: 99, Demissao: null },
    ]);
    if (url.includes("/Calcular")) return json({ Colunas: ["Data", "Normais", "Faltas"], Linhas: [{ Key: "2026-11-09T00:00:00", Value: ["09/11/2026 – Seg", "07:20", "00:00"] }], Totais: ["", "07:20", "00:00"] });
    if (url.includes("/Horarios")) return json([{ Numero: 1, Dias: [{ DiaSemana: 0, Entrada1: "09:00" }] }]);
    if (url.includes("/Funcoes")) return json([{ Descricao: "Cozinheiro" }]);
    if (url.includes("/Justificativas")) return json([{ NomeAbreviado: "ATEST" }]);
    if (url.includes("/Equipamentos")) return json([{ Id: 3, Descricao: "Checkin", EnderecoIP: "" }]);
    if (url.includes("/FuncionariosAfastamentos")) return json([]);
    if (url.includes("/Batidas")) return json([{ Data: "2026-11-09", Entrada1: "09:02", Saida1: "FOLGA", Entrada2: "FALTA", Observacoes: "texto livre pessoal" }]);
    if (url.includes("/FonteDados/APartirDoId")) return json([{ Id: 50 }]);
    if (url.includes("/FonteDados")) return json([{ Id: 49, Hora: "09:02", Tipo: 0, Origem: 4, EquipamentoId: 3, FuncionarioCpf: "99999999999" }, { Id: 50, Hora: "17:00", Tipo: 0, Origem: 4, EquipamentoId: 3, FuncionarioCpf: "99999999999" }]);
    return json({}, 404);
  });
}

describe("diagnóstico", () => {
  it("percorre todas as etapas e conta ativos por empresa", async () => {
    const f = servidor();
    const d = await diagnosticar("2026-11-10", "2026-11-09", { env, fetchFn: f as unknown as typeof fetch, esperaMs: 1 });
    expect(d.etapas.every((e) => e.ok)).toBe(true);
    expect(d.bancoUsado).toBe("id");
    expect(d.empresas).toEqual([
      { id: 10, nome: "Empresa A", documento: "11.111.111/0001-11", funcionariosAtivos: 1, funcionariosDesligados: 1 },
      { id: 20, nome: "Empresa B", documento: "22.222.222/0001-22", funcionariosAtivos: 1, funcionariosDesligados: 0 },
    ]);
    expect(d.funcionariosSemEmpresaVisivel).toBe(1);
    expect(d.etapas.map((e) => e.nome)).toContain("Leitura incremental (a partir de um ID)");
    const calculo = d.etapas.find((e) => e.nome.startsWith("Cálculos oficiais"));
    expect(calculo?.ok).toBe(true);
    expect(calculo?.detalhes).toEqual({ colunas: ["Data", "Normais", "Faltas"] });
  });

  it("não vaza dados pessoais, senha nem horários de batida", async () => {
    const f = servidor();
    const d = await diagnosticar("2026-11-10", "2026-11-09", { env, fetchFn: f as unknown as typeof fetch, esperaMs: 1 });
    const texto = JSON.stringify(d);
    for (const proibido of ["Secreto", "99999999999", "88888888888", "66666666666", env.SECULLUM_SENHA, env.SECULLUM_USUARIO, "texto livre pessoal", "09:02", "17:00", "TOK", "07:20", "09/11/2026"]) {
      expect(texto).not.toContain(proibido);
    }
  });

  it("descobre os textos especiais só nos campos de horário", async () => {
    expect(textosEspeciaisDeBatidas([{ Entrada1: "09:00", Saida1: "FOLGA", Entrada2: "FALTA", Observacoes: "nome da pessoa" }])).toEqual(["FOLGA", "FALTA"]);
  });

  it("se o id numérico não funciona, tenta o identificador sem símbolos", async () => {
    const f = servidor({ bancoAceitaId: false });
    const d = await diagnosticar("2026-11-10", "2026-11-09", { env, fetchFn: f as unknown as typeof fetch, esperaMs: 1 });
    expect(d.bancoUsado).toBe("identificador");
  });

  it("vários bancos sem escolha: para e explica", async () => {
    const f = servidor({ bancos: [{ id: 1, identificador: "A", nome: "A" }, { id: 2, identificador: "B", nome: "B" }] });
    const d = await diagnosticar("2026-11-10", "2026-11-09", { env, fetchFn: f as unknown as typeof fetch, esperaMs: 1 });
    expect(d.etapas.at(-1)?.ok).toBe(false);
    expect(d.etapas.at(-1)?.mensagem).toContain("SECULLUM_BANCO_ID");
  });

  it("login recusado: para na primeira etapa", async () => {
    const f = vi.fn(async () => json({}, 400));
    const d = await diagnosticar("2026-11-10", "2026-11-09", { env, fetchFn: f as unknown as typeof fetch, esperaMs: 1 });
    expect(d.etapas).toHaveLength(1);
    expect(d.etapas[0].ok).toBe(false);
  });
});

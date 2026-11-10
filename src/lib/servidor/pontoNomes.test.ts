import { beforeEach, describe, expect, it, vi } from "vitest";

const dados: Record<string, unknown> = {};
vi.mock("./pontoDados", async (original) => {
  const real = await original<typeof import("./pontoDados")>();
  return {
    ...real,
    carregarContexto: async () => ({
      contexto: { bancoId: "b1", empresas: [{ empresaId: 3, nome: "B. P COMERCIO ", unidadeId: "u1", unidadeNome: "Santos", lojaChave: "santos" }], sessao: { obter: async (c: string) => dados[c] ?? [] } },
      empresasApi: [],
    }),
  };
});

import { reiniciarCache } from "./cacheCurto";
import { aplicarNomes, propostasDeNomes } from "./pontoNomes";

function bancoFalso(tabelas: Record<string, unknown[]>, atualizacoes: { id: string; campos: Record<string, unknown> }[]) {
  return {
    from: (tabela: string) => {
      let atualizando: Record<string, unknown> | null = null;
      const b: Record<string, unknown> = {};
      for (const m of ["select", "is", "in"]) b[m] = () => b;
      b.update = (campos: Record<string, unknown>) => { atualizando = campos; return b; };
      b.eq = (_col: string, valor: string) => {
        if (atualizando) atualizacoes.push({ id: valor, campos: atualizando });
        return b;
      };
      b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: tabelas[tabela] ?? [], error: null }).then(ok);
      return b;
    },
  } as never;
}

describe("nome completo e empresa pelo Secullum", () => {
  beforeEach(() => {
    reiniciarCache();
    dados.Funcionarios = [
      { Id: 10, Nome: "LENILTON GOMES DE SÁ", Cpf: "123", EmpresaId: 3, Demissao: null },
      { Id: 11, Nome: "Rafaella Costa", Cpf: "456", EmpresaId: 3, Demissao: null },
      { Id: 12, Nome: "Fora Do Projeto", Cpf: "789", EmpresaId: 99, Demissao: null },
    ];
  });
  const tabelas = {
    colaborador_ponto_ids: [{ colaborador_id: "c1", secullum_funcionario_id: 10 }, { colaborador_id: "c2", secullum_funcionario_id: 11 }, { colaborador_id: "c3", secullum_funcionario_id: 12 }],
    colaboradores: [
      { id: "c1", nome: "Lenilto", nome_completo: null, empresa: null },
      { id: "c2", nome: "Rafaella", nome_completo: "Rafaella Costa", empresa: "B. P COMERCIO" },
      { id: "c3", nome: "Fora", nome_completo: null, empresa: null },
    ],
  };

  it("propõe só para vinculados de empresas do projeto e marca quem já está igual", async () => {
    const p = await propostasDeNomes(bancoFalso(tabelas, []));
    expect(p.map((x) => x.nomeCurto)).toEqual(["Lenilto", "Rafaella"]); // "Fora" é de empresa fora do projeto
    const len = p.find((x) => x.nomeCurto === "Lenilto")!;
    expect(len).toMatchObject({ nomeCompletoNovo: "Lenilton Gomes de Sá", empresaNova: "B. P COMERCIO", muda: true });
    expect(p.find((x) => x.nomeCurto === "Rafaella")!.muda).toBe(false);
  });

  it("aplicar grava só nome_completo e empresa, só de quem muda, e nunca o nome curto", async () => {
    const gravacoes: { id: string; campos: Record<string, unknown> }[] = [];
    const r = await aplicarNomes(bancoFalso(tabelas, gravacoes));
    expect(r.atualizados).toBe(1);
    expect(gravacoes).toEqual([{ id: "c1", campos: { nome_completo: "Lenilton Gomes de Sá", empresa: "B. P COMERCIO" } }]);
    expect(Object.keys(gravacoes[0].campos)).not.toContain("nome");
  });

  it("aplicar com ids limita aos escolhidos", async () => {
    const gravacoes: { id: string; campos: Record<string, unknown> }[] = [];
    const r = await aplicarNomes(bancoFalso(tabelas, gravacoes), ["c2"]);
    expect(r.atualizados).toBe(0); // c2 já está igual
    expect(gravacoes).toHaveLength(0);
  });
});

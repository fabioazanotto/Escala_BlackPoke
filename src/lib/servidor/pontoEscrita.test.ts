import { beforeEach, describe, expect, it, vi } from "vitest";
import { reiniciarCache } from "./cacheCurto";
import { agoraNoBrasil, diaDeTrabalho } from "@/lib/ponto/aoVivo";
import { somarDiasData } from "@/lib/vendas/datas";

const estado = vi.hoisted(() => ({
  escritas: [] as { metodo: string; caminho: string; corpo?: Record<string, unknown>; params?: Record<string, unknown> }[],
  falharNaEscrita: null as number | null, // número (1-based) da escrita que falha
  justificativasNoDia: [] as { grupo: number; texto: string }[], // o que o "Secullum" tem no dia
  batidasNoDia: [] as string[],
  afastamentos: [] as { Inicio: string; Fim: string; JustificativaNome: string; Motivo: string }[],
  nomeFuncionario: "Teste",
  auditoria: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/integracoes/secullumEscrita", () => ({
  SessaoSecullumEscrita: class {
    async escrever(metodo: string, caminho: string, opcoes: { corpo?: Record<string, unknown>; params?: Record<string, unknown> } = {}) {
      estado.escritas.push({ metodo, caminho, ...opcoes });
      if (estado.falharNaEscrita !== null && estado.escritas.length === estado.falharNaEscrita) throw new Error("O Secullum não aceitou o pedido: Grupo: erro simulado");
      if (caminho === "CartaoPonto/Justificativa") estado.justificativasNoDia.push({ grupo: Number(opcoes.corpo!.Grupo), texto: String(opcoes.corpo!.Justificativa) });
      if (metodo === "DELETE" && caminho === "CartaoPonto") estado.justificativasNoDia = estado.justificativasNoDia.filter((j) => `Entrada${j.grupo}` !== opcoes.corpo!.Coluna && `Saida${j.grupo}` !== opcoes.corpo!.Coluna);
      if (caminho === "FuncionariosAfastamentos") estado.afastamentos.push({ Inicio: String(opcoes.corpo!.Inicio), Fim: String(opcoes.corpo!.Fim), JustificativaNome: String(opcoes.corpo!.JustificativaNome), Motivo: String(opcoes.corpo!.Motivo ?? "") });
      if (caminho === "FuncionariosAfastamentos/Cpf") estado.afastamentos = estado.afastamentos.filter((a) => !(a.Inicio === opcoes.params!.dataInicio && a.Fim === opcoes.params!.dataFim));
      return { status: 200, corpo: null };
    }
  },
}));

vi.mock("./pontoDados", async (importar) => {
  const real = await importar<typeof import("./pontoDados")>();
  const dia7 = [0, 1, 2, 3, 4, 5, 6].map((d) => ({ DiaSemana: d, Entrada1: "16:00", Saida1: "17:30", Entrada2: "18:30", Saida2: "00:20", TipoDia: 0 }));
  const leitura = {
    obter: async (caminho: string) => {
      switch (caminho) {
        case "Funcionarios": return [{ Id: 7, Nome: estado.nomeFuncionario, Cpf: "111.222.333-96", EmpresaId: 1, HorarioId: 5 }];
        case "Horarios": return [{ Id: 5, Dias: dia7 }];
        case "Justificativas": return [{ NomeAbreviado: "ATEST", NomeCompleto: "Atestado" }];
        case "Batidas": {
          const linha: Record<string, unknown> = { FuncionarioId: 7, Data: "x" };
          estado.batidasNoDia.forEach((h, i) => (linha[i % 2 === 0 ? `Entrada${Math.floor(i / 2) + 1}` : `Saida${Math.floor(i / 2) + 1}`] = h));
          for (const j of estado.justificativasNoDia) linha[`Entrada${j.grupo}`] = j.texto;
          return [new Proxy(linha, {})].map((l) => ({ ...l, Data: (globalThis as { __dia?: string }).__dia }));
        }
        case "FuncionariosAfastamentos": return estado.afastamentos;
        default: return [];
      }
    },
  };
  return { ...real, carregarContexto: async () => ({ contexto: { bancoId: "b1", sessao: leitura, empresas: [{ empresaId: 1, nome: "EMP", unidadeId: null, unidadeNome: null, lojaChave: "santos" }] }, empresasApi: [] }) };
});

import { processarEscrita } from "./pontoEscrita";

const hoje = diaDeTrabalho(agoraNoBrasil()).dia;
const passado = somarDiasData(hoje, -3);

function dbFalso() {
  return {
    from: (tabela: string) => {
      if (tabela === "ponto_bancos") return { select: () => ({ eq: async () => ({ data: [{ secullum_id: 99 }] }) }) };
      if (tabela === "secullum_escritas") return { insert: async (linha: Record<string, unknown>) => { estado.auditoria.push(linha); return { error: null }; } };
      throw new Error("tabela inesperada " + tabela);
    },
  } as never;
}
const quem = { nome: "Fabio" };

beforeEach(() => {
  reiniciarCache();
  estado.escritas = [];
  estado.falharNaEscrita = null;
  estado.justificativasNoDia = [];
  estado.batidasNoDia = [];
  estado.afastamentos = [];
  estado.nomeFuncionario = "Teste";
  estado.auditoria = [];
  (globalThis as { __dia?: string }).__dia = passado;
});

describe("modo teste e prévia", () => {
  it("recusa funcionário que não é o de teste, sem escrever nada", async () => {
    estado.nomeFuncionario = "Maria Silva";
    await expect(processarEscrita(dbFalso(), quem, { acao: "justificar", funcionario: 7, dia: passado, justificativa: "ATEST" })).rejects.toThrow(/Modo teste/);
    expect(estado.escritas).toHaveLength(0);
  });
  it("sem confirmar só mostra a prévia (grupos 1 e 2) e não grava", async () => {
    const r = await processarEscrita(dbFalso(), quem, { acao: "justificar", funcionario: 7, dia: passado, justificativa: "ATEST" });
    expect(r.previa?.linhas.join("\n")).toContain("Grupos de batidas: 1 e 2");
    expect(r.resultado).toBeUndefined();
    expect(estado.escritas).toHaveLength(0);
    expect(estado.auditoria).toHaveLength(0);
  });
  it("recusa dia que não passou e dia com batida", async () => {
    await expect(processarEscrita(dbFalso(), quem, { acao: "justificar", funcionario: 7, dia: hoje, justificativa: "ATEST" })).rejects.toThrow(/já passou/);
    estado.batidasNoDia = ["16:00", "17:30"];
    await expect(processarEscrita(dbFalso(), quem, { acao: "justificar", funcionario: 7, dia: passado, justificativa: "ATEST" })).rejects.toThrow(/tem batida/);
    expect(estado.escritas).toHaveLength(0);
  });
  it("recusa justificativa que não existe na lista do Secullum", async () => {
    await expect(processarEscrita(dbFalso(), quem, { acao: "justificar", funcionario: 7, dia: passado, justificativa: "XXXX" })).rejects.toThrow(/lista do Secullum/);
  });
});

describe("justificar", () => {
  it("confirmado: um POST por grupo, conferência e auditoria sem CPF", async () => {
    const r = await processarEscrita(dbFalso(), quem, { acao: "justificar", funcionario: 7, dia: passado, justificativa: "ATEST", confirmar: true });
    expect(estado.escritas.map((e) => [e.metodo, e.caminho, e.corpo?.Grupo])).toEqual([["POST", "CartaoPonto/Justificativa", 1], ["POST", "CartaoPonto/Justificativa", 2]]);
    expect(estado.escritas[0].corpo).toMatchObject({ Cpf: "111.222.333-96", Data: passado, Justificativa: "ATEST" });
    expect(r.resultado?.mensagem).toContain("conferida");
    expect(estado.auditoria).toHaveLength(1);
    expect(estado.auditoria[0]).toMatchObject({ acao: "justificar", status: "ok", funcionario_ponto_id: 7, lancado_por_nome: "Fabio" });
    expect(JSON.stringify(estado.auditoria)).not.toContain("111.222");
  });
  it("se o 2º grupo falha, desfaz o 1º e avisa", async () => {
    estado.falharNaEscrita = 2;
    await expect(processarEscrita(dbFalso(), quem, { acao: "justificar", funcionario: 7, dia: passado, justificativa: "ATEST", confirmar: true })).rejects.toThrow(/foram desfeitos/);
    expect(estado.escritas.map((e) => e.metodo)).toEqual(["POST", "POST", "DELETE"]);
    expect(estado.escritas[2].corpo).toMatchObject({ Coluna: "Entrada1" });
    expect(estado.justificativasNoDia).toHaveLength(0);
    expect(estado.auditoria[0]).toMatchObject({ status: "erro" });
  });
});

describe("remover justificativa", () => {
  it("só remove justificativa existente, nunca batida", async () => {
    await expect(processarEscrita(dbFalso(), quem, { acao: "remover_justificativa", funcionario: 7, dia: passado, confirmar: true })).rejects.toThrow(/Não há justificativa/);
    expect(estado.escritas).toHaveLength(0);
    estado.justificativasNoDia = [{ grupo: 1, texto: "ATEST" }, { grupo: 2, texto: "ATEST" }];
    const r = await processarEscrita(dbFalso(), quem, { acao: "remover_justificativa", funcionario: 7, dia: passado, confirmar: true });
    expect(estado.escritas.every((e) => e.metodo === "DELETE" && e.caminho === "CartaoPonto")).toBe(true);
    expect(r.resultado?.mensagem).toContain("conferida");
  });
});

describe("afastamento", () => {
  const ini = somarDiasData(hoje, 2);
  const fim = somarDiasData(hoje, 3);
  it("lança, confere e registra; depois apaga com a mesma data exata", async () => {
    const r = await processarEscrita(dbFalso(), quem, { acao: "afastamento", funcionario: 7, inicio: ini, fim, justificativa: "ATEST", motivo: "Consulta", confirmar: true });
    expect(r.resultado?.mensagem).toContain("conferido");
    expect(estado.escritas[0]).toMatchObject({ metodo: "POST", caminho: "FuncionariosAfastamentos", corpo: { Inicio: ini, Fim: fim, JustificativaNome: "ATEST", Motivo: "Consulta" } });
    const lista = await processarEscrita(dbFalso(), quem, { acao: "listar_afastamentos", funcionario: 7 });
    expect(lista.afastamentos).toHaveLength(1);
    const apagar = await processarEscrita(dbFalso(), quem, { acao: "remover_afastamento", funcionario: 7, inicio: ini, fim, confirmar: true });
    expect(apagar.resultado?.mensagem).toContain("conferido");
    expect(estado.escritas[1]).toMatchObject({ metodo: "DELETE", caminho: "FuncionariosAfastamentos/Cpf", params: { dataInicio: ini, dataFim: fim } });
  });
  it("recusa período que se sobrepõe a outro e período trocado; só apaga com datas exatas", async () => {
    estado.afastamentos = [{ Inicio: ini, Fim: fim, JustificativaNome: "ATEST", Motivo: "" }];
    await expect(processarEscrita(dbFalso(), quem, { acao: "afastamento", funcionario: 7, inicio: ini, fim: ini, justificativa: "ATEST", confirmar: true })).rejects.toThrow(/Já existe afastamento/);
    await expect(processarEscrita(dbFalso(), quem, { acao: "afastamento", funcionario: 7, inicio: fim, fim: ini, justificativa: "ATEST", confirmar: true })).rejects.toThrow(/antes da inicial/);
    await expect(processarEscrita(dbFalso(), quem, { acao: "remover_afastamento", funcionario: 7, inicio: ini, fim: ini, confirmar: true })).rejects.toThrow(/Não achei/);
    expect(estado.escritas).toHaveLength(0);
  });
});

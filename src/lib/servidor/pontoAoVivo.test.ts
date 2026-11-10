import { beforeEach, describe, expect, it, vi } from "vitest";

// O contexto (login no Secullum, empresas) é simulado: o teste é da montagem do painel.
const dados: Record<string, unknown> = {};
vi.mock("./pontoDados", async (original) => {
  const real = await original<typeof import("./pontoDados")>();
  return {
    ...real,
    carregarContexto: async () => ({
      contexto: {
        bancoId: "banco-1",
        empresas: [
          { empresaId: 3, nome: "Empresa Santos", unidadeId: "u-santos", unidadeNome: "Santos", lojaChave: "santos" },
          { empresaId: 2, nome: "Empresa Miyagi", unidadeId: "u-santos", unidadeNome: "Santos", lojaChave: "miyagi" },
        ],
        sessao: { obter: async (caminho: string) => dados[caminho] ?? [] },
      },
      empresasApi: [],
    }),
  };
});

import { montarAoVivo, reiniciarCacheAoVivo } from "./pontoAoVivo";

beforeEach(() => reiniciarCacheAoVivo());

function bancoFalso(tabelas: Record<string, unknown[]>) {
  return {
    from: (tabela: string) => {
      const b: Record<string, unknown> = {};
      for (const m of ["select", "eq", "is", "in", "gte", "lte"]) b[m] = () => b;
      b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: tabelas[tabela] ?? [], error: null }).then(ok);
      return b;
    },
  } as never;
}

const func = (id: number, nome: string, empresa: number, horario = 8, cpf = "") => ({ Id: id, Nome: nome, Cpf: cpf, EmpresaId: empresa, HorarioId: horario, Demissao: null, Admissao: "2025-01-01T00:00:00" });
const horarioNoite = { Id: 8, Dias: Array.from({ length: 7 }, (_, d) => ({ DiaSemana: d, Entrada1: "16:00", Saida1: "17:30", Entrada2: "18:30", Saida2: "00:20", TipoDia: 0 })) };
const fonte = (id: number, func: number, data: string, hora: string, tipo = 0) => ({ Id: id, FuncionarioId: func, Data: `${data}T00:00:00`, Hora: hora, Tipo: tipo, Origem: 4 });

describe("painel ao vivo", () => {
  // 10/11/2026 (terça), 18:40 no Brasil. Turno da noite 16:00–00:20.
  const agora = { data: "2026-11-10", minutos: 18 * 60 + 40 };
  const tabelas = {
    colaboradores: [
      { id: "c1", nome: "Ana", turno: "noite", unidade_id: "u-santos", unidades: { nome: "Santos" } },
      { id: "c2", nome: "Bia", turno: "noite", unidade_id: "u-santos", unidades: { nome: "Santos" } },
      { id: "c3", nome: "Caio", turno: "noite", unidade_id: "u-santos", unidades: { nome: "Santos" } },
      { id: "c4", nome: "Duda", turno: "noite", unidade_id: "u-santos", unidades: { nome: "Santos" } },
      { id: "c5", nome: "Edu", turno: "noite", unidade_id: "u-santos", unidades: { nome: "Santos" } },
    ],
    colaborador_ponto_ids: [
      { colaborador_id: "c1", secullum_funcionario_id: 1 },
      { colaborador_id: "c2", secullum_funcionario_id: 2 },
      { colaborador_id: "c3", secullum_funcionario_id: 3 },
      { colaborador_id: "c4", secullum_funcionario_id: 4 },
    ],
    escala_dias: [
      { colaborador_id: "c1", situacao: "trabalha", escalas_mensais: { status: "rascunho", unidades: { nome: "Santos" } } },
      { colaborador_id: "c2", situacao: "trabalha", escalas_mensais: { status: "rascunho", unidades: { nome: "Santos" } } },
      { colaborador_id: "c3", situacao: "trabalha", escalas_mensais: { status: "rascunho", unidades: { nome: "Santos" } } },
      { colaborador_id: "c4", situacao: "folga", escalas_mensais: { status: "rascunho", unidades: { nome: "Santos" } } },
      { colaborador_id: "c5", situacao: "trabalha", escalas_mensais: { status: "rascunho", unidades: { nome: "Santos" } } },
    ],
    jornadas: [{ unidade_id: "u-santos", turno: "noite", hora_inicio: "16:00:00", hora_fim: "00:20:00" }],
  };

  function preparar() {
    dados.Funcionarios = [func(1, "Ana Silva", 3), func(2, "Bia Souza", 3), func(3, "Caio Lima", 3), func(4, "Duda Reis", 3), func(5, "Edu Pinto", 2), func(6, "Fora Projeto", 99)];
    dados.Horarios = [horarioNoite];
    dados.FonteDados = [
      fonte(1, 1, "2026-11-10", "16:02"), // Ana: entrou no horário, trabalhando
      fonte(2, 2, "2026-11-10", "16:00"), fonte(3, 2, "2026-11-10", "17:30"), // Bia: saiu para o intervalo às 17:30 (há 70 min)
      fonte(4, 4, "2026-11-10", "18:00"), // Duda: de folga na escala, mas bateu ponto
      fonte(5, 6, "2026-11-10", "16:00"), // de empresa fora do projeto: ignorada
      fonte(6, 1, "2026-11-10", "00:18"), // madrugada do dia 10: pertence ao turno do dia 9, não conta
    ];
    dados.Batidas = [];
    dados.FuncionariosAfastamentos = [];
  }

  it("classifica por loja, na visão da escala e do ponto", async () => {
    preparar();
    const p = await montarAoVivo(bancoFalso(tabelas), agora);
    expect(p.diaDeTrabalho).toBe("2026-11-10");
    expect(p.horaAgora).toBe("18:40");
    const santos = p.lojas.find((l) => l.chave === "santos")!;
    const miyagi = p.lojas.find((l) => l.chave === "miyagi")!;
    expect(miyagi.ponto.pessoas.map((x) => x.nome)).toEqual(["Edu Pinto"]);

    const situacao = (nome: string) => santos.escala.pessoas.find((x) => x.nome === nome)?.avaliacao.situacao;
    expect(situacao("Ana")).toBe("trabalhando");
    expect(situacao("Bia")).toBe("intervalo");
    expect(santos.escala.pessoas.find((x) => x.nome === "Bia")?.avaliacao.alertaIntervalo).toBe(true); // 70 min
    expect(situacao("Caio")).toBe("ausente"); // escalado, sem batida, 160 min depois do início
    expect(situacao("Duda")).toBe("trabalhando"); // de folga na escala, mas bateu ponto: aparece como presente e marcada fora da escala
    expect(santos.escala.pessoas.find((x) => x.nome === "Duda")?.foraDaEscala).toBe(true);
    expect(santos.escala.foraDaEscala.map((x) => x.nome)).toEqual(["Duda Reis"]);

    // visão do ponto: todos os ativos da loja, sem declarar ausência
    expect(santos.ponto.pessoas.find((x) => x.nome === "Caio Lima")?.avaliacao.situacao).toBe("sem_batida");
    expect(santos.ponto.pessoas).toHaveLength(4);
  });

  it("colaborador escalado sem vínculo vai para a lista própria; a escala em rascunho é sinalizada", async () => {
    preparar();
    const p = await montarAoVivo(bancoFalso(tabelas), agora);
    expect(p.semVinculo.map((x) => x.nome)).toEqual(["Edu"]);
    expect(p.escalaStatus).toEqual([{ unidade: "Santos", status: "rascunho" }]);
  });

  it("justificativa do Secullum vence a ausência e afastamento por CPF também", async () => {
    preparar();
    dados.Batidas = [{ FuncionarioId: 3, Data: "2026-11-10T00:00:00", Entrada1: "Férias", Saida1: null, Folga: false }];
    const p = await montarAoVivo(bancoFalso(tabelas), agora);
    const caio = p.lojas.find((l) => l.chave === "santos")!.escala.pessoas.find((x) => x.nome === "Caio")!;
    expect(caio.avaliacao).toMatchObject({ situacao: "justificado", motivo: "Férias" });
  });

  it("às 00:30 ainda é o dia de trabalho anterior: a saída da madrugada conta e quem saiu aparece como encerrou", async () => {
    preparar();
    dados.FonteDados = [
      fonte(1, 1, "2026-11-10", "16:00"), fonte(2, 1, "2026-11-10", "17:30"), fonte(3, 1, "2026-11-10", "18:30"), fonte(4, 1, "2026-11-11", "00:20"),
    ];
    const p = await montarAoVivo(bancoFalso(tabelas), { data: "2026-11-11", minutos: 30 });
    expect(p.diaDeTrabalho).toBe("2026-11-10");
    const ana = p.lojas.find((l) => l.chave === "santos")!.escala.pessoas.find((x) => x.nome === "Ana")!;
    expect(ana.avaliacao.situacao).toBe("encerrou");
    expect(ana.batidas.map((b) => b.hora)).toEqual(["16:00", "17:30", "18:30", "00:20"]);
  });

  it("não vaza CPF nem PIS na resposta", async () => {
    preparar();
    dados.Funcionarios = [func(1, "Ana Silva", 3, 8, "12345678901")];
    const texto = JSON.stringify(await montarAoVivo(bancoFalso(tabelas), agora));
    expect(texto).not.toContain("12345678901");
  });
});

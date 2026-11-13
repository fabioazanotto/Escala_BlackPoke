import { describe, expect, it } from "vitest";
import { formatarCnpj, formatarCpf, horarioDeTrabalho, justificativasDeAlteracao, linhasDoCartao, montarCabecalho, totaisDoCartao } from "./cartao";
import type { DiaMes } from "./mes";
import type { MesDoColaborador } from "./mesTipos";

const dia = (d: string, diaSemana: string, extra: Partial<DiaMes>) => ({ dia: d, diaSemana, futuro: false, batidas: [], oficial: null, ...extra }) as unknown as DiaMes;
const mes = (dias: DiaMes[], totais?: Record<string, string>, alteracoes: MesDoColaborador["alteracoes"] = []) =>
  ({ dias, alteracoes, oficial: totais ? { colunas: Object.keys(totais), totais } : null }) as unknown as MesDoColaborador;

describe("formatação", () => {
  it("formata CPF e CNPJ", () => {
    expect(formatarCpf("11122233396")).toBe("111.222.333-96");
    expect(formatarCnpj("11222333000181")).toBe("11.222.333/0001-81");
    expect(formatarCnpj("texto")).toBe("texto");
  });
});

describe("linhasDoCartao", () => {
  it("usa as colunas do cálculo oficial e marca batida manual com asterisco", () => {
    const [l] = linhasDoCartao(
      mes([
        dia("2026-09-05", "sáb", {
          batidas: [{ hora: "10:16", manual: false }, { hora: "15:08", manual: false }, { hora: "16:08", manual: true }, { hora: "18:00", manual: false }],
          oficial: { "Entrada 1": "10:16", "Saída 1": "15:08", "Entrada 2": "16:08", "Saída 2": "18:00", Normais: "06:44", Faltas: "00:36", Extras: "00:00", DSR: "", Carga: "07:20", "Not.Tot.": "" },
        }),
      ]),
    );
    expect(l.rotulo).toBe("05/09/2026 - Sáb");
    expect(l.celulas).toEqual(["10:16", "15:08", "16:08*", "18:00"]);
    expect([l.normais, l.faltas, l.extras, l.dsr, l.carga, l.notTot]).toEqual(["06:44", "00:36", "", "", "07:20", ""]);
  });
  it("mostra texto do Secullum (FOLGA) e, sem texto, deduz FOLGA pela coluna Folga", () => {
    const linhas = linhasDoCartao(
      mes([
        dia("2026-09-06", "dom", { oficial: { "Entrada 1": "FOLGA", "Saída 1": "FOLGA", "Entrada 2": "FOLGA", "Saída 2": "FOLGA", DSR: "07:20" } }),
        dia("2026-09-07", "seg", { oficial: { "Entrada 1": "", "Saída 1": "", "Entrada 2": "", "Saída 2": "", Folga: "x" } }),
        dia("2026-09-08", "ter", { oficial: { "Entrada 1": "", "Saída 1": "", "Entrada 2": "", "Saída 2": "", Folga: "" } }),
      ]),
    );
    expect(linhas[0].celulas).toEqual(["FOLGA", "FOLGA", "FOLGA", "FOLGA"]);
    expect(linhas[0].dsr).toBe("07:20");
    expect(linhas[1].celulas).toEqual(["FOLGA", "FOLGA", "FOLGA", "FOLGA"]);
    expect(linhas[2].celulas).toEqual(["", "", "", ""]);
  });
  it("sem cálculo oficial, cai nas batidas lidas", () => {
    const [l] = linhasDoCartao(mes([dia("2026-09-01", "ter", { batidas: [{ hora: "11:22", manual: false }, { hora: "15:01", manual: true }] })]));
    expect(l.celulas).toEqual(["11:22", "15:01*", "", ""]);
    expect(l.normais).toBe("");
  });
});

describe("totaisDoCartao", () => {
  it("devolve os totais oficiais ou null", () => {
    expect(totaisDoCartao(mes([], { Normais: "147:18", Faltas: "21:22", Extras: "00:00", DSR: "14:40", Carga: "168:40", "Not.Tot.": "04:12" }))).toEqual({ normais: "147:18", faltas: "21:22", extras: "", dsr: "14:40", carga: "168:40", notTot: "04:12" });
    expect(totaisDoCartao(mes([]))).toBeNull();
  });
});

describe("justificativasDeAlteracao", () => {
  it("agrupa por dia, em ordem de hora, com I e D", () => {
    const r = justificativasDeAlteracao(
      mes([], undefined, [
        { dia: "2026-09-10", hora: "15:22", tipo: "D", motivo: "Batida duplicada" },
        { dia: "2026-09-05", hora: "18:00", tipo: "I", motivo: "NAO REGISTROU" },
        { dia: "2026-09-05", hora: "16:08", tipo: "I", motivo: "NAO REGISTROU" },
        { dia: "2026-09-11", hora: "10:00", tipo: "I", motivo: "" },
      ]),
    );
    expect(r).toEqual([
      { dia: "2026-09-05", linhas: ["16:08 - I - NAO REGISTROU", "18:00 - I - NAO REGISTROU"] },
      { dia: "2026-09-10", linhas: ["15:22 - D - Batida duplicada"] },
      { dia: "2026-09-11", linhas: ["10:00 - I"] },
    ]);
  });
});

describe("horarioDeTrabalho / montarCabecalho", () => {
  const horario = {
    Ciclos: [],
    Dias: [
      { DiaSemana: 0, Entrada1: "16:00", Saida1: "17:30", Entrada2: "18:30", Saida2: "00:20", TipoDia: 0 },
      { DiaSemana: 6, TipoDia: 2 },
    ],
  };
  it("monta a grade SEG–DOM e deixa folga em branco", () => {
    const g = horarioDeTrabalho(horario)!;
    expect(g).toHaveLength(7);
    expect(g[0]).toEqual({ dia: "SEG", horas: ["16:00", "17:30", "18:30", "00:20", "", ""] });
    expect(g[6].horas.every((h) => h === "")).toBe(true);
  });
  it("horário cíclico não tem grade fixa", () => {
    expect(horarioDeTrabalho({ Ciclos: [{ x: 1 }], Dias: horario.Dias })).toBeNull();
    expect(horarioDeTrabalho(undefined)).toBeNull();
  });
  it("monta o cabeçalho e deixa CTPS em branco quando o cadastro não traz", () => {
    const c = montarCabecalho({
      funcionario: { Nome: "Fulana de Tal", Cpf: "11122233396", Admissao: "2025-10-31T00:00:00", NumeroFolha: "31102025", Departamento: { Descricao: "Salão" }, Funcao: { Descricao: "Cumim" } },
      empresa: { Nome: "EMPRESA TESTE LTDA", Documento: "11222333000181", Inscricao: "123", ResponsavelCargo: "Gerente de RH" },
      horario,
    });
    expect(c).toMatchObject({ empresaNome: "EMPRESA TESTE LTDA", cnpj: "11.222.333/0001-81", cpf: "111.222.333-96", admissao: "2025-10-31", departamento: "Salão", funcao: "Cumim", ctps: "", numeroFolha: "31102025", responsavelCargo: "Gerente de RH" });
  });
});

import { describe, expect, it } from "vitest";
import { montarCsv } from "./csv";
import { jornadaDe } from "./aoVivo";
import { montarMes } from "./mes";
import type { MesDoColaborador } from "./mesTipos";

describe("CSV do mês", () => {
  const noite = jornadaDe("16:00", "00:20")!;
  const { dias, resumo } = montarMes({
    mes: "2026-11", hoje: "2026-11-10", agoraMin: 1080,
    registros: [{ data: "2026-11-02", hora: "16:10", tipo: 0 }, { data: "2026-11-02", hora: "17:30", tipo: 0 }, { data: "2026-11-02", hora: "18:35", tipo: 0 }, { data: "2026-11-03", hora: "00:20", tipo: 0 }],
    agrupadas: new Map(), escala: null, horario: () => ({ jornada: noite, folga: false, texto: null }),
    oficial: new Map([["2026-11-02", { Normais: "07:10", Faltas: "00:00", "Atras.": "00:10" }]]),
  });
  const m: MesDoColaborador = {
    funcionario: { id: 1, nome: "Maria; da Silva", empresa: "Empresa X", lojaChave: "santos", loja: "BlackPoke Santos", cpfMascarado: "***.456.789-**", admissao: null, demissao: null, ativo: true },
    colaborador: null, mes: "2026-11", escala: { existe: false, status: null },
    oficial: { colunas: ["Data", "Normais", "Faltas", "Atras."], totais: { Normais: "07:10", Faltas: "00:00", "Atras.": "00:10" } },
    avisoOficial: null, dias, resumo, atencao: [], alteracoes: [], atualizadoEm: "x",
  };

  it("começa com BOM, protege ponto e vírgula nos campos e traz as colunas do Secullum", () => {
    const csv = montarCsv(m, true);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain('"Maria; da Silva"');
    expect(csv).toContain("Secullum Normais");
    expect(csv).toContain("02/11/2026;seg;");
    expect(csv).toContain("16:10;17:30;18:35;00:20");
    expect(csv).toContain("TOTAIS (Secullum)");
  });
  it("sem a opção oficial, não leva as colunas do Secullum", () => {
    expect(montarCsv(m, false)).not.toContain("Secullum Normais");
  });
  it("não leva CPF inteiro", () => {
    expect(montarCsv(m, true)).toContain("***.456.789-**");
  });
});

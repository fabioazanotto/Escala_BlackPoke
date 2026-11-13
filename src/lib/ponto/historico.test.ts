import { describe, expect, it } from "vitest";
import { contarPorTipo, ocorrenciasAutomaticasDoMes, validarManual } from "./historico";
import type { DiaMes } from "./mes";
import type { MesDoColaborador } from "./mesTipos";

const av = (situacao: string, atrasoMin: number | null = null) => ({ situacao, atrasoMin, minutosSemRegistro: null, minutosNoIntervalo: null, alertaIntervalo: false, intervaloCurtoMin: null, semRetorno: false, semSaida: false, motivo: null });
const dia = (d: string, avaliacao: ReturnType<typeof av> | null, futuro = false) => ({ dia: d, futuro, avaliacao }) as unknown as DiaMes;
const mes = (dias: DiaMes[]) => ({ dias }) as unknown as MesDoColaborador;

describe("ocorrenciasAutomaticasDoMes", () => {
  it("guarda faltas e atrasos de dias encerrados e ignora o resto", () => {
    const r = ocorrenciasAutomaticasDoMes(
      mes([
        dia("2026-09-01", av("falta")),
        dia("2026-09-02", av("presente", 12)),
        dia("2026-09-03", av("presente", null)),
        dia("2026-09-04", av("ausente")), // hoje, ainda em andamento
        dia("2026-09-05", av("folga")),
        dia("2026-09-30", av("falta"), true), // futuro
        dia("2026-09-06", null),
      ]),
    );
    expect(r.map((x) => [x.tipo, x.data_inicio, x.minutos])).toEqual([
      ["falta", "2026-09-01", null],
      ["atraso", "2026-09-02", 12],
    ]);
  });
  it("não conta falta quando o dia foi justificado", () => {
    expect(ocorrenciasAutomaticasDoMes(mes([dia("2026-09-01", av("justificado"))]))).toEqual([]);
  });
});

describe("contarPorTipo", () => {
  it("conta cada tipo", () => {
    expect(contarPorTipo([{ tipo: "falta" }, { tipo: "falta" }, { tipo: "atestado" }])).toEqual({ falta: 2, atraso: 0, atestado: 1, advertencia: 0, observacao: 0 });
  });
});

describe("validarManual", () => {
  const base = { tipo: "atestado" as const, data_inicio: "2026-09-10", data_fim: null, minutos: null, descricao: null };
  it("aceita atestado só com a data", () => expect(validarManual(base)).toBeNull());
  it("recusa data final antes da inicial", () => expect(validarManual({ ...base, data_fim: "2026-09-09" })).toMatch(/final/));
  it("atraso exige minutos", () => {
    expect(validarManual({ ...base, tipo: "atraso" })).toMatch(/minutos/);
    expect(validarManual({ ...base, tipo: "atraso", minutos: 15 })).toBeNull();
  });
  it("advertência e observação exigem descrição", () => {
    expect(validarManual({ ...base, tipo: "advertencia" })).toMatch(/descrição/);
    expect(validarManual({ ...base, tipo: "observacao", descricao: "  " })).toMatch(/descrição/);
    expect(validarManual({ ...base, tipo: "observacao", descricao: "Chegou com a farda errada" })).toBeNull();
  });
  it("exige data", () => expect(validarManual({ ...base, data_inicio: "" })).toMatch(/data/i));
});

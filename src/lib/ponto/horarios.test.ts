import { describe, expect, it } from "vitest";
import { resumirHorarios } from "./horarios";

describe("resumo dos horários", () => {
  const h = (id: number, extra: Record<string, unknown> = {}) => ({
    Id: id, Numero: id, Descricao: `Horário ${id} `, Desativar: false, Tipo: 0, Ciclos: [], DataBase: null,
    Dias: [
      { DiaSemana: 6, Entrada1: null, Saida1: null, TipoDia: 2, Carga: 0 },
      { DiaSemana: 0, Entrada1: "09:00", Saida1: "15:00", Entrada2: "16:00", Saida2: "17:20", TipoDia: 0, Carga: 440 },
    ],
    ...extra,
  });

  it("mostra só horários em uso, com pares de entrada e saída por dia da semana (segunda = 0)", () => {
    const r = resumirHorarios([h(1), h(2)], new Map([[1, 7]]));
    expect(r.usados).toHaveLength(1);
    expect(r.naoUsados).toBe(1);
    expect(r.usados[0].descricao).toBe("Horário 1");
    expect(r.usados[0].usoAtivos).toBe(7);
    expect(r.usados[0].dias).toEqual([
      { dia: "Seg", texto: "09:00–15:00 · 16:00–17:20", tipoDia: "Normal", cargaMinutos: 440 },
      { dia: "Dom", texto: "Folga", tipoDia: "Folga", cargaMinutos: 0 },
    ]);
  });

  it("indica rodízio quando há ciclos ou data base", () => {
    const r = resumirHorarios([h(3, { Ciclos: [{}, {}], DataBase: "2026-01-01" })], new Map([[3, 1]]));
    expect(r.usados[0].ciclos).toBe(2);
    expect(r.usados[0].temDataBase).toBe(true);
  });

  it("tolera lista vazia e campos ausentes", () => {
    expect(resumirHorarios([], new Map())).toEqual({ usados: [], naoUsados: 0 });
    expect(resumirHorarios([{}], new Map()).naoUsados).toBe(1);
  });
});

import { describe, expect, it } from "vitest";
import { descansoEntreJornadasMin, duracaoEfetivaMin, duracaoJornadaMin, fimDaJornada } from "./jornada";

const dia = { turno: "dia" as const, horaInicio: "09:00", horaFim: "17:20", intervaloMinutos: 60 };
const noite = { turno: "noite" as const, horaInicio: "16:00", horaFim: "00:20", intervaloMinutos: 60 };

describe("jornadas", () => {
  it("calcula duração e horas efetivas", () => {
    expect(duracaoJornadaMin(dia)).toBe(500); // 8h20
    expect(duracaoEfetivaMin(dia)).toBe(440); // 7h20 com 1h de intervalo
    expect(duracaoJornadaMin(noite)).toBe(500);
  });

  it("a jornada noturna termina na data seguinte", () => {
    expect(fimDaJornada("2026-11-30", noite)).toEqual({ data: "2026-12-01", hora: "00:20" });
    expect(fimDaJornada("2026-12-31", noite)).toEqual({ data: "2027-01-01", hora: "00:20" });
    expect(fimDaJornada("2028-02-28", noite).data).toBe("2028-02-29");
    expect(fimDaJornada("2026-11-30", dia)).toEqual({ data: "2026-11-30", hora: "17:20" });
  });

  it("descanso entre jornadas é de 15h40 nos dois turnos", () => {
    expect(descansoEntreJornadasMin(dia)).toBe(940);
    expect(descansoEntreJornadasMin(noite)).toBe(940);
  });
});

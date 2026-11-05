// Cálculos de jornada, inclusive as que passam da meia-noite.

import { duracaoMinutos, horaParaMinutos, somarDias } from "../datas";
import type { JornadaMotor } from "./tipos";

/** Duração total da jornada em minutos (inclui o intervalo). */
export function duracaoJornadaMin(j: JornadaMotor): number {
  return duracaoMinutos(j.horaInicio, j.horaFim);
}

export function duracaoEfetivaMin(j: JornadaMotor): number {
  return Math.max(0, duracaoJornadaMin(j) - j.intervaloMinutos);
}

/** Data e hora reais da saída de quem entra em dataISO. */
export function fimDaJornada(dataISO: string, j: JornadaMotor): { data: string; hora: string } {
  const viraDia = horaParaMinutos(j.horaFim) <= horaParaMinutos(j.horaInicio);
  return { data: viraDia ? somarDias(dataISO, 1) : dataISO, hora: j.horaFim.slice(0, 5) };
}

/** Descanso entre o fim de uma jornada e o início da seguinte (mesmo horário todo dia). */
export function descansoEntreJornadasMin(j: JornadaMotor): number {
  return 24 * 60 - duracaoJornadaMin(j);
}

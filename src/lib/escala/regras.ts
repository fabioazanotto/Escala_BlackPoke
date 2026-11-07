// Regras criadas pelo RH para cada unidade: leitura do banco e textos para a tela.

import type { RegraMotor } from "./tipos";

export type TipoRegra = RegraMotor["tipo"];

export const ROTULO_TIPO_REGRA: Record<TipoRegra, string> = {
  folga_fixa: "Folga fixa em dia da semana",
  alternancia: "Alternância de folgas entre duas pessoas",
  dobra: "Cobertura por dobra",
  dia_fechado: "Dia sem funcionamento",
};

export const NOME_DIA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

const ehDia = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 6;
const ehTexto = (t: unknown): t is string => typeof t === "string" && t.length > 0;

/** Converte a linha do banco (tipo + parâmetros) em regra do motor. Devolve null se estiver incompleta. */
export function regraDoBanco(tipo: string, parametros: unknown): RegraMotor | null {
  const p = (parametros ?? {}) as Record<string, unknown>;
  if (tipo === "folga_fixa" && ehTexto(p.colaboradorId) && Array.isArray(p.diasSemana) && p.diasSemana.length > 0 && p.diasSemana.every(ehDia)) {
    return { tipo, colaboradorId: p.colaboradorId, diasSemana: p.diasSemana as number[] };
  }
  if (tipo === "alternancia" && ehTexto(p.colaboradorA) && ehTexto(p.colaboradorB) && ehDia(p.diaA) && ehDia(p.diaB) && ehTexto(p.ancora)) {
    return { tipo, colaboradorA: p.colaboradorA, colaboradorB: p.colaboradorB, diaA: p.diaA, diaB: p.diaB, ancora: p.ancora };
  }
  if (tipo === "dobra" && ehTexto(p.cobreId) && ehTexto(p.cobertoId)) {
    return { tipo, cobreId: p.cobreId, cobertoId: p.cobertoId };
  }
  if (tipo === "dia_fechado" && ehTexto(p.data)) {
    return { tipo, data: p.data, folgaColetiva: p.folgaColetiva !== false };
  }
  return null;
}

/** Parâmetros que vão para o banco. */
export function parametrosDaRegra(r: RegraMotor): Record<string, unknown> {
  const { tipo: _tipo, ...resto } = r;
  void _tipo;
  return resto;
}

function dataBR(iso: string) {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

/** Frase que resume a regra, em português. */
export function descreverRegra(r: RegraMotor, nome: (id: string) => string): string {
  switch (r.tipo) {
    case "folga_fixa":
      return `${nome(r.colaboradorId)} folga sempre ${r.diasSemana.map((d) => NOME_DIA[d]).join(" ou ")}.`;
    case "alternancia":
      return `${nome(r.colaboradorA)} e ${nome(r.colaboradorB)} alternam as folgas: na semana de ${dataBR(r.ancora)}, ${nome(r.colaboradorA)} folga no(a) ${NOME_DIA[r.diaA]} e ${nome(r.colaboradorB)} no(a) ${NOME_DIA[r.diaB]}; na semana seguinte invertem.`;
    case "dobra":
      return `Quando ${nome(r.cobertoId)} folga, ${nome(r.cobreId)} dobra (trabalha os dois turnos) e cobre o posto dele(a).`;
    case "dia_fechado":
      return `Unidade sem funcionamento em ${dataBR(r.data)}${r.folgaColetiva ? " (folga coletiva: todos folgam)" : ""}. Não se cobra cobertura nesse dia.`;
  }
}

/** O que a regra contraria nas regras atuais da casa. Mostrado antes de salvar. */
export function contrariaEm(r: RegraMotor): string[] {
  const avisos: string[] = [];
  if (r.tipo === "dobra") {
    avisos.push("o turno fixo do colaborador (ele passa a trabalhar nos dois turnos nesses dias);");
    avisos.push("a regra de não abrir e fechar no mesmo dia;");
    avisos.push("possíveis limites legais de jornada diária e de descanso entre jornadas. Eles só serão conferidos depois de validados com o contador, na aba Regras e feriados.");
  }
  if (r.tipo === "folga_fixa" && r.diasSemana.some((d) => ![1, 2, 3].includes(d))) {
    avisos.push("a preferência da casa por folgas semanais de segunda a quarta (a escala mostrará um aviso).");
  }
  if (r.tipo === "alternancia" && [r.diaA, r.diaB].some((d) => ![1, 2, 3].includes(d))) {
    avisos.push("a preferência da casa por folgas semanais de segunda a quarta (a escala mostrará um aviso).");
  }
  if (r.tipo === "dia_fechado") {
    avisos.push("o funcionamento todos os dias: nessa data o sistema não cobra cobertura de nenhum posto.");
  }
  return avisos;
}

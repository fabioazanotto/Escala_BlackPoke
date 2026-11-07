// Tipos do motor de escalas. O motor não conhece o banco: recebe dados e devolve a proposta.

export type Turno = "dia" | "noite";

export type Situacao =
  | "trabalha"
  | "folga" // folga semanal
  | "domingo" // domingo de descanso
  | "ferias"
  | "afastamento"
  | "indisponibilidade"
  | "dobra" // trabalha os dois turnos no dia (exceção prevista numa regra da unidade)
  | "fora"; // antes da admissão ou depois do desligamento

export type TipoAusenciaMotor = "ferias" | "afastamento" | "indisponibilidade";

export type ColaboradorMotor = {
  id: string;
  nome: string;
  turno: Turno; // turno fixo: o motor nunca o altera
  funcaoPrincipalId: string;
  funcoesAdicionais: string[]; // só o que está expressamente autorizado
  admissao: string | null;
  desligamento: string | null;
};

export type AusenciaMotor = {
  colaboradorId: string;
  tipo: TipoAusenciaMotor;
  inicio: string; // "2026-11-09"
  fim: string;
};

export type CoberturaMotor = {
  turno: Turno;
  funcaoId: string;
  diaSemana: number | null; // 0 = domingo ... 6 = sábado; null = todos os dias
  ideal: number;
  minimoReduzido: number | null; // null = igual ao ideal
};

export type JornadaMotor = {
  turno: Turno;
  horaInicio: string; // "16:00"
  horaFim: string; // "00:20" (se <= início, termina no dia seguinte)
  intervaloMinutos: number;
};

export type ParametroLegal = { chave: string; valor: string | null; validado: boolean };

export type ParametrosMotor = {
  diasFolgaSemanal: number[]; // padrão [1, 2, 3] = segunda a quarta
  domingosPorMes: number; // padrão 1
  legais: ParametroLegal[];
};

/** Situação que o gerente travou: o motor não muda. */
export type Trava = {
  colaboradorId: string;
  data: string;
  situacao: "trabalha" | "folga" | "domingo";
};

/** Regras criadas pelo RH para uma unidade. */
export type RegraMotor =
  | { tipo: "folga_fixa"; colaboradorId: string; diasSemana: number[] }
  | {
      // A folga em diaA e B em diaB; na semana seguinte invertem. A semana de "ancora" tem A em diaA.
      tipo: "alternancia";
      colaboradorA: string;
      colaboradorB: string;
      diaA: number;
      diaB: number;
      ancora: string;
    }
  | { tipo: "dobra"; cobreId: string; cobertoId: string } // quando "cobertoId" folga, "cobreId" dobra e cobre o posto dele
  | { tipo: "dia_fechado"; data: string; folgaColetiva: boolean };

export type EntradaMotor = {
  ano: number;
  mes: number; // 1 a 12
  colaboradores: ColaboradorMotor[];
  ausencias: AusenciaMotor[];
  cobertura: CoberturaMotor[];
  jornadas: JornadaMotor[];
  feriados: string[];
  parametros: ParametrosMotor;
  travas: Trava[];
  regras?: RegraMotor[];
};

/** colaboradorId -> data -> situação */
export type Celulas = Record<string, Record<string, Situacao>>;

export type EstadoCobertura = "completa" | "reduzida" | "deficit";

export type ResultadoCobertura = {
  data: string;
  turno: Turno;
  funcaoId: string;
  ideal: number;
  minimo: number;
  presentes: number;
  estado: EstadoCobertura;
};

export type Conflito = {
  codigo: string;
  mensagem: string;
  colaboradorId?: string;
  data?: string;
};

export type Ajuste = {
  tipo: "mover_folga" | "dobra";
  colaboradorId: string;
  descricao: string;
};

export type Resumo = {
  colaboradoresAtivos: number;
  folgasProgramadas: number;
  domingosDistribuidos: number;
  diasCompletos: number;
  diasReduzidos: number;
  diasComDeficit: number;
  conflitos: number;
  legaisNaoVerificados: number;
  dobras: number;
};

export type ResultadoMotor = {
  dias: string[];
  celulas: Celulas;
  travados: string[]; // chaves "colaboradorId|data"
  feriados: string[];
  fechados: string[]; // dias sem funcionamento (regra da unidade)
  dobrasPorColaborador: Record<string, number>;
  cobertura: ResultadoCobertura[];
  conflitos: Conflito[];
  avisos: string[];
  regular: boolean; // false quando há conflito com restrição obrigatória
  resumo: Resumo;
};

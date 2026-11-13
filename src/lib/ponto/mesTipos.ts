// Formato da resposta de /api/ponto/colaborador (só tipos).

import type { DiaMes, ResumoMes } from "./mes";

export type FuncionarioDaLista = { id: number; nome: string; empresa: string; lojaChave: string | null; loja: string; ativo: boolean };

export type MesDoColaborador = {
  funcionario: { id: number; nome: string; empresa: string; lojaChave: string | null; loja: string; cpfMascarado: string; admissao: string | null; demissao: string | null; ativo: boolean };
  colaborador: { id: string; nome: string; unidade: string | null } | null;
  mes: string;
  escala: { existe: boolean; status: string | null };
  oficial: { colunas: string[]; totais: Record<string, string> } | null;
  avisoOficial: string | null;
  dias: DiaMes[];
  resumo: ResumoMes;
  atencao: string[];
  alteracoes: { dia: string; hora: string; tipo: "I" | "D"; motivo: string }[]; // batida incluída (I) ou desconsiderada (D), com o motivo
  atualizadoEm: string;
};

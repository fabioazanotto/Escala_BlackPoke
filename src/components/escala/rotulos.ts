import type { Situacao } from "@/lib/escala/tipos";

export const CELULA: Record<Situacao, { letra: string; classe: string; nome: string }> = {
  trabalha: { letra: "", classe: "bg-white", nome: "Trabalha" },
  folga: { letra: "F", classe: "bg-blue-200 font-bold", nome: "Folga semanal" },
  domingo: { letra: "D", classe: "bg-purple-200 font-bold", nome: "Domingo de descanso" },
  ferias: { letra: "Fé", classe: "bg-green-200 font-bold", nome: "Férias" },
  afastamento: { letra: "A", classe: "bg-orange-200 font-bold", nome: "Afastamento" },
  indisponibilidade: { letra: "I", classe: "bg-yellow-200 font-bold", nome: "Indisponibilidade" },
  fora: { letra: "–", classe: "bg-neutral-200 text-neutral-500", nome: "Fora do vínculo" },
};

/** O que se pode escolher na edição. Férias, afastamentos e indisponibilidades vêm da tela Ausências. */
export const SITUACOES_EDITAVEIS: Situacao[] = ["trabalha", "folga", "domingo"];

export const ROTULO_ESTADO = {
  completa: "Cobertura completa",
  reduzida: "Cobertura reduzida autorizada",
  deficit: "Déficit",
} as const;

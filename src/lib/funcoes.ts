import type { Funcao } from "@/lib/tipos";

/** "Sushiman · Seu Miyagi" ou só "Caixa" quando não há operação. */
export function rotuloFuncao(f: Pick<Funcao, "nome" | "operacao">): string {
  return f.operacao ? `${f.nome} · ${f.operacao}` : f.nome;
}

export const ROTULO_TURNO = { dia: "Dia", noite: "Noite" } as const;

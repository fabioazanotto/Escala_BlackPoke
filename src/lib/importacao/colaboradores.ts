// Leitura da planilha de colaboradores (colunas: Colaborador, cargo, turno, operação).
// Funções puras, sem acesso ao banco, para poderem ser testadas.

import type { Turno2 } from "@/lib/tipos";

export type LinhaPlanilha = {
  linha: number; // número da linha na planilha (1 = cabeçalho)
  nome: string;
  cargo: string;
  turno: Turno2 | null;
  operacao: string;
};

export type FuncaoProposta = { nome: string; operacao: string | null };

export function limparTexto(t: unknown): string {
  return String(t ?? "").replace(/\s+/g, " ").trim();
}

/** Minúsculas, sem acento e sem espaços repetidos. Serve para comparar textos. */
export function semAcento(t: unknown): string {
  return limparTexto(t)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function nomeDaOperacao(operacao: string): string | null {
  const n = semAcento(operacao).replace(/\s/g, "");
  if (!n) return null;
  if (n.includes("miyagi")) return "Seu Miyagi";
  if (n.includes("blackpoke")) return "BlackPoke";
  return limparTexto(operacao);
}

/**
 * Traduz o cargo da planilha para a função (posto) do sistema.
 * Cargos diferentes podem cair na mesma função (ex.: "ajd cozinha" e "aux cozinha").
 * Devolve null quando não reconhece: nada é adivinhado.
 */
export function funcaoDoCargo(cargo: string, operacao: string): FuncaoProposta | null {
  const c = semAcento(cargo);
  const op = nomeDaOperacao(operacao);
  if (/^(op|operador)\.?\s*(de\s+)?(cx|caixa)$/.test(c)) return { nome: "Operador de caixa", operacao: null };
  if (/^(aux|auxiliar)\.?\s*(de\s+)?expedicao$/.test(c)) return { nome: "Auxiliar de expedição", operacao: null };
  if (/^(ajd|ajudante|aux|auxiliar)\.?\s*(de\s+)?cozinha$/.test(c)) return { nome: "Ajudante de cozinha", operacao: null };
  if (/^(suhiman|sushiman)$/.test(c)) return { nome: "Sushiman", operacao: op };
  if (/^(aux|auxiliar)\.?\s*(de\s+)?sushi$/.test(c)) return { nome: "Auxiliar de sushi", operacao: op };
  if (/^cozinheiro( lider)?$/.test(c)) return { nome: "Cozinheiro", operacao: op };
  return null;
}

export function lerTurno(t: unknown): Turno2 | null {
  const n = semAcento(t);
  return n === "dia" || n === "noite" ? n : null;
}

/** Acha a linha de cabeçalho e devolve as linhas de colaboradores da aba. */
export function lerLinhas(dados: unknown[][]): { linhas: LinhaPlanilha[]; erro: string | null } {
  const posCabecalho = dados.findIndex((l) => {
    const cel = l.map(semAcento);
    return cel.includes("colaborador") && cel.includes("cargo");
  });
  if (posCabecalho < 0) {
    return { linhas: [], erro: "Não encontrei as colunas Colaborador e cargo nesta aba." };
  }
  const cab = dados[posCabecalho].map(semAcento);
  const iNome = cab.indexOf("colaborador");
  const iCargo = cab.indexOf("cargo");
  const iTurno = cab.indexOf("turno");
  const iOperacao = cab.findIndex((x) => x === "operacao");

  const linhas: LinhaPlanilha[] = [];
  dados.slice(posCabecalho + 1).forEach((l, i) => {
    const nome = limparTexto(l[iNome]);
    if (!nome) return;
    linhas.push({
      linha: posCabecalho + 2 + i,
      nome,
      cargo: limparTexto(l[iCargo]),
      turno: iTurno >= 0 ? lerTurno(l[iTurno]) : null,
      operacao: iOperacao >= 0 ? limparTexto(l[iOperacao]) : "",
    });
  });
  return { linhas, erro: null };
}

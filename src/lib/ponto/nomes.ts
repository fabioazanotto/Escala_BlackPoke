// Nome completo e empresa dos colaboradores, vindos do Secullum. Funções puras (testadas).
// Só prepara a PROPOSTA; quem grava é a rota, depois da confirmação do admin. O nome curto ("nome") nunca é alterado.

const PARTICULAS = new Set(["da", "de", "do", "das", "dos", "e"]);

/** "LENILTON GOMES DE SA" -> "Lenilton Gomes de Sa". Nomes que já têm minúsculas ficam como vieram (só sem espaços sobrando). */
export function formatarNomeCompleto(nome: string): string {
  const limpo = nome.trim().replace(/\s+/g, " ");
  if (limpo !== limpo.toUpperCase()) return limpo;
  return limpo
    .toLowerCase()
    .split(" ")
    .map((p, i) => (i > 0 && PARTICULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(" ");
}

export type ParaNome = {
  colaboradorId: string;
  nomeCurto: string;
  nomeCompletoAtual: string | null;
  empresaAtual: string | null;
  nomeSecullum: string;
  empresaSecullum: string;
};

export type PropostaNome = {
  colaboradorId: string;
  nomeCurto: string;
  nomeCompletoAtual: string | null;
  empresaAtual: string | null;
  nomeCompletoNovo: string;
  empresaNova: string;
  muda: boolean;
};

export function propor(pares: ParaNome[]): PropostaNome[] {
  return pares
    .map((p) => {
      const nomeCompletoNovo = formatarNomeCompleto(p.nomeSecullum);
      const empresaNova = p.empresaSecullum.trim();
      return {
        colaboradorId: p.colaboradorId,
        nomeCurto: p.nomeCurto,
        nomeCompletoAtual: p.nomeCompletoAtual,
        empresaAtual: p.empresaAtual,
        nomeCompletoNovo,
        empresaNova,
        muda: (p.nomeCompletoAtual ?? "") !== nomeCompletoNovo || (p.empresaAtual ?? "") !== empresaNova,
      };
    })
    .sort((a, b) => a.nomeCurto.localeCompare(b.nomeCurto, "pt-BR"));
}

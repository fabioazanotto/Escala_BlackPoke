// Compara duas avaliações da escala para avisar o efeito de uma alteração antes de salvar.

import type { Conflito, EstadoCobertura, ResultadoCobertura, ResultadoMotor } from "./tipos";

const RANK: Record<EstadoCobertura, number> = { completa: 0, reduzida: 1, deficit: 2 };
const chaveSlot = (x: ResultadoCobertura) => `${x.data}|${x.turno}|${x.funcaoId}`;
const chaveConflito = (c: Conflito) => `${c.codigo}|${c.colaboradorId ?? ""}|${c.data ?? ""}|${c.mensagem}`;

export type MudancaCobertura = { antes: ResultadoCobertura; depois: ResultadoCobertura };

export type Impacto = {
  piora: MudancaCobertura[];
  melhora: MudancaCobertura[];
  novosConflitos: Conflito[];
  conflitosResolvidos: Conflito[];
};

export function compararImpacto(antes: ResultadoMotor, depois: ResultadoMotor): Impacto {
  const mapaAntes = new Map(antes.cobertura.map((x) => [chaveSlot(x), x]));
  const piora: MudancaCobertura[] = [];
  const melhora: MudancaCobertura[] = [];
  for (const d of depois.cobertura) {
    const a = mapaAntes.get(chaveSlot(d));
    if (!a) continue;
    if (RANK[d.estado] > RANK[a.estado]) piora.push({ antes: a, depois: d });
    else if (RANK[d.estado] < RANK[a.estado]) melhora.push({ antes: a, depois: d });
  }
  const conflitosAntes = new Set(antes.conflitos.map(chaveConflito));
  const conflitosDepois = new Set(depois.conflitos.map(chaveConflito));
  return {
    piora,
    melhora,
    novosConflitos: depois.conflitos.filter((c) => !conflitosAntes.has(chaveConflito(c))),
    conflitosResolvidos: antes.conflitos.filter((c) => !conflitosDepois.has(chaveConflito(c))),
  };
}

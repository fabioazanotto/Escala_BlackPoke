// Transferência de colaborador entre unidades (parte do BlackPoke): validações e avisos. Funções puras (testadas).
// A escala NÃO é alterada pela transferência: o app só avisa o que ficou para trás e a pessoa ajusta à mão na grade ou no calendário.

export type DiaAgendado = { data: string; situacao: string; ano: number; mes: number; status: string };
export type MesComDias = { mes: string; dias: number; status: string };

const ROTULO_STATUS: Record<string, string> = { rascunho: "rascunho", em_revisao: "em revisão", publicada: "publicada", publicada_com_alteracoes: "publicada com alterações" };

/** Dias em que o colaborador ainda está escalado para trabalhar na unidade ANTIGA, a partir da data da transferência, por mês. */
export function mesesComDiasAposData(linhas: DiaAgendado[], dataInicio: string): MesComDias[] {
  const porMes = new Map<string, MesComDias>();
  for (const l of linhas) {
    if (l.data < dataInicio || !["trabalha", "dobra"].includes(l.situacao)) continue;
    const chave = `${l.ano}-${String(l.mes).padStart(2, "0")}`;
    const atual = porMes.get(chave) ?? { mes: chave, dias: 0, status: l.status };
    atual.dias += 1;
    porMes.set(chave, atual);
  }
  return [...porMes.values()].sort((a, b) => a.mes.localeCompare(b.mes));
}

export type RegraLida = { id: string; tipo: string; nome: string; parametros: unknown };

/** Regras da unidade antiga (folga fixa, alternância...) que citam o colaborador: não vão para a unidade nova. */
export function regrasQueCitam(regras: RegraLida[], colaboradorId: string): RegraLida[] {
  return regras.filter((r) => JSON.stringify(r.parametros ?? {}).includes(colaboradorId));
}

export type PedidoTransferencia = { destino: string; origem: string; funcao: string; turno: string; data: string };

export function validarTransferencia(p: PedidoTransferencia): string | null {
  if (!p.destino) return "Escolha a unidade de destino.";
  if (p.destino === p.origem) return "O colaborador já está nesta unidade.";
  if (!p.funcao) return "Escolha a função na unidade de destino.";
  if (p.turno !== "dia" && p.turno !== "noite") return "Escolha o turno.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.data)) return "Informe a data de início na unidade nova.";
  return null;
}

const mesBR = (m: string) => `${m.slice(5, 7)}/${m.slice(0, 4)}`;

/** Avisos mostrados antes e depois de transferir. Lista vazia = nada a avisar. */
export function avisosDaTransferencia(e: { meses: MesComDias[]; funcoesAdicionais: number; regras: RegraLida[]; matriculaRepetida: boolean }): string[] {
  const out: string[] = [];
  for (const m of e.meses) {
    out.push(`Na unidade antiga ainda há ${m.dias} dia(s) de trabalho escalados em ${mesBR(m.mes)} (escala ${ROTULO_STATUS[m.status] ?? m.status}) a partir da data. O app não mexe na escala: ajuste à mão na grade ou no calendário.`);
  }
  if (e.funcoesAdicionais > 0) out.push(`${e.funcoesAdicionais} função(ões) adicional(is) será(ão) removida(s), porque funções são de cada unidade. Cadastre de novo na unidade nova, se precisar.`);
  if (e.regras.length > 0) out.push(`Regras da unidade antiga que citam este colaborador não valem na nova: ${e.regras.map((r) => r.nome).join(", ")}. Recadastre em Regras da unidade, se precisar.`);
  if (e.matriculaRepetida) out.push("Já existe alguém com a mesma matrícula na unidade de destino: ajuste a matrícula antes.");
  return out;
}

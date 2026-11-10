// Tradução e comparação de batidas do Secullum ("FonteDados"). Funções puras.
// CPF e PIS NUNCA saem daqui: são descartados na tradução (minimização de dados).

import { createHash } from "node:crypto";
import { valorDoCampo } from "@/lib/integracoes/secullum";

export type MarcacaoNormalizada = {
  fonte_id: number;
  secullum_funcionario_id: number;
  secullum_empresa_id: number | null;
  data: string; // yyyy-mm-dd
  hora: string; // como veio (HH:mm ou HH:mm:ss); não converte, a jornada pode virar a meia-noite
  tipo: number;
  origem: number;
  equipamento_id: number | null;
  motivo: string | null;
  data_inclusao: string | null;
  hash: string;
};

const texto = (x: unknown) => (typeof x === "string" ? x : null);
const numero = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);

export function hashDaMarcacao(m: Omit<MarcacaoNormalizada, "hash">): string {
  const canonico = JSON.stringify([m.secullum_funcionario_id, m.data, m.hora, m.tipo, m.origem, m.equipamento_id, m.motivo, m.data_inclusao]);
  return createHash("sha256").update(canonico).digest("hex");
}

/**
 * Traduz um registro bruto. Devolve null se faltar algo essencial (Id, funcionário, data, hora, tipo, origem) ou se o funcionário
 * não pertence a uma empresa do projeto (`empresaDoFuncionario` só tem os incluídos).
 */
export function normalizarMarcacao(bruto: unknown, empresaDoFuncionario: Map<number, number>): { marcacao: MarcacaoNormalizada } | { descartada: "fora_do_projeto" | "incompleta" } {
  const fonteId = numero(valorDoCampo(bruto, "Id"));
  const funcionarioId = numero(valorDoCampo(bruto, "FuncionarioId"));
  const data = texto(valorDoCampo(bruto, "Data"))?.slice(0, 10) ?? null;
  const hora = texto(valorDoCampo(bruto, "Hora"));
  const tipo = numero(valorDoCampo(bruto, "Tipo"));
  const origem = numero(valorDoCampo(bruto, "Origem"));
  if (fonteId === null || funcionarioId === null || !data || !/^\d{4}-\d{2}-\d{2}$/.test(data) || !hora || tipo === null || origem === null) return { descartada: "incompleta" };
  if (!empresaDoFuncionario.has(funcionarioId)) return { descartada: "fora_do_projeto" };
  const base = {
    fonte_id: fonteId,
    secullum_funcionario_id: funcionarioId,
    secullum_empresa_id: empresaDoFuncionario.get(funcionarioId) ?? null,
    data,
    hora,
    tipo,
    origem,
    equipamento_id: numero(valorDoCampo(bruto, "EquipamentoId")),
    motivo: texto(valorDoCampo(bruto, "Motivo")),
    data_inclusao: texto(valorDoCampo(bruto, "DataInclusao")),
  };
  return { marcacao: { ...base, hash: hashDaMarcacao(base) } };
}

export function traduzirLote(brutos: unknown[], empresaDoFuncionario: Map<number, number>): { marcacoes: MarcacaoNormalizada[]; foraDoProjeto: number; incompletas: number } {
  const marcacoes: MarcacaoNormalizada[] = [];
  let foraDoProjeto = 0;
  let incompletas = 0;
  for (const b of brutos) {
    const r = normalizarMarcacao(b, empresaDoFuncionario);
    if ("marcacao" in r) marcacoes.push(r.marcacao);
    else if (r.descartada === "fora_do_projeto") foraDoProjeto += 1;
    else incompletas += 1;
  }
  return { marcacoes, foraDoProjeto, incompletas };
}

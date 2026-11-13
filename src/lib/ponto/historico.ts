// Histórico do colaborador: tipos, rótulos e o que "Guardar o mês no histórico" grava. Funções puras (testadas).
// Só o que o app consegue afirmar vira registro automático: falta = dia ESCALADO, já encerrado e sem nenhuma batida;
// atraso = entrada depois da tolerância. Sem escala no mês o app não declara faltas (vale o cálculo oficial do Secullum).

import type { MesDoColaborador } from "./mesTipos";

export const TIPOS_OCORRENCIA = ["falta", "atraso", "atestado", "advertencia", "observacao"] as const;
export type TipoOcorrencia = (typeof TIPOS_OCORRENCIA)[number];

export const ROTULO_TIPO: Record<TipoOcorrencia, string> = {
  falta: "Falta",
  atraso: "Atraso",
  atestado: "Atestado",
  advertencia: "Advertência",
  observacao: "Observação",
};

export const ROTULO_TIPO_PLURAL: Record<TipoOcorrencia, string> = {
  falta: "Faltas",
  atraso: "Atrasos",
  atestado: "Atestados",
  advertencia: "Advertências",
  observacao: "Observações",
};

export type NovaOcorrencia = {
  tipo: TipoOcorrencia;
  data_inicio: string;
  data_fim: string | null;
  minutos: number | null;
  descricao: string | null;
};

export type Ocorrencia = NovaOcorrencia & {
  id: string;
  funcionario_ponto_id: number;
  nome_registrado: string;
  origem: "automatica" | "manual";
  lancado_por_nome: string | null;
  criado_em: string;
};

/** Faltas e atrasos de dias já encerrados do mês, no formato do histórico. */
export function ocorrenciasAutomaticasDoMes(m: MesDoColaborador): NovaOcorrencia[] {
  const out: NovaOcorrencia[] = [];
  for (const d of m.dias) {
    const a = d.avaliacao;
    if (d.futuro || !a) continue;
    if (a.situacao === "falta") {
      out.push({ tipo: "falta", data_inicio: d.dia, data_fim: null, minutos: null, descricao: "Escalado e sem nenhuma batida (leitura do BlackPoke)" });
    } else if (a.atrasoMin !== null && a.atrasoMin > 0) {
      out.push({ tipo: "atraso", data_inicio: d.dia, data_fim: null, minutos: a.atrasoMin, descricao: "Entrada depois do previsto (leitura do BlackPoke)" });
    }
  }
  return out;
}

export function contarPorTipo(lista: Pick<Ocorrencia, "tipo">[]): Record<TipoOcorrencia, number> {
  const c = { falta: 0, atraso: 0, atestado: 0, advertencia: 0, observacao: 0 } as Record<TipoOcorrencia, number>;
  for (const o of lista) c[o.tipo] += 1;
  return c;
}

export type ErroValidacao = string | null;

/** Confere um lançamento manual antes de gravar. Devolve a mensagem de erro, ou null se está certo. */
export function validarManual(o: NovaOcorrencia): ErroValidacao {
  if (!TIPOS_OCORRENCIA.includes(o.tipo)) return "Escolha o tipo.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(o.data_inicio)) return "Informe a data.";
  if (o.data_fim && !/^\d{4}-\d{2}-\d{2}$/.test(o.data_fim)) return "Data final inválida.";
  if (o.data_fim && o.data_fim < o.data_inicio) return "A data final não pode ser antes da inicial.";
  if (o.tipo === "atraso" && (o.minutos === null || !Number.isInteger(o.minutos) || o.minutos <= 0)) return "Informe os minutos de atraso.";
  if ((o.tipo === "advertencia" || o.tipo === "observacao") && !o.descricao?.trim()) return "Escreva uma descrição.";
  return null;
}


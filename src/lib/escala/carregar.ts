// Leitura dos dados de uma unidade e mês para o motor de escalas (usada pelo Painel e pela Escala do mês).

import { supabase } from "@/lib/supabase";
import { diasDoMes } from "@/lib/escala/motor";
import { regraDoBanco } from "@/lib/escala/regras";
import type { Celulas, EntradaMotor, RegraMotor, Situacao, Trava } from "@/lib/escala/tipos";
import type { Funcao } from "@/lib/tipos";

export type Escala = { id: string; status: string; versao: number; gerada_em: string | null };

export const ROTULO_STATUS: Record<string, string> = {
  rascunho: "Rascunho",
  em_revisao: "Em revisão",
  publicada: "Publicada",
  publicada_com_alteracoes: "Publicada com alterações",
};

/** Colaborador que saiu da unidade por transferência mas ainda tem dias escalados neste mês (só para consulta). */
export type Transferido = { id: string; nome: string; etiqueta: string; celulas: Record<string, Situacao> };

export type Dados = {
  transferidos: Transferido[];
  entrada: EntradaMotor;
  nomes: Map<string, string>;
  funcoes: Map<string, Funcao>;
  escala: Escala | null;
  celulasSalvas: Celulas | null;
};

export async function carregarDados(unidadeId: string, ano: number, mes: number): Promise<Dados> {
  const db = supabase();
  const dias = diasDoMes(ano, mes);
  const inicio = dias[0];
  const fim = dias[dias.length - 1];

  const [c, f, k, j, p, e, rg] = await Promise.all([
    db.from("colaboradores").select("id, nome, turno, funcao_principal_id, data_admissao, data_desligamento").eq("unidade_id", unidadeId).eq("ativo", true).order("nome"),
    db.from("funcoes").select("id, unidade_id, nome, operacao, ativa").eq("unidade_id", unidadeId),
    db.from("cobertura").select("turno, funcao_id, dia_semana, ideal, minimo_reduzido").eq("unidade_id", unidadeId),
    db.from("jornadas").select("turno, hora_inicio, hora_fim, intervalo_minutos").eq("unidade_id", unidadeId),
    db.from("parametros").select("tipo, chave, valor, validado").is("unidade_id", null),
    db.from("escalas_mensais").select("id, status, versao, gerada_em").eq("unidade_id", unidadeId).eq("ano", ano).eq("mes", mes).maybeSingle(),
    db.from("regras_unidade").select("tipo, parametros").eq("unidade_id", unidadeId).eq("ativa", true).order("criado_em"),
  ]);
  const erroBase = c.error ?? f.error ?? k.error ?? j.error ?? p.error ?? e.error ?? rg.error;
  if (erroBase) throw erroBase;

  const ids = (c.data ?? []).map((x) => x.id);
  const [extras, aus, fer, dd] = await Promise.all([
    ids.length ? db.from("colaborador_funcoes").select("colaborador_id, funcao_id").in("colaborador_id", ids) : Promise.resolve({ data: [], error: null }),
    ids.length ? db.from("ausencias").select("colaborador_id, tipo, data_inicio, data_fim").in("colaborador_id", ids).lte("data_inicio", fim).gte("data_fim", inicio) : Promise.resolve({ data: [], error: null }),
    db.from("feriados").select("data, unidade_id").gte("data", inicio).lte("data", fim),
    e.data ? db.from("escala_dias").select("colaborador_id, data, situacao, travado").eq("escala_id", e.data.id).limit(5000) : Promise.resolve({ data: [], error: null }),
  ]);
  const erro2 = extras.error ?? aus.error ?? fer.error ?? dd.error;
  if (erro2) throw erro2;

  // Quem foi transferido para outra unidade e ainda tem dias escalados aqui neste mês continua visível, só para consulta.
  const idsAtivos = new Set(ids);
  const idsFora = [...new Set((dd.data ?? []).map((r) => String(r.colaborador_id)))].filter((id) => !idsAtivos.has(id));
  const transferidos: Transferido[] = [];
  if (idsFora.length > 0) {
    const [tr, nm, un] = await Promise.all([
      db.from("transferencias_colaboradores").select("colaborador_id, unidade_destino_id, data_inicio, criado_em").eq("unidade_origem_id", unidadeId).in("colaborador_id", idsFora).order("criado_em", { ascending: false }),
      db.from("colaboradores").select("id, nome").in("id", idsFora),
      db.from("unidades").select("id, nome"),
    ]);
    if (!tr.error && !nm.error && !un.error) {
      for (const id of idsFora) {
        const t = (tr.data ?? []).find((x) => x.colaborador_id === id);
        if (!t) continue; // saiu por outro motivo (inativado etc.): continua fora da tela, como antes
        const celulas: Record<string, Situacao> = {};
        for (const r of dd.data ?? []) if (r.colaborador_id === id) celulas[r.data] = r.situacao as Situacao;
        const dataBR = String(t.data_inicio).split("-").reverse().slice(0, 2).join("/");
        transferidos.push({ id, nome: (nm.data ?? []).find((x) => x.id === id)?.nome ?? "?", etiqueta: `transferido em ${dataBR} para ${(un.data ?? []).find((x) => x.id === t.unidade_destino_id)?.nome ?? "outra unidade"}`, celulas });
      }
      transferidos.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    }
  }

  const parametro = (chave: string): string | null => (p.data ?? []).find((x) => x.chave === chave)?.valor ?? null;
  const diasFolga = (parametro("dias_folga_semanal") ?? "1,2,3").split(",").map((x) => Number(x.trim())).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  const domingos = Number(parametro("domingos_descanso_por_mes") ?? 1);

  const travas: Trava[] = [];
  const celulasSalvas: Celulas = {};
  for (const r of dd.data ?? []) {
    (celulasSalvas[r.colaborador_id] ??= {})[r.data] = r.situacao as Situacao;
    if (r.travado && ["trabalha", "folga", "domingo"].includes(r.situacao)) {
      travas.push({ colaboradorId: r.colaborador_id, data: r.data, situacao: r.situacao as Trava["situacao"] });
    }
  }

  const entrada: EntradaMotor = {
    ano,
    mes,
    colaboradores: (c.data ?? []).map((x) => ({
      id: x.id,
      nome: x.nome,
      turno: x.turno,
      funcaoPrincipalId: x.funcao_principal_id,
      funcoesAdicionais: (extras.data ?? []).filter((y) => y.colaborador_id === x.id).map((y) => y.funcao_id),
      admissao: x.data_admissao,
      desligamento: x.data_desligamento,
    })),
    ausencias: (aus.data ?? []).map((x) => ({ colaboradorId: x.colaborador_id, tipo: x.tipo, inicio: x.data_inicio, fim: x.data_fim })),
    cobertura: (k.data ?? []).map((x) => ({ turno: x.turno, funcaoId: x.funcao_id, diaSemana: x.dia_semana, ideal: x.ideal, minimoReduzido: x.minimo_reduzido })),
    jornadas: (j.data ?? []).map((x) => ({ turno: x.turno, horaInicio: String(x.hora_inicio).slice(0, 5), horaFim: String(x.hora_fim).slice(0, 5), intervaloMinutos: x.intervalo_minutos })),
    feriados: (fer.data ?? []).filter((x) => x.unidade_id === null || x.unidade_id === unidadeId).map((x) => x.data),
    parametros: {
      diasFolgaSemanal: diasFolga.length ? diasFolga : [1, 2, 3],
      domingosPorMes: Number.isFinite(domingos) ? domingos : 1,
      legais: (p.data ?? []).filter((x) => x.tipo === "legal").map((x) => ({ chave: x.chave, valor: x.valor, validado: x.validado })),
    },
    travas,
    regras: (rg.data ?? []).map((x: { tipo: string; parametros: unknown }) => regraDoBanco(x.tipo, x.parametros)).filter((x): x is RegraMotor => x !== null),
  };
  return {
    transferidos,
    entrada,
    nomes: new Map(entrada.colaboradores.map((x) => [x.id, x.nome])),
    funcoes: new Map((f.data as Funcao[]).map((x) => [x.id, x])),
    escala: e.data as Escala | null,
    celulasSalvas: e.data && Object.keys(celulasSalvas).length > 0 ? celulasSalvas : null,
  };
}


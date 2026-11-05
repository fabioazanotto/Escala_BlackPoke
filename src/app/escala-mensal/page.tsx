"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { SeletorUnidade, useUnidades } from "@/components/SeletorUnidade";
import { DIAS_SEMANA_CURTO, dataBR, hojeISO, paraData } from "@/lib/datas";
import { rotuloFuncao, ROTULO_TURNO } from "@/lib/funcoes";
import { avaliarEscala, diasDoMes, gerarEscala, sugerirAjustes } from "@/lib/escala/motor";
import type { Celulas, EntradaMotor, ResultadoMotor, Situacao, Trava } from "@/lib/escala/tipos";
import type { Funcao } from "@/lib/tipos";

type Escala = { id: string; status: string; versao: number; gerada_em: string | null };

const ROTULO_STATUS: Record<string, string> = {
  rascunho: "Rascunho",
  em_revisao: "Em revisão",
  publicada: "Publicada",
  publicada_com_alteracoes: "Publicada com alterações",
};

const CELULA: Record<Situacao, { letra: string; classe: string; nome: string }> = {
  trabalha: { letra: "", classe: "bg-white", nome: "Trabalha" },
  folga: { letra: "F", classe: "bg-blue-200 font-bold", nome: "Folga semanal" },
  domingo: { letra: "D", classe: "bg-purple-200 font-bold", nome: "Domingo de descanso" },
  ferias: { letra: "Fé", classe: "bg-green-200 font-bold", nome: "Férias" },
  afastamento: { letra: "A", classe: "bg-orange-200 font-bold", nome: "Afastamento" },
  indisponibilidade: { letra: "I", classe: "bg-yellow-200 font-bold", nome: "Indisponibilidade" },
  fora: { letra: "–", classe: "bg-neutral-200 text-neutral-500", nome: "Fora do vínculo" },
};

type Dados = {
  entrada: EntradaMotor;
  nomes: Map<string, string>;
  funcoes: Map<string, Funcao>;
  escala: Escala | null;
  celulasSalvas: Celulas | null;
};

async function carregarDados(unidadeId: string, ano: number, mes: number): Promise<Dados> {
  const db = supabase();
  const dias = diasDoMes(ano, mes);
  const inicio = dias[0];
  const fim = dias[dias.length - 1];

  const [c, f, k, j, p, e] = await Promise.all([
    db.from("colaboradores").select("id, nome, turno, funcao_principal_id, data_admissao, data_desligamento").eq("unidade_id", unidadeId).eq("ativo", true).order("nome"),
    db.from("funcoes").select("id, unidade_id, nome, operacao, ativa").eq("unidade_id", unidadeId),
    db.from("cobertura").select("turno, funcao_id, dia_semana, ideal, minimo_reduzido").eq("unidade_id", unidadeId),
    db.from("jornadas").select("turno, hora_inicio, hora_fim, intervalo_minutos").eq("unidade_id", unidadeId),
    db.from("parametros").select("tipo, chave, valor, validado").is("unidade_id", null),
    db.from("escalas_mensais").select("id, status, versao, gerada_em").eq("unidade_id", unidadeId).eq("ano", ano).eq("mes", mes).maybeSingle(),
  ]);
  const erroBase = c.error ?? f.error ?? k.error ?? j.error ?? p.error ?? e.error;
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
  };
  return {
    entrada,
    nomes: new Map(entrada.colaboradores.map((x) => [x.id, x.nome])),
    funcoes: new Map((f.data as Funcao[]).map((x) => [x.id, x])),
    escala: e.data as Escala | null,
    celulasSalvas: e.data && Object.keys(celulasSalvas).length > 0 ? celulasSalvas : null,
  };
}

export default function EscalaMensal() {
  const { unidades, unidadeId, setUnidadeId, erro: erroUnidades } = useUnidades();
  const [mesAno, setMesAno] = useState(() => hojeISO().slice(0, 7));
  const [dados, setDados] = useState<Dados | null>(null);
  const [resultado, setResultado] = useState<ResultadoMotor | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [diaAberto, setDiaAberto] = useState<string | null>(null);
  const [busca, setBusca] = useState("");

  const [ano, mes] = mesAno.split("-").map(Number);
  const mesValido = Number.isInteger(ano) && Number.isInteger(mes) && mes >= 1 && mes <= 12;

  const carregar = useCallback(async () => {
    if (!unidadeId || !mesValido) return;
    setCarregando(true);
    try {
      const d = await carregarDados(unidadeId, ano, mes);
      setDados(d);
      setResultado(d.celulasSalvas ? avaliarEscala(d.entrada, d.celulasSalvas) : null);
      setErro(null);
    } catch (ex) {
      setDados(null);
      setResultado(null);
      const msg = (ex as { message?: string }).message ?? String(ex);
      setErro(`${msg}. Se a tabela não existe, rode o SQL 05_escala_mensal.sql.`);
    }
    setCarregando(false);
  }, [unidadeId, ano, mes, mesValido]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar();
  }, [carregar]);

  const bloqueada = dados?.escala && !["rascunho", "em_revisao"].includes(dados.escala.status);

  async function gerar() {
    if (!dados) return;
    setGerando(true);
    setErro(null);
    setAviso(null);
    try {
      const db = supabase();
      const r = gerarEscala(dados.entrada);
      const { data: u } = await db.auth.getUser();
      let escalaId = dados.escala?.id;
      if (escalaId) {
        const { error } = await db.from("escalas_mensais").update({ gerada_em: new Date().toISOString(), gerada_por: u.user?.id ?? null }).eq("id", escalaId);
        if (error) throw error;
      } else {
        const { data, error } = await db.from("escalas_mensais").insert({ unidade_id: unidadeId, ano, mes, gerada_em: new Date().toISOString(), gerada_por: u.user?.id ?? null }).select("id").single();
        if (error) throw error;
        escalaId = data.id as string;
      }
      const travados = new Set(r.travados);
      const linhas = dados.entrada.colaboradores.flatMap((c) =>
        r.dias.map((d) => ({ escala_id: escalaId, colaborador_id: c.id, data: d, situacao: r.celulas[c.id][d], travado: travados.has(`${c.id}|${d}`) })),
      );
      for (let i = 0; i < linhas.length; i += 400) {
        const { error } = await db.from("escala_dias").upsert(linhas.slice(i, i + 400), { onConflict: "escala_id,colaborador_id,data" });
        if (error) throw error;
      }
      setAviso("Escala gerada como rascunho. Ela só vale depois de publicada (etapa seguinte).");
      await carregar();
    } catch (ex) {
      setErro(`Não foi possível gerar: ${(ex as { message?: string }).message ?? String(ex)}`);
    }
    setGerando(false);
  }

  const dias = useMemo(() => (mesValido ? diasDoMes(ano, mes) : []), [ano, mes, mesValido]);
  const diasComProblema = useMemo(() => {
    if (!resultado) return [];
    return dias.filter((d) => resultado.cobertura.some((x) => x.data === d && x.estado !== "completa"));
  }, [resultado, dias]);

  const nomeFuncao = (id: string) => {
    const f = dados?.funcoes.get(id);
    return f ? rotuloFuncao(f) : id;
  };
  const colaboradoresVisiveis = (dados?.entrada.colaboradores ?? []).filter((c) => c.nome.toLowerCase().includes(busca.toLowerCase()));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Escala do mês</h1>
      <SeletorUnidade unidades={unidades} valor={unidadeId} aoMudar={(id) => { setAviso(null); setDiaAberto(null); setUnidadeId(id); }} />
      <label className="block">
        <span className="mb-1 block font-medium">Mês</span>
        <input className="campo" type="month" value={mesAno} onChange={(e) => { setAviso(null); setDiaAberto(null); setMesAno(e.target.value); }} />
      </label>
      {(erro || erroUnidades) && <p className="rounded-xl bg-red-50 p-3 text-red-700">{erro ?? erroUnidades}</p>}
      {aviso && <p className="rounded-xl bg-green-50 p-3 text-green-800">{aviso}</p>}
      {carregando && <p className="text-neutral-600">Carregando…</p>}

      {dados && (
        <>
          <div className="cartao space-y-3">
            <p>
              <strong>{dados.entrada.colaboradores.length}</strong> colaboradores ativos.{" "}
              {dados.escala ? <>Estado: <strong>{ROTULO_STATUS[dados.escala.status]}</strong>.</> : "Ainda não há escala para este mês."}
            </p>
            {bloqueada ? (
              <p className="text-amber-800">Esta escala já foi publicada e não pode ser gerada de novo por aqui.</p>
            ) : (
              <button className="botao w-full" onClick={gerar} disabled={gerando || dados.entrada.colaboradores.length === 0}>
                {gerando ? "Gerando…" : dados.escala ? "Gerar novamente (mantém as folgas travadas)" : "Gerar escala do mês"}
              </button>
            )}
          </div>

          {resultado && (
            <>
              <section className="cartao space-y-2">
                <p className={`text-lg font-bold ${resultado.regular ? "text-green-700" : "text-red-700"}`}>
                  {resultado.regular ? "Sem conflitos com as regras verificadas" : `${resultado.conflitos.length} conflito(s) trabalhista(s)`}
                </p>
                {resultado.resumo.legaisNaoVerificados > 0 && (
                  <p className="text-amber-800">
                    {resultado.resumo.legaisNaoVerificados} exigência(s) trabalhista(s) ainda não validada(s): a escala não pôde ser conferida contra elas (tela Regras).
                  </p>
                )}
                <ul className="grid grid-cols-2 gap-2">
                  {[
                    ["Folgas programadas", resultado.resumo.folgasProgramadas],
                    ["Domingos de descanso", resultado.resumo.domingosDistribuidos],
                    ["Dias com cobertura completa", resultado.resumo.diasCompletos],
                    ["Dias com cobertura reduzida autorizada", resultado.resumo.diasReduzidos],
                    ["Dias com déficit", resultado.resumo.diasComDeficit],
                    ["Conflitos trabalhistas", resultado.resumo.conflitos],
                  ].map(([rotulo, valor]) => (
                    <li key={rotulo} className="rounded-xl border border-neutral-200 p-3">
                      <p className="text-2xl font-bold">{valor}</p>
                      <p className="text-sm text-neutral-700">{rotulo}</p>
                    </li>
                  ))}
                </ul>
              </section>

              {resultado.conflitos.length > 0 && (
                <section className="cartao space-y-2">
                  <h2 className="text-lg font-semibold text-red-700">Conflitos</h2>
                  <ul className="list-disc space-y-1 pl-5">
                    {resultado.conflitos.map((c, i) => <li key={i}>{c.mensagem}</li>)}
                  </ul>
                </section>
              )}
              {resultado.avisos.length > 0 && (
                <details className="cartao">
                  <summary className="cursor-pointer font-semibold">Avisos ({resultado.avisos.length})</summary>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {resultado.avisos.map((a, i) => <li key={i}>{a}</li>)}
                  </ul>
                </details>
              )}

              <section className="space-y-2">
                <h2 className="text-xl font-semibold">Dias com cobertura abaixo do ideal</h2>
                {diasComProblema.length === 0 && <p className="text-neutral-600">Todos os dias estão com cobertura completa.</p>}
                {diasComProblema.map((d) => {
                  const slots = resultado.cobertura.filter((x) => x.data === d && x.estado !== "completa");
                  const temDeficit = slots.some((x) => x.estado === "deficit");
                  const aberto = diaAberto === d;
                  return (
                    <div key={d} className={`cartao ${temDeficit ? "border-red-300" : "border-amber-300"}`}>
                      <button className="flex w-full items-center justify-between text-left" onClick={() => setDiaAberto(aberto ? null : d)}>
                        <span className="font-semibold">
                          {DIAS_SEMANA_CURTO[paraData(d).getDay()]} {dataBR(d).slice(0, 5)}
                          {resultado.feriados.includes(d) ? " · feriado" : ""}
                        </span>
                        <span className={temDeficit ? "text-red-700" : "text-amber-800"}>
                          {slots.length} posto(s) {temDeficit ? "com déficit" : "reduzido(s)"}
                        </span>
                      </button>
                      {aberto && (
                        <ul className="mt-3 space-y-3">
                          {slots.map((s) => {
                            const ajustes = dados ? sugerirAjustes(dados.entrada, resultado, s.data, s.turno, s.funcaoId) : [];
                            return (
                              <li key={`${s.turno}-${s.funcaoId}`} className="rounded-xl border border-neutral-200 p-3">
                                <p className="font-semibold">{ROTULO_TURNO[s.turno]} · {nomeFuncao(s.funcaoId)}</p>
                                <p className={s.estado === "deficit" ? "text-red-700" : "text-amber-800"}>
                                  {s.presentes} de {s.ideal} (mínimo aceito: {s.minimo}) · {s.estado === "deficit" ? "déficit" : "reduzida autorizada"}
                                </p>
                                {ajustes.length > 0 ? (
                                  <ul className="mt-1 list-disc pl-5 text-sm text-neutral-700">
                                    {ajustes.map((a, i) => <li key={i}>{a.descricao}</li>)}
                                  </ul>
                                ) : (
                                  <p className="mt-1 text-sm text-neutral-600">Nenhum ajuste simples disponível.</p>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </section>

              <section className="space-y-2">
                <h2 className="text-xl font-semibold">Grade do mês</h2>
                <input className="campo" placeholder="Filtrar colaborador" value={busca} onChange={(e) => setBusca(e.target.value)} />
                <div className="flex flex-wrap gap-2 text-sm">
                  {(Object.keys(CELULA) as Situacao[]).filter((s) => s !== "trabalha").map((s) => (
                    <span key={s} className={`rounded px-2 py-1 ${CELULA[s].classe}`}>{CELULA[s].letra} {CELULA[s].nome}</span>
                  ))}
                </div>
                <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
                  <table className="border-collapse text-xs">
                    <thead>
                      <tr>
                        <th className="sticky left-0 z-[1] min-w-28 border-b bg-white p-2 text-left">Colaborador</th>
                        {dias.map((d) => (
                          <th key={d} className={`border-b p-1 text-center ${paraData(d).getDay() === 0 ? "bg-purple-50" : ""} ${resultado.feriados.includes(d) ? "bg-amber-100" : ""}`}>
                            <div>{DIAS_SEMANA_CURTO[paraData(d).getDay()].slice(0, 1)}</div>
                            <div>{d.slice(8)}</div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(["dia", "noite"] as const).map((turno) => {
                        const lista = colaboradoresVisiveis.filter((c) => c.turno === turno);
                        if (lista.length === 0) return null;
                        return [
                          <tr key={`t-${turno}`}><td colSpan={dias.length + 1} className="bg-neutral-100 p-2 font-semibold">Turno {ROTULO_TURNO[turno].toLowerCase()}</td></tr>,
                          ...lista.map((c) => (
                            <tr key={c.id}>
                              <td className="sticky left-0 z-[1] whitespace-nowrap border-b bg-white p-2">
                                {c.nome}
                                <div className="text-neutral-500">{nomeFuncao(c.funcaoPrincipalId)}</div>
                              </td>
                              {dias.map((d) => {
                                const s = resultado.celulas[c.id]?.[d] ?? "trabalha";
                                return <td key={d} className={`min-w-7 border-b border-l p-1 text-center ${CELULA[s].classe}`}>{CELULA[s].letra}</td>;
                              })}
                            </tr>
                          )),
                        ];
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}

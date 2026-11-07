"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { SeletorUnidade, useUnidades } from "@/components/SeletorUnidade";
import { DIAS_SEMANA_CURTO, dataBR, hojeISO, paraData } from "@/lib/datas";
import { rotuloFuncao, ROTULO_TURNO } from "@/lib/funcoes";
import { avaliarEscala, diasDoMes, gerarEscala, sugerirAjustes } from "@/lib/escala/motor";
import { carregarDados, ROTULO_STATUS, type Dados } from "@/lib/escala/carregar";
import { CabecalhoPagina } from "@/components/CabecalhoPagina";
import type { ResultadoMotor, Situacao } from "@/lib/escala/tipos";

const CELULA: Record<Situacao, { letra: string; classe: string; nome: string }> = {
  trabalha: { letra: "", classe: "bg-white", nome: "Trabalha" },
  folga: { letra: "F", classe: "bg-blue-200 font-bold", nome: "Folga semanal" },
  domingo: { letra: "D", classe: "bg-purple-200 font-bold", nome: "Domingo de descanso" },
  ferias: { letra: "Fé", classe: "bg-green-200 font-bold", nome: "Férias" },
  afastamento: { letra: "A", classe: "bg-orange-200 font-bold", nome: "Afastamento" },
  indisponibilidade: { letra: "I", classe: "bg-yellow-200 font-bold", nome: "Indisponibilidade" },
  fora: { letra: "–", classe: "bg-neutral-200 text-neutral-500", nome: "Fora do vínculo" },
};

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
      <CabecalhoPagina titulo="Escala do mês">
        <SeletorUnidade filtro unidades={unidades} valor={unidadeId} aoMudar={(id) => { setAviso(null); setDiaAberto(null); setUnidadeId(id); }} />
        <input aria-label="Mês" className="filtro" type="month" value={mesAno} onChange={(e) => { setAviso(null); setDiaAberto(null); setMesAno(e.target.value); }} />
      </CabecalhoPagina>
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
                <ul className="grid grid-cols-2 gap-2 lg:grid-cols-6">
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

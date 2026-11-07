"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { CabecalhoPagina } from "@/components/CabecalhoPagina";
import { CalendarioEscala } from "@/components/escala/CalendarioEscala";
import { DialogoEdicao, type PedidoEdicao } from "@/components/escala/DialogoEdicao";
import { GradeEscala } from "@/components/escala/GradeEscala";
import { HistoricoEscala } from "@/components/escala/HistoricoEscala";
import { PainelDia } from "@/components/escala/PainelDia";
import { CELULA } from "@/components/escala/rotulos";
import { Icone } from "@/components/Icones";
import { useSessao } from "@/components/Sessao";
import { SeletorUnidade, useUnidades } from "@/components/SeletorUnidade";
import { DIAS_SEMANA_CURTO, dataBR, hojeISO, paraData } from "@/lib/datas";
import { rotuloFuncao } from "@/lib/funcoes";
import { carregarDados, ROTULO_STATUS, type Dados } from "@/lib/escala/carregar";
import { avaliarEscala, diasDoMes, gerarEscala } from "@/lib/escala/motor";
import type { Celulas, Situacao, Trava } from "@/lib/escala/tipos";

type Visao = "grade" | "calendario";

export default function EscalaMensal() {
  const { perfil } = useSessao();
  const { unidades, unidadeId, setUnidadeId, erro: erroUnidades } = useUnidades();
  const [mesAno, setMesAno] = useState(() => hojeISO().slice(0, 7));
  const [dados, setDados] = useState<Dados | null>(null);
  const [celulas, setCelulas] = useState<Celulas | null>(null);
  const [travas, setTravas] = useState<Trava[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [visao, setVisao] = useState<Visao>("grade");
  const [diaAberto, setDiaAberto] = useState<string | null>(null);
  const [edicao, setEdicao] = useState<PedidoEdicao | null>(null);
  const [historico, setHistorico] = useState(false);

  const [ano, mes] = mesAno.split("-").map(Number);
  const mesValido = Number.isInteger(ano) && Number.isInteger(mes) && mes >= 1 && mes <= 12;

  // Lembra a visão escolhida neste aparelho.
  useEffect(() => {
    try {
      const v = localStorage.getItem("escala.visao");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (v === "grade" || v === "calendario") setVisao(v);
    } catch {
      /* sem armazenamento: segue com a grade */
    }
  }, []);
  function mudarVisao(v: Visao) {
    setVisao(v);
    try {
      localStorage.setItem("escala.visao", v);
    } catch {
      /* ignora */
    }
  }

  const carregar = useCallback(async () => {
    if (!unidadeId || !mesValido) return;
    setCarregando(true);
    try {
      const d = await carregarDados(unidadeId, ano, mes);
      setDados(d);
      setCelulas(d.celulasSalvas);
      setTravas(d.entrada.travas);
      setErro(null);
    } catch (ex) {
      setDados(null);
      setCelulas(null);
      const msg = (ex as { message?: string }).message ?? String(ex);
      setErro(`${msg}. Se a tabela não existe, rode o SQL 05_escala_mensal.sql.`);
    }
    setCarregando(false);
  }, [unidadeId, ano, mes, mesValido]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar();
  }, [carregar]);

  const entrada = useMemo(() => (dados ? { ...dados.entrada, travas } : null), [dados, travas]);
  const resultado = useMemo(() => (entrada && celulas ? avaliarEscala(entrada, celulas) : null), [entrada, celulas]);
  const travados = useMemo(() => new Set(resultado?.travados ?? []), [resultado]);
  const dias = useMemo(() => (mesValido ? diasDoMes(ano, mes) : []), [ano, mes, mesValido]);

  const podeEditar = !!dados?.escala && ["rascunho", "em_revisao"].includes(dados.escala.status);
  const bloqueada = !!dados?.escala && !podeEditar;

  const funcaoNome = useCallback(
    (id: string) => {
      const f = dados?.funcoes.get(id);
      return f ? rotuloFuncao(f) : id;
    },
    [dados],
  );

  const colaboradoresFiltrados = useMemo(
    () => (dados?.entrada.colaboradores ?? []).filter((c) => c.nome.toLowerCase().includes(busca.toLowerCase())),
    [dados, busca],
  );
  const filtroIds = useMemo(() => (busca.trim() ? new Set(colaboradoresFiltrados.map((c) => c.id)) : null), [busca, colaboradoresFiltrados]);

  const diasComProblema = useMemo(
    () => (resultado ? dias.filter((d) => resultado.cobertura.some((x) => x.data === d && x.estado !== "completa")) : []),
    [resultado, dias],
  );

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
      const tr = new Set(r.travados);
      const linhas = dados.entrada.colaboradores.flatMap((c) =>
        r.dias.map((d) => ({ escala_id: escalaId, colaborador_id: c.id, data: d, situacao: r.celulas[c.id][d], travado: tr.has(`${c.id}|${d}`) })),
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

  async function salvarEdicao(nova: Situacao, motivo: string, travar: boolean) {
    if (!edicao || !dados?.escala || !celulas || !resultado) return;
    const { colaboradorId, data } = edicao;
    const anterior = resultado.celulas[colaboradorId]?.[data] ?? "trabalha";
    const travadaAntes = travados.has(`${colaboradorId}|${data}`);
    const db = supabase();
    const escalaId = dados.escala.id;

    const { error: e1 } = await db.from("escala_dias").upsert(
      { escala_id: escalaId, colaborador_id: colaboradorId, data, situacao: nova, travado: travar, motivo: motivo || null },
      { onConflict: "escala_id,colaborador_id,data" },
    );
    if (e1) throw e1;

    const { error: e2 } = await db.from("escala_alteracoes").insert({
      escala_id: escalaId,
      colaborador_id: colaboradorId,
      data,
      situacao_anterior: anterior,
      situacao_nova: nova,
      travada_antes: travadaAntes,
      travada_depois: travar,
      motivo: motivo || null,
      usuario_id: (await db.auth.getUser()).data.user?.id ?? null,
      usuario_nome: perfil.nome,
    });

    setCelulas({ ...celulas, [colaboradorId]: { ...celulas[colaboradorId], [data]: nova } });
    setTravas([
      ...travas.filter((t) => !(t.colaboradorId === colaboradorId && t.data === data)),
      ...(travar ? [{ colaboradorId, data, situacao: nova as Trava["situacao"] }] : []),
    ]);
    setEdicao(null);
    if (e2) {
      setErro(`A alteração foi salva, mas o histórico falhou: ${e2.message}. Se a tabela não existe, rode o SQL 06_historico_alteracoes.sql.`);
    } else {
      setErro(null);
      setAviso(`Alteração salva: ${dados.nomes.get(colaboradorId)}, ${dataBR(data).slice(0, 5)}.`);
    }
  }

  const mudarUnidadeOuMes = () => {
    setAviso(null);
    setDiaAberto(null);
    setEdicao(null);
  };

  return (
    <div className="space-y-4">
      <CabecalhoPagina titulo="Escala do mês">
        <SeletorUnidade filtro unidades={unidades} valor={unidadeId} aoMudar={(id) => { mudarUnidadeOuMes(); setUnidadeId(id); }} />
        <input aria-label="Mês" className="filtro" type="month" value={mesAno} onChange={(e) => { mudarUnidadeOuMes(); setMesAno(e.target.value); }} />
      </CabecalhoPagina>

      {(erro || erroUnidades) && <p className="rounded-xl bg-red-50 p-3 text-red-700">{erro ?? erroUnidades}</p>}
      {aviso && <p className="rounded-xl bg-green-50 p-3 text-green-800">{aviso}</p>}
      {carregando && <p className="text-neutral-600">Carregando…</p>}

      {dados && (
        <>
          <div className="cartao flex flex-wrap items-center justify-between gap-3">
            <p>
              <strong>{dados.entrada.colaboradores.length}</strong> colaboradores ativos.{" "}
              {dados.escala ? <>Estado: <strong>{ROTULO_STATUS[dados.escala.status]}</strong>.</> : "Ainda não há escala para este mês."}
              {bloqueada && <span className="text-amber-800"> Já publicada: não pode ser gerada de novo nem editada por aqui.</span>}
            </p>
            {!bloqueada && (
              <button className="botao" onClick={gerar} disabled={gerando || dados.entrada.colaboradores.length === 0}>
                {gerando ? "Gerando…" : dados.escala ? "Gerar novamente (mantém as folgas travadas)" : "Gerar escala do mês"}
              </button>
            )}
          </div>

          {resultado && entrada && celulas && (
            <>
              <section className="cartao space-y-3">
                <p className={`text-lg font-bold ${resultado.regular ? "text-green-700" : "text-red-700"}`}>
                  {resultado.regular ? "Sem conflitos com as regras verificadas" : `${resultado.conflitos.length} conflito(s) trabalhista(s)`}
                </p>
                {resultado.resumo.legaisNaoVerificados > 0 && (
                  <p className="text-amber-800">
                    {resultado.resumo.legaisNaoVerificados} exigência(s) trabalhista(s) ainda não validada(s): a escala não pôde ser conferida contra elas (aba Regras e feriados).
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
                      <p className="text-2xl font-semibold tabular-nums">{valor}</p>
                      <p className="text-sm text-neutral-700">{rotulo}</p>
                    </li>
                  ))}
                </ul>
                {resultado.conflitos.length > 0 && (
                  <ul className="list-disc space-y-1 pl-5 text-red-700">
                    {resultado.conflitos.map((c, i) => <li key={i}>{c.mensagem}</li>)}
                  </ul>
                )}
                {resultado.avisos.length > 0 && (
                  <details>
                    <summary className="cursor-pointer font-semibold">Avisos ({resultado.avisos.length})</summary>
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      {resultado.avisos.map((a, i) => <li key={i}>{a}</li>)}
                    </ul>
                  </details>
                )}
              </section>

              {diasComProblema.length > 0 && (
                <section aria-label="Dias com cobertura abaixo do ideal" className="flex flex-wrap items-center gap-2">
                  <h2 className="mr-1 text-sm font-semibold">Dias com cobertura abaixo do ideal:</h2>
                  {diasComProblema.map((d) => {
                    const deficit = resultado.cobertura.some((x) => x.data === d && x.estado === "deficit");
                    return (
                      <button
                        key={d}
                        onClick={() => setDiaAberto(d)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-2.5 py-1 text-sm hover:bg-neutral-50"
                      >
                        <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: deficit ? "var(--viz-deficit)" : "var(--viz-reduzida)" }} />
                        {DIAS_SEMANA_CURTO[paraData(d).getDay()]} {dataBR(d).slice(0, 5)}
                        <span className="sr-only">{deficit ? " com déficit" : " com cobertura reduzida"}</span>
                      </button>
                    );
                  })}
                </section>
              )}

              <section className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div role="group" aria-label="Visualização" className="inline-flex rounded-lg border border-neutral-300 bg-white p-0.5">
                    {([["grade", "Grade"], ["calendario", "Calendário"]] as const).map(([v, rotulo]) => (
                      <button
                        key={v}
                        aria-pressed={visao === v}
                        onClick={() => mudarVisao(v)}
                        className={`rounded-md px-4 py-1.5 text-sm font-medium ${visao === v ? "bg-neutral-900 text-white" : "text-neutral-700 hover:bg-neutral-100"}`}
                      >
                        {rotulo}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input className="filtro w-56" placeholder="Filtrar colaborador" aria-label="Filtrar colaborador" value={busca} onChange={(e) => setBusca(e.target.value)} />
                    {dados.escala && (
                      <button className="botao-secundario !py-2" onClick={() => setHistorico(true)}>
                        <Icone nome="historico" tamanho={16} className="mr-1.5" />
                        Histórico
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-sm">
                  {(Object.keys(CELULA) as Situacao[]).filter((s) => s !== "trabalha").map((s) => (
                    <span key={s} className={`rounded px-2 py-1 ${CELULA[s].classe}`}>{CELULA[s].letra} {CELULA[s].nome}</span>
                  ))}
                  <span className="inline-flex items-center gap-1 rounded bg-neutral-100 px-2 py-1"><Icone nome="cadeado" tamanho={12} /> Travada</span>
                  {podeEditar && <span className="text-neutral-600">{visao === "grade" ? "Clique numa célula para alterar." : "Clique num dia para ver e alterar."}</span>}
                </div>

                {visao === "grade" ? (
                  <GradeEscala
                    dias={dias}
                    colaboradores={colaboradoresFiltrados}
                    resultado={resultado}
                    travados={travados}
                    funcaoRotulo={funcaoNome}
                    diaSelecionado={diaAberto}
                    aoClicarCelula={(colaboradorId, data) => setEdicao({ colaboradorId, data })}
                    aoClicarDia={setDiaAberto}
                  />
                ) : (
                  <CalendarioEscala dias={dias} resultado={resultado} nomes={dados.nomes} filtro={filtroIds} diaSelecionado={diaAberto} aoClicarDia={setDiaAberto} />
                )}
              </section>

              {diaAberto && (
                <PainelDia
                  data={diaAberto}
                  entrada={entrada}
                  resultado={resultado}
                  travados={travados}
                  funcaoNome={funcaoNome}
                  nomes={dados.nomes}
                  podeEditar={podeEditar}
                  aoEditar={(colaboradorId) => setEdicao({ colaboradorId, data: diaAberto })}
                  aoFechar={() => setDiaAberto(null)}
                />
              )}
              {edicao && (
                <DialogoEdicao
                  pedido={edicao}
                  entrada={entrada}
                  celulas={celulas}
                  resultado={resultado}
                  travados={travados}
                  nomes={dados.nomes}
                  funcaoNome={funcaoNome}
                  podeEditar={podeEditar}
                  aoSalvar={salvarEdicao}
                  aoFechar={() => setEdicao(null)}
                />
              )}
              {historico && dados.escala && <HistoricoEscala escalaId={dados.escala.id} nomes={dados.nomes} aoFechar={() => setHistorico(false)} />}
            </>
          )}
        </>
      )}
    </div>
  );
}

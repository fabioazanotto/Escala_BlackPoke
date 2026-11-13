"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { COLUNAS_OFICIAIS, dataBR, montarCsv, observacoesDoDia } from "@/lib/ponto/csv";
import { duracao, type DiaMes } from "@/lib/ponto/mes";
import type { FuncionarioDaLista, MesDoColaborador } from "@/lib/ponto/mesTipos";
import { HistoricoColaborador } from "@/components/ponto/HistoricoColaborador";
import { useSessao } from "@/components/Sessao";
import { supabase } from "@/lib/supabase";
import { hojeNoBrasil } from "@/lib/vendas/datas";

type Selo = { texto: string; classe: string; marca: string };

function selosDoDia(d: DiaMes): Selo[] {
  const a = d.avaliacao;
  if (d.futuro || !a) return [];
  const out: Selo[] = [];
  const verde = { classe: "bg-green-100 text-green-900", marca: "●" };
  switch (a.situacao) {
    case "falta": out.push({ texto: "Falta", classe: "bg-red-100 text-red-900", marca: "✕" }); break;
    case "ausente": out.push({ texto: "Ausente", classe: "bg-red-100 text-red-900", marca: "✕" }); break;
    case "atrasado_sem_registro": out.push({ texto: "Atrasado, sem registro", classe: "bg-amber-100 text-amber-900", marca: "▲" }); break;
    case "justificado": out.push({ texto: a.motivo ? `Justificado: ${a.motivo}` : "Justificado", classe: "bg-violet-100 text-violet-900", marca: "✎" }); break;
    case "folga": out.push({ texto: "Folga", classe: "bg-neutral-100 text-neutral-700", marca: "–" }); break;
    case "aguardando": out.push({ texto: "Aguardando", classe: "bg-neutral-100 text-neutral-700", marca: "○" }); break;
    case "sem_batida":
    case "sem_registro_desatualizado": out.push({ texto: "Sem batida", classe: "bg-neutral-100 text-neutral-600", marca: "○" }); break;
    default: out.push(a.atrasoMin !== null ? { texto: `Atrasado ${a.atrasoMin} min`, classe: "bg-amber-100 text-amber-900", marca: "▲" } : { texto: d.folgaTrabalhada ? "Trabalhou na folga" : "Presente", ...(d.folgaTrabalhada ? { classe: "bg-amber-100 text-amber-900", marca: "!" } : verde) });
  }
  if (d.semSaida) out.push({ texto: "Batida faltando", classe: "bg-amber-100 text-amber-900", marca: "!" });
  return out;
}

function Chip({ s }: { s: Selo }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.classe}`}>
      <span aria-hidden>{s.marca}</span>
      {s.texto}
    </span>
  );
}

const somarMeses = (mes: string, n: number) => {
  const [a, m] = mes.split("-").map(Number);
  const t = a * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
};
const nomeMes = (mes: string) => new Date(`${mes}-01T00:00:00Z`).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).replace(/^./, (c) => c.toUpperCase());

async function chamar<T>(caminho: string): Promise<T> {
  const { data } = await supabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sessão expirada. Entre de novo.");
  const r = await fetch(caminho, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  const json = (await r.json().catch(() => ({}))) as T & { erro?: string };
  if (!r.ok) throw new Error(r.status === 504 ? "O servidor demorou demais (504). Tente de novo." : (json.erro ?? `Falha ${r.status}`));
  return json;
}

function Cartao({ rotulo, valor, apoio, alerta }: { rotulo: string; valor: string; apoio?: string; alerta?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${alerta ? "border-amber-300 bg-amber-50" : "border-neutral-200 bg-white"}`}>
      <p className="text-xs text-neutral-600">{rotulo}</p>
      <p className="text-xl font-semibold tabular-nums">{valor}</p>
      {apoio && <p className="text-xs text-neutral-600">{apoio}</p>}
    </div>
  );
}

export function MesDoColaboradorTela({ inicialFuncionario, inicialMes }: { inicialFuncionario: number | null; inicialMes: string | null }) {
  const [lista, setLista] = useState<FuncionarioDaLista[] | null>(null);
  const [lojaSel, setLojaSel] = useState<string | null>(null);
  const [desligados, setDesligados] = useState(false);
  const [funcionarioId, setFuncionarioId] = useState<number | null>(inicialFuncionario);
  const [mes, setMes] = useState(inicialMes ?? hojeNoBrasil().slice(0, 7));
  const [dados, setDados] = useState<MesDoColaborador | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [oficial, setOficial] = useState(true);
  const [mostrarLista, setMostrarLista] = useState(inicialFuncionario === null);
  const [visao, setVisao] = useState<"mes" | "historico">("mes");
  const { perfil } = useSessao();

  useEffect(() => {
    let ativo = true;
    chamar<{ funcionarios: FuncionarioDaLista[] }>("/api/ponto/funcionarios")
      .then((r) => ativo && setLista(r.funcionarios))
      .catch((e) => ativo && setErro((e as Error).message));
    return () => {
      ativo = false;
    };
  }, []);

  const carregar = useCallback(async (id: number, m: string) => {
    setCarregando(true);
    setErro(null);
    try {
      setDados(await chamar<MesDoColaborador>(`/api/ponto/colaborador?funcionario=${id}&mes=${m}`));
    } catch (e) {
      setDados(null);
      setErro((e as Error).message);
    }
    setCarregando(false);
  }, []);

  useEffect(() => {
    if (funcionarioId === null) return;
    const t = setTimeout(() => void carregar(funcionarioId, mes), 0);
    try {
      window.history.replaceState(null, "", `/ponto/colaborador?f=${funcionarioId}&mes=${mes}`);
    } catch {
      /* sem histórico: segue sem atualizar o endereço */
    }
    return () => clearTimeout(t);
  }, [funcionarioId, mes, carregar]);

  const lojas = useMemo(() => {
    const m = new Map<string, { nome: string; ativos: number }>();
    for (const f of lista ?? []) {
      if (!f.lojaChave) continue;
      const atual = m.get(f.lojaChave) ?? { nome: f.loja, ativos: 0 };
      if (f.ativo) atual.ativos += 1;
      m.set(f.lojaChave, atual);
    }
    return [...m.entries()];
  }, [lista]);
  const selecionado = (lista ?? []).find((f) => f.id === funcionarioId) ?? null;
  const lojaEfetiva = lojaSel ?? selecionado?.lojaChave ?? null;
  const doLoja = (lista ?? [])
    .filter((f) => f.lojaChave === lojaEfetiva && (desligados || f.ativo))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  function escolherLoja(chave: string) {
    setLojaSel(chave);
    setMostrarLista(true);
  }
  function escolherColaborador(id: number) {
    setFuncionarioId(id);
    setMostrarLista(false);
  }

  function baixarCsv() {
    if (!dados) return;
    const blob = new Blob([montarCsv(dados, oficial)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ponto-${dados.funcionario.nome.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${dados.mes}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const r = dados?.resumo;
  const colunasOficiais = oficial && dados?.oficial ? COLUNAS_OFICIAIS.filter((c) => dados.oficial!.colunas.includes(c)) : [];

  return (
    <div className="space-y-4">
      <div className="nao-imprimir space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-sm text-neutral-600">Unidade</span>
          {lojas.map(([chave, l]) => (
            <button key={chave} type="button" aria-pressed={lojaEfetiva === chave} onClick={() => escolherLoja(chave)} className={`inline-flex h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium ${lojaEfetiva === chave ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"}`}>
              {l.nome.replace("BlackPoke ", "")}
              <span className={`text-xs ${lojaEfetiva === chave ? "text-neutral-300" : "text-neutral-500"}`}>{l.ativos}</span>
            </button>
          ))}
          {!lista && !erro && <span className="text-sm text-neutral-600">Carregando…</span>}
        </div>

        {selecionado && !mostrarLista ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-neutral-700">
              Colaborador: <strong>{selecionado.nome}</strong>
            </p>
            <button type="button" className="botao-secundario !px-3 !py-2" onClick={() => setMostrarLista(true)}>
              Trocar colaborador
            </button>
            <div className="ml-auto flex items-center gap-1">
              <button className="botao-secundario !px-3 !py-2" aria-label="Mês anterior" onClick={() => setMes(somarMeses(mes, -1))}>
                ‹
              </button>
              <span className="min-w-[10rem] text-center text-sm font-semibold">{nomeMes(mes)}</span>
              <button className="botao-secundario !px-3 !py-2" aria-label="Próximo mês" onClick={() => setMes(somarMeses(mes, 1))}>
                ›
              </button>
            </div>
          </div>
        ) : lojaEfetiva ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-neutral-600">{doLoja.length === 1 ? "1 colaborador" : `${doLoja.length} colaboradores`}{desligados ? "" : " ativos"}. Toque em um nome para abrir o ponto.</p>
              <label className="ml-auto flex items-center gap-2 text-sm text-neutral-700">
                <input type="checkbox" className="h-5 w-5" checked={desligados} onChange={(e) => setDesligados(e.target.checked)} /> incluir desligados
              </label>
            </div>
            {doLoja.length === 0 ? (
              <p className="text-neutral-600">Nenhum colaborador {desligados ? "" : "ativo "}nesta unidade.</p>
            ) : (
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {doLoja.map((f) => (
                  <li key={f.id}>
                    <button type="button" aria-pressed={f.id === funcionarioId} onClick={() => escolherColaborador(f.id)} className={`flex min-h-12 w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-sm font-medium ${f.id === funcionarioId ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-50"}`}>
                      <span className="break-words">{f.nome}</span>
                      {!f.ativo && <span className="shrink-0 rounded-full bg-neutral-200 px-2 py-0.5 text-xs text-neutral-700">desligado</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          lista && <p className="text-neutral-600">Escolha uma unidade para ver os colaboradores.</p>
        )}
      </div>

      {selecionado && !mostrarLista && (
        <div role="tablist" aria-label="O que ver" className="nao-imprimir flex gap-1 border-b border-neutral-200">
          {([["mes", "Mês"], ["historico", "Histórico"]] as const).map(([v, rot]) => (
            <button key={v} type="button" role="tab" aria-selected={visao === v} onClick={() => setVisao(v)} className={`-mb-px border-b-2 px-4 py-2.5 text-sm ${visao === v ? "border-neutral-900 font-semibold" : "border-transparent text-neutral-600 hover:text-neutral-900"}`}>
              {rot}
            </button>
          ))}
        </div>
      )}

      {selecionado && !mostrarLista && visao === "historico" && (
        <HistoricoColaborador funcionarioId={selecionado.id} nome={selecionado.nome} colaboradorId={dados?.funcionario.id === selecionado.id ? (dados.colaborador?.id ?? null) : null} mesAtual={mes} dadosDoMes={dados?.funcionario.id === selecionado.id ? dados : null} quemLanca={perfil.nome} />
      )}

      {erro && <p className="nao-imprimir rounded-xl bg-red-50 p-3 text-red-700">{erro}</p>}
      {carregando && !mostrarLista && visao === "mes" && <p className="text-sm text-neutral-600">Carregando o mês no Secullum…</p>}

      {dados && r && !carregando && !mostrarLista && visao === "mes" && (
        <div className="space-y-4">
          <section className="cartao space-y-1">
            <h2 className="text-xl font-semibold">{dados.funcionario.nome}</h2>
            <p className="text-sm text-neutral-700">
              {dados.funcionario.empresa} · {dados.funcionario.loja} · CPF {dados.funcionario.cpfMascarado}
              {dados.funcionario.admissao && ` · admitido em ${dataBR(dados.funcionario.admissao)}`}
              {dados.funcionario.demissao && ` · desligado em ${dataBR(dados.funcionario.demissao)}`}
            </p>
            <p className="text-sm text-neutral-600">{nomeMes(dados.mes)}</p>
            {!dados.escala.existe && (
              <p className="mt-2 rounded-lg bg-neutral-100 p-2 text-sm text-neutral-700">
                {dados.colaborador ? "Não há escala do BlackPoke para este mês." : "Este funcionário não está vinculado a um colaborador do BlackPoke."} Por isso o app <strong>não declara faltas</strong> aqui: um dia sem batida pode ter sido folga. As faltas e os atrasos desse mês vêm do <strong>cálculo oficial do Secullum</strong> (coluna à direita).
              </p>
            )}
            {dados.escala.existe && dados.escala.status && dados.escala.status !== "publicada" && <p className="mt-2 rounded-lg bg-neutral-100 p-2 text-sm text-neutral-700">A escala deste mês ainda não foi publicada (está em rascunho): pode mudar.</p>}
            {dados.avisoOficial && <p className="mt-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-900">Não consegui o cálculo oficial do Secullum agora ({dados.avisoOficial}). Os demais dados estão corretos.</p>}
          </section>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            <Cartao rotulo="Dias com batida" valor={String(r.diasComBatida)} apoio={r.diasEscalados !== null ? `de ${r.diasEscalados} escalados no mês` : undefined} />
            <Cartao rotulo="Faltas" valor={r.faltas === null ? "—" : String(r.faltas)} apoio={r.faltas === null ? "sem escala: veja o oficial" : "escalado e sem nenhuma batida"} alerta={!!r.faltas} />
            <Cartao rotulo="Atrasos" valor={String(r.atrasos)} apoio={r.atrasos ? `${r.atrasoTotalMin} min no total` : undefined} alerta={r.atrasos > 0} />
            <Cartao rotulo="Batida faltando" valor={String(r.semSaida)} apoio="número ímpar de batidas" alerta={r.semSaida > 0} />
            <Cartao rotulo="Sem batida de intervalo" valor={String(r.semIntervalo)} alerta={r.semIntervalo > 0} />
            <Cartao rotulo="Intervalo < 1 hora" valor={String(r.intervalosCurtos)} alerta={r.intervalosCurtos > 0} />
            <Cartao rotulo="Saídas antecipadas" valor={String(r.saidasAntecipadas)} />
            <Cartao rotulo="Horas trabalhadas" valor={duracao(r.trabalhadoMin)} apoio="soma das batidas em pares" />
            <Cartao rotulo="Trabalhou na folga" valor={String(r.folgasTrabalhadas)} alerta={r.folgasTrabalhadas > 0} />
            <Cartao rotulo="Justificados" valor={String(r.justificados)} />
            <Cartao rotulo="Batidas manuais" valor={String(r.manuais)} />
            <Cartao rotulo="Desconsideradas" valor={String(r.desconsideradas)} />
          </div>

          {dados.oficial && (
            <section className="cartao space-y-1">
              <h3 className="font-semibold">Totais do cálculo oficial do Secullum</h3>
              <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm tabular-nums">
                {COLUNAS_OFICIAIS.filter((c) => dados.oficial!.colunas.includes(c)).map((c) => (
                  <li key={c}>
                    <span className="text-neutral-600">{c}</span> <strong>{dados.oficial!.totais[c] || "—"}</strong>
                  </li>
                ))}
              </ul>
              {r.divergencias > 0 && <p className="text-sm text-amber-900">{r.divergencias} dia(s) em que o BlackPoke e o Secullum divergem (marcados na tabela).</p>}
            </section>
          )}

          {dados.atencao.length > 0 && (
            <section className="cartao space-y-1">
              <h3 className="font-semibold">Pontos de atenção do mês</h3>
              <ul className="list-disc space-y-1 pl-5 text-sm text-neutral-800">
                {dados.atencao.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </section>
          )}

          <div className="nao-imprimir flex flex-wrap items-center gap-3">
            {dados.oficial && (
              <label className="flex items-center gap-2 text-sm text-neutral-700">
                <input type="checkbox" checked={oficial} onChange={(e) => setOficial(e.target.checked)} /> mostrar colunas do cálculo oficial do Secullum
              </label>
            )}
            <span className="ml-auto flex gap-2">
              <button className="botao-secundario" onClick={baixarCsv}>
                Baixar CSV
              </button>
              <button className="botao-secundario" onClick={() => window.print()}>
                Imprimir
              </button>
            </span>
          </div>

          {/* Tabela (computador e impressão) */}
          <section className="cartao hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="text-left text-xs text-neutral-500">
                  <tr>
                    <th className="py-1 pr-3 font-medium">Data</th>
                    <th className="py-1 pr-3 font-medium">Escala</th>
                    <th className="py-1 pr-3 font-medium">Previsto</th>
                    <th className="py-1 pr-2 font-medium">Entrada</th>
                    <th className="py-1 pr-2 font-medium">Saída int.</th>
                    <th className="py-1 pr-2 font-medium">Retorno</th>
                    <th className="py-1 pr-3 font-medium">Saída</th>
                    <th className="py-1 pr-3 font-medium">Trabalhado</th>
                    <th className="py-1 pr-3 font-medium">Situação</th>
                    {colunasOficiais.map((c) => (
                      <th key={c} className="border-l border-neutral-200 py-1 pl-2 pr-1 text-right font-medium">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dados.dias.map((d) => {
                    const obs = observacoesDoDia(d);
                    return (
                      <tr key={d.dia} className={`border-t border-neutral-100 align-top ${d.futuro ? "text-neutral-400" : ""} ${d.divergencias.length ? "bg-amber-50/50" : ""}`}>
                        <td className="whitespace-nowrap py-2 pr-3 tabular-nums">
                          {dataBR(d.dia).slice(0, 5)} <span className="text-neutral-500">{d.diaSemana}</span>
                        </td>
                        <td className="py-2 pr-3 text-neutral-700">{d.escala ?? "—"}</td>
                        <td className="whitespace-nowrap py-2 pr-3 tabular-nums text-neutral-600">{d.previsto ?? "—"}</td>
                        {[0, 1, 2, 3].map((i) => (
                          <td key={i} className="py-2 pr-2 tabular-nums">
                            {d.batidas[i] ? (
                              <>
                                {d.batidas[i].hora}
                                {d.batidas[i].manual && <span className="ml-1 text-xs text-neutral-500">manual</span>}
                              </>
                            ) : (
                              <span className="text-neutral-300">—</span>
                            )}
                            {i === 3 && d.batidas.length > 4 && <span className="ml-1 text-xs text-neutral-500">+{d.batidas.length - 4}</span>}
                          </td>
                        ))}
                        <td className="py-2 pr-3 tabular-nums">{d.trabalhadoMin > 0 ? duracao(d.trabalhadoMin) : "—"}</td>
                        <td className="py-2 pr-3">
                          <span className="inline-flex flex-wrap gap-1">{d.futuro ? "—" : selosDoDia(d).map((s) => <Chip key={s.texto} s={s} />)}</span>
                          {obs.map((t) => (
                            <p key={t} className={`mt-0.5 text-xs ${t.startsWith("Divergência") ? "text-amber-900" : "text-neutral-700"}`}>
                              {t}
                            </p>
                          ))}
                        </td>
                        {colunasOficiais.map((c) => (
                          <td key={c} className="border-l border-neutral-200 py-2 pl-2 pr-1 text-right tabular-nums">
                            {d.oficial?.[c] || <span className="text-neutral-300">—</span>}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
                {colunasOficiais.length > 0 && dados.oficial && (
                  <tfoot>
                    <tr className="border-t-2 border-neutral-300 font-semibold">
                      <td className="py-2" colSpan={9}>
                        Totais do Secullum
                      </td>
                      {colunasOficiais.map((c) => (
                        <td key={c} className="border-l border-neutral-200 py-2 pl-2 pr-1 text-right tabular-nums">
                          {dados.oficial!.totais[c] || "—"}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </section>

          {/* Cartões (celular) */}
          <section className="cartao md:hidden">
            <ul className="divide-y divide-neutral-100">
              {dados.dias.map((d) => {
                const obs = observacoesDoDia(d);
                return (
                  <li key={d.dia} className={`py-3 ${d.futuro ? "text-neutral-400" : ""}`}>
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="font-medium tabular-nums">
                        {dataBR(d.dia).slice(0, 5)} <span className="font-normal text-neutral-500">{d.diaSemana}</span>
                      </p>
                      <p className="text-xs text-neutral-600">{[d.escala, d.previsto].filter(Boolean).join(" · ") || "—"}</p>
                    </div>
                    {!d.futuro && <div className="mt-1 flex flex-wrap gap-1">{selosDoDia(d).map((s) => <Chip key={s.texto} s={s} />)}</div>}
                    {d.batidas.length > 0 && <p className="mt-1 text-xs tabular-nums text-neutral-700">{d.batidas.map((b) => b.hora + (b.manual ? " (manual)" : "")).join(" · ")} {d.trabalhadoMin > 0 && `· ${duracao(d.trabalhadoMin)}`}</p>}
                    {obs.map((t) => (
                      <p key={t} className={`mt-0.5 text-xs ${t.startsWith("Divergência") ? "text-amber-900" : "text-neutral-700"}`}>
                        {t}
                      </p>
                    ))}
                    {colunasOficiais.length > 0 && d.oficial && <p className="mt-0.5 text-xs text-neutral-600">Secullum: {colunasOficiais.filter((c) => d.oficial![c]).map((c) => `${c} ${d.oficial![c]}`).join(" · ") || "—"}</p>}
                  </li>
                );
              })}
            </ul>
          </section>

          <p className="text-xs text-neutral-500">
            Dados do Secullum lidos em {new Date(dados.atualizadoEm).toLocaleString("pt-BR")} (só leitura). Classificação operacional do BlackPoke: não gera desconto, hora extra nem falta oficial.
          </p>
        </div>
      )}
    </div>
  );
}

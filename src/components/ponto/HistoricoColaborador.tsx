"use client";

import { useCallback, useEffect, useState } from "react";
import { ROTULO_TIPO, ROTULO_TIPO_PLURAL, TIPOS_OCORRENCIA, contarPorTipo, ocorrenciasAutomaticasDoMes, validarManual, type NovaOcorrencia, type Ocorrencia, type TipoOcorrencia } from "@/lib/ponto/historico";
import type { MesDoColaborador } from "@/lib/ponto/mesTipos";
import { supabase } from "@/lib/supabase";

const COR_TIPO: Record<TipoOcorrencia, string> = {
  falta: "bg-red-100 text-red-900",
  atraso: "bg-amber-100 text-amber-900",
  atestado: "bg-violet-100 text-violet-900",
  advertencia: "bg-orange-100 text-orange-900",
  observacao: "bg-neutral-100 text-neutral-800",
};

const dataBR = (iso: string) => iso.split("-").reverse().join("/");
const periodo = (o: Pick<Ocorrencia, "data_inicio" | "data_fim">) => (o.data_fim && o.data_fim !== o.data_inicio ? `${dataBR(o.data_inicio)} a ${dataBR(o.data_fim)}` : dataBR(o.data_inicio));
const nomeMes = (mes: string) => new Date(`${mes}-01T00:00:00Z`).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
const ultimoDia = (mes: string) => {
  const [a, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
};
const FALTA_TABELA = /does not exist|schema cache|42P01|PGRST205/i;

export function HistoricoColaborador({ funcionarioId, nome, colaboradorId, mesAtual, dadosDoMes, quemLanca }: { funcionarioId: number; nome: string; colaboradorId: string | null; mesAtual: string; dadosDoMes: MesDoColaborador | null; quemLanca: string }) {
  const [lista, setLista] = useState<Ocorrencia[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [semTabela, setSemTabela] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [abrirForm, setAbrirForm] = useState(false);
  const [tipo, setTipo] = useState<TipoOcorrencia>("atestado");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [minutos, setMinutos] = useState("");
  const [descricao, setDescricao] = useState("");
  const [filtro, setFiltro] = useState<TipoOcorrencia | null>(null);

  const carregar = useCallback(async () => {
    const { data, error } = await supabase()
      .from("ocorrencias_colaborador")
      .select("id, funcionario_ponto_id, nome_registrado, tipo, data_inicio, data_fim, minutos, descricao, origem, lancado_por_nome, criado_em")
      .eq("funcionario_ponto_id", funcionarioId)
      .order("data_inicio", { ascending: false })
      .order("criado_em", { ascending: false })
      .limit(1000);
    if (error) {
      if (FALTA_TABELA.test(`${error.code ?? ""} ${error.message}`)) setSemTabela(true);
      else setErro(error.message);
      setLista([]);
      return;
    }
    setSemTabela(false);
    setErro(null);
    setLista((data ?? []) as Ocorrencia[]);
  }, [funcionarioId]);

  useEffect(() => {
    const t = setTimeout(() => void carregar(), 0);
    return () => clearTimeout(t);
  }, [carregar]);

  async function gravarManual(e: React.FormEvent) {
    e.preventDefault();
    const o: NovaOcorrencia = { tipo, data_inicio: inicio, data_fim: fim || null, minutos: tipo === "atraso" ? Number(minutos) || null : null, descricao: descricao.trim() || null };
    const problema = validarManual(o);
    if (problema) return setErro(problema);
    setOcupado(true);
    setErro(null);
    const { error } = await supabase().from("ocorrencias_colaborador").insert({ ...o, funcionario_ponto_id: funcionarioId, colaborador_id: colaboradorId, nome_registrado: nome, origem: "manual", lancado_por_nome: quemLanca });
    setOcupado(false);
    if (error) return setErro(error.message);
    setAviso("Registro guardado.");
    setInicio("");
    setFim("");
    setMinutos("");
    setDescricao("");
    setAbrirForm(false);
    await carregar();
  }

  async function guardarMes() {
    if (!dadosDoMes) return;
    const novas = ocorrenciasAutomaticasDoMes(dadosDoMes);
    if (!window.confirm(`Guardar no histórico as ${novas.length} falta(s) e atraso(s) de ${nomeMes(mesAtual)}? O que já foi guardado automaticamente neste mês será substituído. Os registros manuais não mudam.`)) return;
    setOcupado(true);
    setErro(null);
    setAviso(null);
    const db = supabase();
    const apagar = await db.from("ocorrencias_colaborador").delete().eq("funcionario_ponto_id", funcionarioId).eq("origem", "automatica").gte("data_inicio", `${mesAtual}-01`).lte("data_inicio", ultimoDia(mesAtual));
    if (apagar.error) {
      setOcupado(false);
      return setErro(apagar.error.message);
    }
    if (novas.length > 0) {
      const ins = await db.from("ocorrencias_colaborador").insert(novas.map((o) => ({ ...o, funcionario_ponto_id: funcionarioId, colaborador_id: colaboradorId, nome_registrado: nome, origem: "automatica", lancado_por_nome: quemLanca })));
      if (ins.error) {
        setOcupado(false);
        return setErro(ins.error.message);
      }
    }
    setOcupado(false);
    setAviso(`${nomeMes(mesAtual)}: ${novas.length} registro(s) guardado(s).${dadosDoMes.escala.existe ? "" : " Sem escala neste mês o app não declara faltas; só os atrasos entram."}`);
    await carregar();
  }

  async function remover(o: Ocorrencia) {
    if (!window.confirm(`Apagar este registro (${ROTULO_TIPO[o.tipo]} em ${periodo(o)})? Não dá para desfazer.`)) return;
    setOcupado(true);
    const { error } = await supabase().from("ocorrencias_colaborador").delete().eq("id", o.id);
    setOcupado(false);
    if (error) return setErro(error.message);
    setAviso(null);
    await carregar();
  }

  if (semTabela) {
    return (
      <section className="cartao space-y-2">
        <h3 className="font-semibold">Histórico ainda não ativado</h3>
        <p className="text-sm text-neutral-700">
          Falta criar a tabela no banco. Rode o arquivo <code>supabase/escala/17_historico_colaborador.sql</code> no SQL Editor do Supabase e recarregue esta página.
        </p>
      </section>
    );
  }

  const contagem = contarPorTipo(lista ?? []);
  const visiveis = (lista ?? []).filter((o) => filtro === null || o.tipo === filtro);

  return (
    <div className="space-y-4">
      <section className="cartao space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="mr-auto font-semibold">Histórico de {nome}</h3>
          <button type="button" className="botao" onClick={() => setAbrirForm((v) => !v)}>
            {abrirForm ? "Fechar" : "Novo registro"}
          </button>
          <button type="button" className="botao-secundario" disabled={ocupado || !dadosDoMes} onClick={guardarMes}>
            Guardar faltas e atrasos de {nomeMes(mesAtual)}
          </button>
        </div>

        {abrirForm && (
          <form onSubmit={gravarManual} className="space-y-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Tipo</span>
                <select className="campo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoOcorrencia)}>
                  {TIPOS_OCORRENCIA.map((t) => (
                    <option key={t} value={t}>
                      {ROTULO_TIPO[t]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium">{tipo === "atestado" ? "Primeiro dia" : "Data"}</span>
                <input className="campo" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} required />
              </label>
              {(tipo === "atestado" || tipo === "falta") && (
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">Último dia (se for mais de um)</span>
                  <input className="campo" type="date" value={fim} min={inicio || undefined} onChange={(e) => setFim(e.target.value)} />
                </label>
              )}
              {tipo === "atraso" && (
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">Minutos de atraso</span>
                  <input className="campo" type="number" inputMode="numeric" min={1} value={minutos} onChange={(e) => setMinutos(e.target.value)} />
                </label>
              )}
            </div>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Descrição {tipo === "advertencia" || tipo === "observacao" ? "" : "(opcional)"}</span>
              <textarea className="campo min-h-20" value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={500} />
              {tipo === "atestado" && <span className="mt-1 block text-xs text-neutral-600">Guarde só as datas. Não escreva diagnóstico nem CID: é dado de saúde.</span>}
            </label>
            <button type="submit" className="botao" disabled={ocupado}>
              {ocupado ? "Guardando…" : "Guardar registro"}
            </button>
          </form>
        )}

        {erro && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{erro}</p>}
        {aviso && <p className="rounded-xl bg-green-50 p-3 text-sm text-green-900">{aviso}</p>}

        <div className="flex flex-wrap gap-2">
          {TIPOS_OCORRENCIA.map((t) => (
            <button key={t} type="button" aria-pressed={filtro === t} onClick={() => setFiltro(filtro === t ? null : t)} className={`inline-flex h-10 items-center gap-2 rounded-full border px-3 text-sm font-medium ${filtro === t ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"}`}>
              {ROTULO_TIPO_PLURAL[t]}
              <span className={`text-xs tabular-nums ${filtro === t ? "text-neutral-300" : "text-neutral-500"}`}>{contagem[t]}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="cartao">
        {lista === null ? (
          <p className="text-neutral-600">Carregando…</p>
        ) : visiveis.length === 0 ? (
          <p className="text-neutral-600">Nada guardado {filtro ? "com esse filtro" : "ainda"}. Use “Guardar faltas e atrasos” para registrar o mês aberto, ou “Novo registro” para atestados e advertências.</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {visiveis.map((o) => (
              <li key={o.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 py-3">
                <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${COR_TIPO[o.tipo]}`}>{ROTULO_TIPO[o.tipo]}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium tabular-nums">
                    {periodo(o)}
                    {o.minutos ? <span className="ml-2 font-normal text-neutral-600">{o.minutos} min</span> : null}
                  </p>
                  {o.descricao && <p className="text-sm text-neutral-700">{o.descricao}</p>}
                  <p className="text-xs text-neutral-500">
                    {o.origem === "automatica" ? "Guardado do ponto" : "Lançado à mão"}
                    {o.lancado_por_nome ? ` por ${o.lancado_por_nome}` : ""} em {new Date(o.criado_em).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <button type="button" className="botao-secundario !px-3 !py-1.5 text-sm" disabled={ocupado} onClick={() => remover(o)}>
                  Apagar
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

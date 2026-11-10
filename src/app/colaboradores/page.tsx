"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useSessao } from "@/components/Sessao";
import { ehRH } from "@/lib/acesso";
import { ROTULO_TURNO, rotuloFuncao } from "@/lib/funcoes";
import { semAcento } from "@/lib/importacao/colaboradores";
import type { Colaborador, Funcao, Turno2, Unidade } from "@/lib/tipos";

type Formulario = {
  id: string | null;
  nome: string;
  cargo: string;
  funcaoId: string;
  turno: Turno2 | "";
  adicionais: string[];
  telefone: string;
  cpf: string;
  matricula: string;
  admissao: string;
  desligamento: string;
};

const VAZIO: Formulario = {
  id: null, nome: "", cargo: "", funcaoId: "", turno: "", adicionais: [],
  telefone: "", cpf: "", matricula: "", admissao: "", desligamento: "",
};

const COLUNAS = "id, unidade_id, nome, nome_completo, empresa, cargo, matricula, cpf, telefone, funcao_principal_id, turno, data_admissao, data_desligamento, ativo";

export default function Colaboradores() {
  const { perfil } = useSessao();
  const podeEditar = ehRH(perfil);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [unidadeId, setUnidadeId] = useState("");
  const [funcoes, setFuncoes] = useState<Funcao[]>([]);
  const [lista, setLista] = useState<Colaborador[]>([]);
  const [adicionaisPor, setAdicionaisPor] = useState<Record<string, string[]>>({});
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [form, setForm] = useState<Formulario | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [busca, setBusca] = useState("");
  const [filtroTurno, setFiltroTurno] = useState<Turno2 | "">("");
  const [mostrarInativos, setMostrarInativos] = useState(false);

  useEffect(() => {
    supabase()
      .from("unidades")
      .select("id, nome, ativa")
      .eq("ativa", true)
      .order("nome")
      .then(({ data, error }) => {
        if (error) setErro(error.message);
        const u = (data ?? []) as Unidade[];
        setUnidades(u);
        setUnidadeId((atual) => atual || u[0]?.id || "");
        if (u.length === 0) setCarregando(false);
      });
  }, []);

  const carregar = useCallback(async () => {
    if (!unidadeId) return;
    const db = supabase();
    const [f, c] = await Promise.all([
      db.from("funcoes").select("id, unidade_id, nome, operacao, ativa").eq("unidade_id", unidadeId).order("nome"),
      db.from("colaboradores").select(COLUNAS).eq("unidade_id", unidadeId).order("nome"),
    ]);
    if (f.error || c.error) {
      setErro((f.error ?? c.error)!.message);
      setCarregando(false);
      return;
    }
    const colabs = c.data as Colaborador[];
    const ids = colabs.map((x) => x.id);
    const mapa: Record<string, string[]> = {};
    if (ids.length > 0) {
      const a = await db.from("colaborador_funcoes").select("colaborador_id, funcao_id").in("colaborador_id", ids);
      if (a.error) setErro(a.error.message);
      for (const r of a.data ?? []) (mapa[r.colaborador_id] ??= []).push(r.funcao_id);
    }
    setErro(null);
    setFuncoes(f.data as Funcao[]);
    setLista(colabs);
    setAdicionaisPor(mapa);
    setCarregando(false);
  }, [unidadeId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar();
  }, [carregar]);

  // A pesquisa da barra superior chega pelo endereço (?busca=) ou por um evento quando já estamos aqui.
  useEffect(() => {
    const doEndereco = new URLSearchParams(window.location.search).get("busca");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (doEndereco) setBusca(doEndereco);
    const ouvir = (e: Event) => setBusca(String((e as CustomEvent).detail ?? ""));
    window.addEventListener("busca-colaborador", ouvir);
    return () => window.removeEventListener("busca-colaborador", ouvir);
  }, []);

  const funcaoPorId = useMemo(() => new Map(funcoes.map((f) => [f.id, f])), [funcoes]);

  const visiveis = lista.filter(
    (c) =>
      (mostrarInativos || c.ativo) &&
      (!filtroTurno || c.turno === filtroTurno) &&
      (semAcento(c.nome).includes(semAcento(busca)) || semAcento(c.nome_completo ?? "").includes(semAcento(busca))),
  );

  function abrirEdicao(c: Colaborador) {
    setErro(null);
    setForm({
      id: c.id,
      nome: c.nome,
      cargo: c.cargo ?? "",
      funcaoId: c.funcao_principal_id,
      turno: c.turno,
      adicionais: adicionaisPor[c.id] ?? [],
      telefone: c.telefone ?? "",
      cpf: c.cpf ?? "",
      matricula: c.matricula ?? "",
      admissao: c.data_admissao ?? "",
      desligamento: c.data_desligamento ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    const nome = form.nome.trim();
    const cpf = form.cpf.replace(/\D/g, "");
    if (!nome) return setErro("Preencha o nome.");
    if (!form.funcaoId) return setErro("Escolha a função principal.");
    if (!form.turno) return setErro("Escolha o turno fixo.");
    if (cpf && cpf.length !== 11) return setErro("O CPF deve ter 11 números.");
    if (form.admissao && form.desligamento && form.desligamento < form.admissao) {
      return setErro("A data de desligamento não pode ser antes da admissão.");
    }
    setSalvando(true);
    const dados = {
      unidade_id: unidadeId,
      nome,
      cargo: form.cargo.trim() || null,
      funcao_principal_id: form.funcaoId,
      turno: form.turno,
      telefone: form.telefone.trim() || null,
      cpf: cpf || null,
      matricula: form.matricula.trim() || null,
      data_admissao: form.admissao || null,
      data_desligamento: form.desligamento || null,
    };
    const db = supabase();
    let id = form.id;
    let falha: { code?: string; message: string } | null = null;
    if (id) {
      falha = (await db.from("colaboradores").update(dados).eq("id", id)).error;
    } else {
      const r = await db.from("colaboradores").insert(dados).select("id").single();
      falha = r.error;
      id = r.data?.id ?? null;
    }
    if (!falha && id) {
      const del = await db.from("colaborador_funcoes").delete().eq("colaborador_id", id);
      falha = del.error;
      const extras = form.adicionais.filter((f) => f !== form.funcaoId);
      if (!falha && extras.length > 0) {
        falha = (await db.from("colaborador_funcoes").insert(extras.map((f) => ({ colaborador_id: id, funcao_id: f })))).error;
      }
    }
    setSalvando(false);
    if (falha) {
      return setErro(falha.code === "23505" ? "Já existe um colaborador com esse CPF ou matrícula." : falha.message);
    }
    setForm(null);
    setErro(null);
    await carregar();
  }

  async function mudarAtivo(c: Colaborador) {
    const { error } = await supabase().from("colaboradores").update({ ativo: !c.ativo }).eq("id", c.id);
    if (error) setErro(error.message);
    else await carregar();
  }

  const funcoesAtivas = funcoes.filter((f) => f.ativa || f.id === form?.funcaoId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Colaboradores</h1>
        {podeEditar && !form && (
          <div className="flex gap-2">
            <Link href="/colaboradores/importar" className="botao-secundario">Importar planilha</Link>
            <button className="botao" onClick={() => { setErro(null); setForm(VAZIO); }} disabled={funcoes.length === 0}>
              + Adicionar
            </button>
          </div>
        )}
      </div>

      <label className="block">
        <span className="mb-1 block font-medium">Unidade</span>
        <select
          className="campo"
          value={unidadeId}
          onChange={(e) => { setCarregando(true); setForm(null); setUnidadeId(e.target.value); }}
        >
          {unidades.map((u) => (
            <option key={u.id} value={u.id}>{u.nome}</option>
          ))}
        </select>
      </label>

      {erro && <p className="rounded-xl bg-red-50 p-3 text-red-700">{erro}</p>}

      {!carregando && funcoes.length === 0 && (
        <p className="cartao">
          Esta unidade ainda não tem funções. {podeEditar ? (
            <>Cadastre em <Link href="/funcoes" className="underline">Funções</Link> ou use <Link href="/colaboradores/importar" className="underline">Importar planilha</Link>.</>
          ) : "Peça ao RH para cadastrar."}
        </p>
      )}

      {form && (
        <form onSubmit={salvar} className="cartao space-y-3">
          <h2 className="text-lg font-semibold">{form.id ? "Editar colaborador" : "Novo colaborador"}</h2>
          <label className="block">
            <span className="mb-1 block font-medium">Nome</span>
            <input className="campo" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} autoComplete="off" />
          </label>
          <label className="block">
            <span className="mb-1 block font-medium">Cargo</span>
            <input className="campo" value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })} placeholder="Como está na carteira ou planilha" />
          </label>
          <label className="block">
            <span className="mb-1 block font-medium">Função principal</span>
            <select className="campo" value={form.funcaoId} onChange={(e) => setForm({ ...form, funcaoId: e.target.value })}>
              <option value="">Escolha…</option>
              {funcoesAtivas.map((f) => (
                <option key={f.id} value={f.id}>{rotuloFuncao(f)}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block font-medium">Turno fixo</span>
            <select className="campo" value={form.turno} onChange={(e) => setForm({ ...form, turno: e.target.value as Turno2 | "" })}>
              <option value="">Escolha…</option>
              <option value="dia">Dia</option>
              <option value="noite">Noite</option>
            </select>
          </label>
          <fieldset className="space-y-2">
            <legend className="mb-1 font-medium">Funções adicionais autorizadas</legend>
            <p className="text-sm text-neutral-600">Marque só o que a gerência autorizou expressamente.</p>
            {funcoesAtivas.filter((f) => f.id !== form.funcaoId).map((f) => {
              const marcado = form.adicionais.includes(f.id);
              return (
                <label key={f.id} className="flex items-center gap-3 rounded-xl border border-neutral-300 bg-white px-4 py-3">
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    checked={marcado}
                    onChange={() =>
                      setForm({ ...form, adicionais: marcado ? form.adicionais.filter((x) => x !== f.id) : [...form.adicionais, f.id] })
                    }
                  />
                  <span>{rotuloFuncao(f)}</span>
                </label>
              );
            })}
          </fieldset>
          <label className="block">
            <span className="mb-1 block font-medium">Telefone</span>
            <input className="campo" type="tel" inputMode="tel" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
          </label>
          <label className="block">
            <span className="mb-1 block font-medium">CPF (opcional)</span>
            <input className="campo" inputMode="numeric" value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} />
          </label>
          <label className="block">
            <span className="mb-1 block font-medium">Matrícula (opcional)</span>
            <input className="campo" value={form.matricula} onChange={(e) => setForm({ ...form, matricula: e.target.value })} />
          </label>
          <label className="block">
            <span className="mb-1 block font-medium">Data de admissão</span>
            <input className="campo" type="date" value={form.admissao} onChange={(e) => setForm({ ...form, admissao: e.target.value })} />
          </label>
          <label className="block">
            <span className="mb-1 block font-medium">Data de desligamento</span>
            <input className="campo" type="date" value={form.desligamento} onChange={(e) => setForm({ ...form, desligamento: e.target.value })} />
          </label>
          <div className="flex gap-2">
            <button type="submit" className="botao flex-1" disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</button>
            <button type="button" className="botao-secundario flex-1" onClick={() => { setForm(null); setErro(null); }}>Cancelar</button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        <input className="campo" placeholder="Buscar por nome" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <div className="flex flex-wrap items-center gap-2">
          {(["", "dia", "noite"] as const).map((t) => (
            <button
              key={t || "todos"}
              onClick={() => setFiltroTurno(t)}
              className={filtroTurno === t ? "botao" : "botao-secundario"}
            >
              {t ? ROTULO_TURNO[t] : "Todos"}
            </button>
          ))}
          <label className="ml-auto flex items-center gap-2">
            <input type="checkbox" className="h-5 w-5" checked={mostrarInativos} onChange={(e) => setMostrarInativos(e.target.checked)} />
            Mostrar inativos
          </label>
        </div>
      </div>

      {carregando && <p className="text-neutral-600">Carregando…</p>}
      {!carregando && funcoes.length > 0 && visiveis.length === 0 && (
        <p className="text-neutral-600">Nenhum colaborador encontrado.</p>
      )}

      <ul className="space-y-3">
        {visiveis.map((c) => {
          const principal = funcaoPorId.get(c.funcao_principal_id);
          const extras = (adicionaisPor[c.id] ?? []).map((id) => funcaoPorId.get(id)).filter(Boolean) as Funcao[];
          return (
            <li key={c.id} className={`cartao ${c.ativo ? "" : "opacity-60"}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-lg font-semibold">
                    {c.nome_completo || c.nome}
                    {c.empresa && <span className="ml-2 align-middle rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-700">{c.empresa}</span>}
                  </p>
                  {c.nome_completo && c.nome_completo !== c.nome && <p className="text-xs text-neutral-500">Na escala: {c.nome}</p>}
                  <p className="text-neutral-700">{principal ? rotuloFuncao(principal) : "—"}</p>
                  {c.cargo && <p className="text-sm text-neutral-600">Cargo: {c.cargo}</p>}
                  {c.telefone && <p className="text-neutral-700">{c.telefone}</p>}
                  {extras.length > 0 && (
                    <p className="text-sm text-neutral-600">Também pode: {extras.map(rotuloFuncao).join(", ")}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="rounded-full bg-neutral-200 px-3 py-1 text-sm">{ROTULO_TURNO[c.turno]}</span>
                  {!c.ativo && <span className="rounded-full bg-neutral-200 px-3 py-1 text-sm">Inativo</span>}
                </div>
              </div>
              {podeEditar && (
                <div className="mt-3 flex gap-2">
                  <button className="botao-secundario flex-1" onClick={() => abrirEdicao(c)}>Editar</button>
                  <button className="botao-secundario flex-1" onClick={() => mudarAtivo(c)}>
                    {c.ativo ? "Inativar" : "Reativar"}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useSessao } from "@/components/Sessao";
import { SeletorUnidade, useUnidades } from "@/components/SeletorUnidade";
import { dataBR, hojeISO } from "@/lib/datas";
import type { Ausencia, TipoAusencia } from "@/lib/tipos";

const ROTULO_TIPO: Record<TipoAusencia, string> = {
  ferias: "Férias",
  afastamento: "Afastamento",
  indisponibilidade: "Indisponibilidade",
};

type Linha = Ausencia & { colaboradores: { nome: string } | null };
type Formulario = { colaboradorId: string; tipo: TipoAusencia; inicio: string; fim: string; motivo: string };
const VAZIO: Formulario = { colaboradorId: "", tipo: "ferias", inicio: "", fim: "", motivo: "" };

export default function Ausencias() {
  const { perfil } = useSessao();
  const podeEditar = perfil.perfil === "rh";
  const { unidades, unidadeId, setUnidadeId, erro: erroUnidades } = useUnidades();
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [colaboradores, setColaboradores] = useState<{ id: string; nome: string }[]>([]);
  const [form, setForm] = useState<Formulario>(VAZIO);
  const [mostrarEncerradas, setMostrarEncerradas] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    if (!unidadeId) return;
    const db = supabase();
    const [a, c] = await Promise.all([
      db
        .from("ausencias")
        .select("id, colaborador_id, tipo, data_inicio, data_fim, motivo, colaboradores!inner(nome, unidade_id)")
        .eq("colaboradores.unidade_id", unidadeId)
        .order("data_inicio", { ascending: false }),
      db.from("colaboradores").select("id, nome").eq("unidade_id", unidadeId).eq("ativo", true).order("nome"),
    ]);
    if (a.error || c.error) return setErro((a.error ?? c.error)!.message);
    setErro(null);
    setLinhas(a.data as unknown as Linha[]);
    setColaboradores(c.data as { id: string; nome: string }[]);
  }, [unidadeId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar();
  }, [carregar]);

  async function adicionar(e: React.FormEvent) {
    e.preventDefault();
    if (!form.colaboradorId) return setErro("Escolha o colaborador.");
    if (!form.inicio || !form.fim) return setErro("Preencha as datas de início e fim.");
    if (form.fim < form.inicio) return setErro("A data final não pode ser antes da inicial.");
    setSalvando(true);
    const { error } = await supabase().from("ausencias").insert({
      colaborador_id: form.colaboradorId,
      tipo: form.tipo,
      data_inicio: form.inicio,
      data_fim: form.fim,
      motivo: form.motivo.trim() || null,
    });
    setSalvando(false);
    if (error) return setErro(error.message);
    setErro(null);
    setForm(VAZIO);
    await carregar();
  }

  async function remover(id: string) {
    const { error } = await supabase().from("ausencias").delete().eq("id", id);
    if (error) setErro(error.message);
    else await carregar();
  }

  const hoje = hojeISO();
  const visiveis = linhas.filter((l) => mostrarEncerradas || l.data_fim >= hoje);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Ausências</h1>
      <p className="text-neutral-700">Férias, afastamentos e indisponibilidades. O motor de escala não escala ninguém nesses dias.</p>
      <SeletorUnidade unidades={unidades} valor={unidadeId} aoMudar={setUnidadeId} />
      {(erro || erroUnidades) && <p className="rounded-xl bg-red-50 p-3 text-red-700">{erro ?? erroUnidades}</p>}

      {podeEditar && (
        <form onSubmit={adicionar} className="cartao space-y-3">
          <h2 className="text-lg font-semibold">Nova ausência</h2>
          <label className="block">
            <span className="mb-1 block font-medium">Colaborador</span>
            <select className="campo" value={form.colaboradorId} onChange={(e) => setForm({ ...form, colaboradorId: e.target.value })}>
              <option value="">Escolha…</option>
              {colaboradores.map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block font-medium">Tipo</span>
            <select className="campo" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoAusencia })}>
              {(Object.keys(ROTULO_TIPO) as TipoAusencia[]).map((t) => (
                <option key={t} value={t}>{ROTULO_TIPO[t]}</option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block font-medium">Início</span>
              <input className="campo" type="date" value={form.inicio} onChange={(e) => setForm({ ...form, inicio: e.target.value })} />
            </label>
            <label className="block">
              <span className="mb-1 block font-medium">Fim</span>
              <input className="campo" type="date" value={form.fim} onChange={(e) => setForm({ ...form, fim: e.target.value })} />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block font-medium">Motivo (opcional)</span>
            <input className="campo" value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} />
          </label>
          <button type="submit" className="botao w-full" disabled={salvando}>{salvando ? "Salvando…" : "Adicionar"}</button>
        </form>
      )}

      <label className="flex items-center gap-2">
        <input type="checkbox" className="h-5 w-5" checked={mostrarEncerradas} onChange={(e) => setMostrarEncerradas(e.target.checked)} />
        Mostrar ausências já encerradas
      </label>

      {visiveis.length === 0 && <p className="text-neutral-600">Nenhuma ausência registrada.</p>}
      <ul className="space-y-3">
        {visiveis.map((l) => (
          <li key={l.id} className="cartao">
            <p className="text-lg font-semibold">{l.colaboradores?.nome ?? "—"}</p>
            <p className="text-neutral-700">
              {ROTULO_TIPO[l.tipo]} · {dataBR(l.data_inicio)} a {dataBR(l.data_fim)}
            </p>
            {l.motivo && <p className="text-sm text-neutral-600">{l.motivo}</p>}
            {podeEditar && (
              <button className="botao-secundario mt-3 w-full" onClick={() => remover(l.id)}>Remover</button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

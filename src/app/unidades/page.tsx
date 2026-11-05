"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useSessao } from "@/components/Sessao";
import type { Unidade } from "@/lib/tipos";

type Formulario = { id: string | null; nome: string };

export default function Unidades() {
  const { perfil } = useSessao();
  const podeEditar = perfil.perfil === "rh";
  const [lista, setLista] = useState<Unidade[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [form, setForm] = useState<Formulario | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    const { data, error } = await supabase()
      .from("unidades")
      .select("id, nome, ativa")
      .order("ativa", { ascending: false })
      .order("nome");
    if (error) setErro(error.message);
    else {
      setErro(null);
      setLista(data as Unidade[]);
    }
    setCarregando(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar();
  }, [carregar]);

  function traduzir(e: { code?: string; message: string }) {
    return e.code === "23505" ? "Já existe uma unidade com esse nome." : e.message;
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    const nome = form.nome.trim();
    if (!nome) return setErro("Preencha o nome da unidade.");
    setSalvando(true);
    const { error } = form.id
      ? await supabase().from("unidades").update({ nome }).eq("id", form.id)
      : await supabase().from("unidades").insert({ nome });
    setSalvando(false);
    if (error) return setErro(traduzir(error));
    setForm(null);
    await carregar();
  }

  async function mudarAtiva(u: Unidade) {
    const { error } = await supabase().from("unidades").update({ ativa: !u.ativa }).eq("id", u.id);
    if (error) setErro(traduzir(error));
    else await carregar();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Unidades</h1>
        {podeEditar && !form && (
          <button className="botao" onClick={() => { setErro(null); setForm({ id: null, nome: "" }); }}>
            + Adicionar unidade
          </button>
        )}
      </div>

      {erro && <p className="rounded-xl bg-red-50 p-3 text-red-700">{erro}</p>}

      {form && (
        <form onSubmit={salvar} className="cartao space-y-3">
          <h2 className="text-lg font-semibold">{form.id ? "Editar unidade" : "Nova unidade"}</h2>
          <label className="block">
            <span className="mb-1 block font-medium">Nome da unidade</span>
            <input
              className="campo"
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              autoComplete="off"
            />
          </label>
          <div className="flex gap-2">
            <button type="submit" className="botao flex-1" disabled={salvando}>
              {salvando ? "Salvando…" : "Salvar"}
            </button>
            <button type="button" className="botao-secundario flex-1" onClick={() => { setForm(null); setErro(null); }}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {carregando && <p className="text-neutral-600">Carregando…</p>}
      {!carregando && lista.length === 0 && !erro && (
        <p className="text-neutral-600">Nenhuma unidade disponível para o seu acesso.</p>
      )}

      <ul className="space-y-3">
        {lista.map((u) => (
          <li key={u.id} className={`cartao ${u.ativa ? "" : "opacity-60"}`}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-lg font-semibold">{u.nome}</p>
              {!u.ativa && <span className="rounded-full bg-neutral-200 px-3 py-1 text-sm">Desativada</span>}
            </div>
            {podeEditar && (
              <div className="mt-3 flex gap-2">
                <button
                  className="botao-secundario flex-1"
                  onClick={() => { setErro(null); setForm({ id: u.id, nome: u.nome }); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                >
                  Editar
                </button>
                <button className="botao-secundario flex-1" onClick={() => mudarAtiva(u)}>
                  {u.ativa ? "Desativar" : "Reativar"}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

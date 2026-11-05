"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useSessao } from "@/components/Sessao";
import { rotuloFuncao } from "@/lib/funcoes";
import type { Funcao, Unidade } from "@/lib/tipos";

export default function Funcoes() {
  const { perfil } = useSessao();
  const podeEditar = perfil.perfil === "rh";
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [unidadeId, setUnidadeId] = useState("");
  const [lista, setLista] = useState<Funcao[]>([]);
  const [nome, setNome] = useState("");
  const [operacao, setOperacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    supabase()
      .from("unidades")
      .select("id, nome, ativa")
      .eq("ativa", true)
      .order("nome")
      .then(({ data, error }) => {
        if (error) return setErro(error.message);
        const u = (data ?? []) as Unidade[];
        setUnidades(u);
        setUnidadeId((atual) => atual || u[0]?.id || "");
      });
  }, []);

  const carregar = useCallback(async () => {
    if (!unidadeId) return;
    const { data, error } = await supabase()
      .from("funcoes")
      .select("id, unidade_id, nome, operacao, ativa")
      .eq("unidade_id", unidadeId)
      .order("ativa", { ascending: false })
      .order("nome");
    if (error) setErro(error.message);
    else setLista(data as Funcao[]);
  }, [unidadeId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar();
  }, [carregar]);

  async function adicionar(e: React.FormEvent) {
    e.preventDefault();
    const n = nome.trim();
    if (!n) return setErro("Preencha o nome da função.");
    setSalvando(true);
    const { error } = await supabase()
      .from("funcoes")
      .insert({ unidade_id: unidadeId, nome: n, operacao: operacao.trim() || null });
    setSalvando(false);
    if (error) return setErro(error.code === "23505" ? "Essa função já existe nesta unidade." : error.message);
    setErro(null);
    setNome("");
    setOperacao("");
    await carregar();
  }

  async function mudarAtiva(f: Funcao) {
    const { error } = await supabase().from("funcoes").update({ ativa: !f.ativa }).eq("id", f.id);
    if (error) setErro(error.message);
    else await carregar();
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Funções</h1>
      <p className="text-neutral-700">
        Funções são os postos de trabalho da unidade (caixa, expedição, sushiman…). Cada
        colaborador tem uma função principal e, se autorizado, funções adicionais.
      </p>

      <label className="block">
        <span className="mb-1 block font-medium">Unidade</span>
        <select className="campo" value={unidadeId} onChange={(e) => setUnidadeId(e.target.value)}>
          {unidades.map((u) => (
            <option key={u.id} value={u.id}>{u.nome}</option>
          ))}
        </select>
      </label>

      {erro && <p className="rounded-xl bg-red-50 p-3 text-red-700">{erro}</p>}

      {podeEditar && unidadeId && (
        <form onSubmit={adicionar} className="cartao space-y-3">
          <h2 className="text-lg font-semibold">Nova função</h2>
          <label className="block">
            <span className="mb-1 block font-medium">Nome</span>
            <input className="campo" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Cozinheiro" />
          </label>
          <label className="block">
            <span className="mb-1 block font-medium">Operação (opcional)</span>
            <input className="campo" value={operacao} onChange={(e) => setOperacao(e.target.value)} placeholder="Ex.: Seu Miyagi" />
          </label>
          <button type="submit" className="botao w-full" disabled={salvando}>
            {salvando ? "Salvando…" : "Adicionar função"}
          </button>
        </form>
      )}

      {lista.length === 0 && <p className="text-neutral-600">Nenhuma função cadastrada nesta unidade ainda.</p>}
      <ul className="space-y-3">
        {lista.map((f) => (
          <li key={f.id} className={`cartao flex items-center justify-between gap-2 ${f.ativa ? "" : "opacity-60"}`}>
            <span className="text-lg font-semibold">{rotuloFuncao(f)}</span>
            {podeEditar && (
              <button className="botao-secundario" onClick={() => mudarAtiva(f)}>
                {f.ativa ? "Desativar" : "Reativar"}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

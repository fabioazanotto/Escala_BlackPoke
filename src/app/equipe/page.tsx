"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase, variaveisConfiguradas } from "@/lib/supabase";
import { FUNCOES_PADRAO, type Funcionario } from "@/lib/tipos";

type Formulario = { id: string | null; nome: string; funcao: string; telefone: string };

const FORMULARIO_VAZIO: Formulario = { id: null, nome: "", funcao: "", telefone: "" };

export default function Equipe() {
  const [lista, setLista] = useState<Funcionario[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [form, setForm] = useState<Formulario | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    if (!variaveisConfiguradas()) {
      setErro("As variáveis do Supabase não foram configuradas.");
      setCarregando(false);
      return;
    }
    const { data, error } = await supabase()
      .from("funcionarios")
      .select("id, nome, funcao, telefone, cpf, ativo")
      .order("ativo", { ascending: false })
      .order("nome");
    if (error) setErro(error.message);
    else {
      setErro(null);
      setLista(data as Funcionario[]);
    }
    setCarregando(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar();
  }, [carregar]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    const nome = form.nome.trim();
    const funcao = form.funcao.trim();
    if (!nome || !funcao) {
      setErro("Preencha o nome e a função.");
      return;
    }
    setSalvando(true);
    const dados = { nome, funcao, telefone: form.telefone.trim() || null };
    const { error } = form.id
      ? await supabase().from("funcionarios").update(dados).eq("id", form.id)
      : await supabase().from("funcionarios").insert(dados);
    setSalvando(false);
    if (error) {
      setErro(error.message);
      return;
    }
    setForm(null);
    await carregar();
  }

  async function mudarAtivo(f: Funcionario, ativo: boolean) {
    const { error } = await supabase().from("funcionarios").update({ ativo }).eq("id", f.id);
    if (error) setErro(error.message);
    else await carregar();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Equipe</h1>
        {!form && (
          <button className="botao" onClick={() => { setErro(null); setForm(FORMULARIO_VAZIO); }}>
            + Adicionar funcionário
          </button>
        )}
      </div>

      {erro && <p className="rounded-xl bg-red-50 p-3 text-red-700">{erro}</p>}

      {form && (
        <form onSubmit={salvar} className="cartao space-y-3">
          <h2 className="text-lg font-semibold">
            {form.id ? "Editar funcionário" : "Novo funcionário"}
          </h2>
          <label className="block">
            <span className="mb-1 block font-medium">Nome</span>
            <input
              className="campo"
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              autoComplete="off"
            />
          </label>
          <label className="block">
            <span className="mb-1 block font-medium">Função</span>
            <input
              className="campo"
              list="funcoes"
              value={form.funcao}
              onChange={(e) => setForm({ ...form, funcao: e.target.value })}
              placeholder="Ex.: Salão, Cozinha…"
            />
            <datalist id="funcoes">
              {FUNCOES_PADRAO.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
          </label>
          <label className="block">
            <span className="mb-1 block font-medium">Telefone</span>
            <input
              className="campo"
              type="tel"
              inputMode="tel"
              value={form.telefone}
              onChange={(e) => setForm({ ...form, telefone: e.target.value })}
              placeholder="(11) 91234-0000"
            />
          </label>
          <div className="flex gap-2">
            <button type="submit" className="botao flex-1" disabled={salvando}>
              {salvando ? "Salvando…" : "Salvar"}
            </button>
            <button
              type="button"
              className="botao-secundario flex-1"
              onClick={() => { setForm(null); setErro(null); }}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {carregando && <p className="text-neutral-600">Carregando…</p>}
      {!carregando && lista.length === 0 && !erro && (
        <p className="text-neutral-600">Nenhum funcionário cadastrado ainda.</p>
      )}

      <ul className="space-y-3">
        {lista.map((f) => (
          <li key={f.id} className={`cartao ${f.ativo ? "" : "opacity-60"}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-lg font-semibold">{f.nome}</p>
                <p className="text-neutral-700">{f.funcao}</p>
                {f.telefone && <p className="text-neutral-700">{f.telefone}</p>}
              </div>
              {!f.ativo && (
                <span className="rounded-full bg-neutral-200 px-3 py-1 text-sm">Desativado</span>
              )}
            </div>
            <div className="mt-3 flex gap-2">
              <button
                className="botao-secundario flex-1"
                onClick={() => {
                  setErro(null);
                  setForm({ id: f.id, nome: f.nome, funcao: f.funcao, telefone: f.telefone ?? "" });
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                Editar
              </button>
              <button
                className="botao-secundario flex-1"
                onClick={() => mudarAtivo(f, !f.ativo)}
              >
                {f.ativo ? "Desativar" : "Reativar"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

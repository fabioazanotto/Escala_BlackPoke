"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useSessao } from "@/components/Sessao";
import { dataBR } from "@/lib/datas";
import type { Feriado, Parametro, Unidade } from "@/lib/tipos";

export default function Regras() {
  const { perfil } = useSessao();
  const podeEditar = perfil.perfil === "rh";
  const [parametros, setParametros] = useState<Parametro[]>([]);
  const [feriados, setFeriados] = useState<Feriado[]>([]);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [novoFeriado, setNovoFeriado] = useState({ data: "", nome: "", unidadeId: "" });
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const db = supabase();
    const [p, f, u] = await Promise.all([
      db.from("parametros").select("*").order("tipo", { ascending: false }).order("descricao"),
      db.from("feriados").select("*").order("data"),
      db.from("unidades").select("id, nome, ativa").eq("ativa", true).order("nome"),
    ]);
    if (p.error || f.error || u.error) return setErro((p.error ?? f.error ?? u.error)!.message);
    setErro(null);
    setParametros(p.data as Parametro[]);
    setFeriados(f.data as Feriado[]);
    setUnidades(u.data as Unidade[]);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar();
  }, [carregar]);

  async function salvarParametro(p: Parametro) {
    const valor = (p.valor ?? "").trim() || null;
    if (p.validado && !valor) return setErro("Para marcar como validado, informe o valor.");
    const { error } = await supabase()
      .from("parametros")
      .update({ valor, fonte: (p.fonte ?? "").trim() || null, validado: p.validado, observacao: (p.observacao ?? "").trim() || null })
      .eq("id", p.id);
    if (error) return setErro(error.message);
    setErro(null);
    setAviso("Parâmetro salvo.");
  }

  async function adicionarFeriado(e: React.FormEvent) {
    e.preventDefault();
    if (!novoFeriado.data || !novoFeriado.nome.trim()) return setErro("Preencha a data e o nome do feriado.");
    const { error } = await supabase().from("feriados").insert({
      data: novoFeriado.data,
      nome: novoFeriado.nome.trim(),
      unidade_id: novoFeriado.unidadeId || null,
    });
    if (error) return setErro(error.code === "23505" ? "Esse feriado já está cadastrado." : error.message);
    setErro(null);
    setNovoFeriado({ data: "", nome: "", unidadeId: "" });
    await carregar();
  }

  async function removerFeriado(id: string) {
    const { error } = await supabase().from("feriados").delete().eq("id", id);
    if (error) setErro(error.message);
    else await carregar();
  }

  const nomeUnidade = new Map(unidades.map((u) => [u.id, u.nome]));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Regras e feriados</h1>
      {erro && <p className="rounded-xl bg-red-50 p-3 text-red-700">{erro}</p>}
      {aviso && <p className="rounded-xl bg-green-50 p-3 text-green-800">{aviso}</p>}

      {(["operacional", "legal"] as const).map((tipo) => (
        <section key={tipo} className="space-y-3">
          <h2 className="text-xl font-semibold">{tipo === "operacional" ? "Regras operacionais" : "Exigências trabalhistas"}</h2>
          {tipo === "legal" && (
            <p className="rounded-xl bg-amber-50 p-3 text-amber-900">
              Nenhum valor legal é presumido. Preencha com o que seu contador ou a convenção coletiva
              confirmar e marque “validado”. Enquanto estiver em branco ou não validado, a escala avisa.
            </p>
          )}
          {parametros.filter((p) => p.tipo === tipo).map((p) => {
            const mudar = (campo: Partial<Parametro>) =>
              setParametros(parametros.map((x) => (x.id === p.id ? { ...x, ...campo } : x)));
            return (
              <div key={p.id} className="cartao space-y-3">
                <p className="font-semibold">{p.descricao}</p>
                {!p.validado && tipo === "legal" && (
                  <span className="inline-block rounded-full bg-amber-100 px-3 py-1 text-sm text-amber-900">Não validado</span>
                )}
                <label className="block">
                  <span className="mb-1 block font-medium">Valor</span>
                  <input className="campo" disabled={!podeEditar} value={p.valor ?? ""} onChange={(e) => mudar({ valor: e.target.value })} />
                </label>
                <label className="block">
                  <span className="mb-1 block font-medium">Fonte (lei, convenção, contador)</span>
                  <input className="campo" disabled={!podeEditar} value={p.fonte ?? ""} onChange={(e) => mudar({ fonte: e.target.value })} />
                </label>
                <label className="block">
                  <span className="mb-1 block font-medium">Observação</span>
                  <input className="campo" disabled={!podeEditar} value={p.observacao ?? ""} onChange={(e) => mudar({ observacao: e.target.value })} />
                </label>
                <label className="flex items-center gap-3">
                  <input type="checkbox" className="h-5 w-5" disabled={!podeEditar} checked={p.validado} onChange={(e) => mudar({ validado: e.target.checked })} />
                  Validado
                </label>
                {podeEditar && <button className="botao w-full" onClick={() => salvarParametro(p)}>Salvar</button>}
              </div>
            );
          })}
        </section>
      ))}

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Feriados</h2>
        {podeEditar && (
          <form onSubmit={adicionarFeriado} className="cartao space-y-3">
            <label className="block">
              <span className="mb-1 block font-medium">Data</span>
              <input className="campo" type="date" value={novoFeriado.data} onChange={(e) => setNovoFeriado({ ...novoFeriado, data: e.target.value })} />
            </label>
            <label className="block">
              <span className="mb-1 block font-medium">Nome</span>
              <input className="campo" value={novoFeriado.nome} onChange={(e) => setNovoFeriado({ ...novoFeriado, nome: e.target.value })} />
            </label>
            <label className="block">
              <span className="mb-1 block font-medium">Vale para</span>
              <select className="campo" value={novoFeriado.unidadeId} onChange={(e) => setNovoFeriado({ ...novoFeriado, unidadeId: e.target.value })}>
                <option value="">Todas as unidades</option>
                {unidades.map((u) => (
                  <option key={u.id} value={u.id}>{u.nome}</option>
                ))}
              </select>
            </label>
            <button type="submit" className="botao w-full">Adicionar feriado</button>
          </form>
        )}
        {feriados.length === 0 && <p className="text-neutral-600">Nenhum feriado cadastrado.</p>}
        <ul className="space-y-3">
          {feriados.map((f) => (
            <li key={f.id} className="cartao">
              <p className="text-lg font-semibold">{f.nome}</p>
              <p className="text-neutral-700">
                {dataBR(f.data)} · {f.unidade_id ? nomeUnidade.get(f.unidade_id) ?? "—" : "Todas as unidades"}
              </p>
              {podeEditar && <button className="botao-secundario mt-3 w-full" onClick={() => removerFeriado(f.id)}>Remover</button>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

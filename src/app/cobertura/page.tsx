"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useSessao } from "@/components/Sessao";
import { ehRH } from "@/lib/acesso";
import { SeletorUnidade, useUnidades } from "@/components/SeletorUnidade";
import { DIAS_SEMANA } from "@/lib/datas";
import { ROTULO_TURNO, rotuloFuncao } from "@/lib/funcoes";
import type { Cobertura, Funcao, Turno2 } from "@/lib/tipos";

type Novo = { turno: Turno2; funcaoId: string; dia: string; ideal: string; minimo: string };
const NOVO_VAZIO: Novo = { turno: "dia", funcaoId: "", dia: "", ideal: "1", minimo: "" };

function numeroOuNulo(t: string): number | null {
  return t.trim() === "" ? null : Number(t);
}

export default function CoberturaPagina() {
  const { perfil } = useSessao();
  const podeEditar = ehRH(perfil);
  const { unidades, unidadeId, setUnidadeId, erro: erroUnidades } = useUnidades();
  const [linhas, setLinhas] = useState<Cobertura[]>([]);
  const [funcoes, setFuncoes] = useState<Funcao[]>([]);
  const [equipe, setEquipe] = useState<Record<string, number>>({}); // turno|funcao -> pessoas ativas
  const [novo, setNovo] = useState<Novo>(NOVO_VAZIO);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!unidadeId) return;
    const db = supabase();
    const [c, f, p] = await Promise.all([
      db.from("cobertura").select("*").eq("unidade_id", unidadeId),
      db.from("funcoes").select("id, unidade_id, nome, operacao, ativa").eq("unidade_id", unidadeId).order("nome"),
      db.from("colaboradores").select("turno, funcao_principal_id").eq("unidade_id", unidadeId).eq("ativo", true),
    ]);
    if (c.error || f.error || p.error) return setErro((c.error ?? f.error ?? p.error)!.message);
    const contagem: Record<string, number> = {};
    for (const x of p.data ?? []) {
      const k = `${x.turno}|${x.funcao_principal_id}`;
      contagem[k] = (contagem[k] ?? 0) + 1;
    }
    setErro(null);
    setLinhas(c.data as Cobertura[]);
    setFuncoes(f.data as Funcao[]);
    setEquipe(contagem);
  }, [unidadeId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar();
  }, [carregar]);

  const funcaoPorId = new Map(funcoes.map((f) => [f.id, f]));

  async function salvar(c: Cobertura) {
    if (c.minimo_reduzido !== null && c.minimo_reduzido > c.ideal) {
      return setErro("A cobertura mínima reduzida não pode ser maior que a ideal.");
    }
    const { error } = await supabase()
      .from("cobertura")
      .update({ ideal: c.ideal, minimo_reduzido: c.minimo_reduzido })
      .eq("id", c.id);
    if (error) return setErro(error.message);
    setErro(null);
    setAviso("Cobertura salva.");
  }

  async function remover(c: Cobertura) {
    const { error } = await supabase().from("cobertura").delete().eq("id", c.id);
    if (error) return setErro(error.message);
    setAviso("Linha removida.");
    await carregar();
  }

  async function adicionar(e: React.FormEvent) {
    e.preventDefault();
    const ideal = Number(novo.ideal);
    const minimo = numeroOuNulo(novo.minimo);
    if (!novo.funcaoId) return setErro("Escolha a função.");
    if (!Number.isInteger(ideal) || ideal < 0) return setErro("Informe a cobertura ideal (número inteiro).");
    if (minimo !== null && (!Number.isInteger(minimo) || minimo < 0 || minimo > ideal)) {
      return setErro("A mínima reduzida deve ser um número inteiro, de 0 até o valor ideal.");
    }
    const { error } = await supabase().from("cobertura").insert({
      unidade_id: unidadeId,
      turno: novo.turno,
      funcao_id: novo.funcaoId,
      dia_semana: novo.dia === "" ? null : Number(novo.dia),
      ideal,
      minimo_reduzido: minimo,
    });
    if (error) return setErro(error.code === "23505" ? "Já existe uma linha para essa função, turno e dia." : error.message);
    setErro(null);
    setNovo(NOVO_VAZIO);
    setAviso("Linha adicionada.");
    await carregar();
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Cobertura</h1>
      <p className="text-neutral-700">
        <strong>Ideal</strong> é a quantidade desejada por posto. <strong>Mínima reduzida</strong> é o que a
        gerência aceita em dias mais fracos (em branco = igual ao ideal). Uma linha sem dia vale para todos os dias.
      </p>
      <SeletorUnidade unidades={unidades} valor={unidadeId} aoMudar={(id) => { setAviso(null); setUnidadeId(id); }} />
      {(erro || erroUnidades) && <p className="rounded-xl bg-red-50 p-3 text-red-700">{erro ?? erroUnidades}</p>}
      {aviso && <p className="rounded-xl bg-green-50 p-3 text-green-800">{aviso}</p>}

      {(["dia", "noite"] as const).map((turno) => (
        <section key={turno} className="space-y-3">
          <h2 className="text-xl font-semibold">Turno {ROTULO_TURNO[turno].toLowerCase()}</h2>
          {linhas.filter((l) => l.turno === turno).length === 0 && <p className="text-neutral-600">Nenhuma linha.</p>}
          {linhas
            .filter((l) => l.turno === turno)
            .sort((a, b) => (funcaoPorId.get(a.funcao_id)?.nome ?? "").localeCompare(funcaoPorId.get(b.funcao_id)?.nome ?? "") || (a.dia_semana ?? -1) - (b.dia_semana ?? -1))
            .map((l) => {
              const f = funcaoPorId.get(l.funcao_id);
              const pessoas = equipe[`${l.turno}|${l.funcao_id}`] ?? 0;
              const mudar = (campo: Partial<Cobertura>) =>
                setLinhas(linhas.map((x) => (x.id === l.id ? { ...x, ...campo } : x)));
              return (
                <div key={l.id} className="cartao space-y-3">
                  <div>
                    <p className="text-lg font-semibold">{f ? rotuloFuncao(f) : "—"}</p>
                    <p className="text-neutral-700">
                      {l.dia_semana === null ? "Todos os dias" : DIAS_SEMANA[l.dia_semana]} · equipe cadastrada: {pessoas}
                    </p>
                    {pessoas < l.ideal && <p className="text-sm text-red-700">Quadro menor que o ideal: faltam pessoas.</p>}
                    {pessoas === l.ideal && l.ideal > 0 && (
                      <p className="text-sm text-amber-700">Equipe igual ao ideal: qualquer folga ou ausência gera déficit.</p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="mb-1 block font-medium">Ideal</span>
                      <input className="campo" type="number" min={0} disabled={!podeEditar} value={l.ideal} onChange={(e) => mudar({ ideal: Math.max(0, Number(e.target.value) || 0) })} />
                    </label>
                    <label className="block">
                      <span className="mb-1 block font-medium">Mínima reduzida</span>
                      <input className="campo" type="number" min={0} disabled={!podeEditar} value={l.minimo_reduzido ?? ""} placeholder="= ideal" onChange={(e) => mudar({ minimo_reduzido: numeroOuNulo(e.target.value) })} />
                    </label>
                  </div>
                  {podeEditar && (
                    <div className="flex gap-2">
                      <button className="botao flex-1" onClick={() => salvar(l)}>Salvar</button>
                      <button className="botao-secundario flex-1" onClick={() => remover(l)}>Remover</button>
                    </div>
                  )}
                </div>
              );
            })}
        </section>
      ))}

      {podeEditar && (
        <form onSubmit={adicionar} className="cartao space-y-3">
          <h2 className="text-lg font-semibold">Adicionar linha</h2>
          <p className="text-sm text-neutral-600">Use para um dia específico (por exemplo, a mínima reduzida de segunda a quarta).</p>
          <label className="block">
            <span className="mb-1 block font-medium">Turno</span>
            <select className="campo" value={novo.turno} onChange={(e) => setNovo({ ...novo, turno: e.target.value as Turno2 })}>
              <option value="dia">Dia</option>
              <option value="noite">Noite</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block font-medium">Função</span>
            <select className="campo" value={novo.funcaoId} onChange={(e) => setNovo({ ...novo, funcaoId: e.target.value })}>
              <option value="">Escolha…</option>
              {funcoes.filter((f) => f.ativa).map((f) => (
                <option key={f.id} value={f.id}>{rotuloFuncao(f)}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block font-medium">Dia da semana</span>
            <select className="campo" value={novo.dia} onChange={(e) => setNovo({ ...novo, dia: e.target.value })}>
              <option value="">Todos os dias</option>
              {DIAS_SEMANA.map((d, i) => (
                <option key={d} value={i}>{d}</option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block font-medium">Ideal</span>
              <input className="campo" type="number" min={0} value={novo.ideal} onChange={(e) => setNovo({ ...novo, ideal: e.target.value })} />
            </label>
            <label className="block">
              <span className="mb-1 block font-medium">Mínima reduzida</span>
              <input className="campo" type="number" min={0} value={novo.minimo} placeholder="= ideal" onChange={(e) => setNovo({ ...novo, minimo: e.target.value })} />
            </label>
          </div>
          <button type="submit" className="botao w-full">Adicionar</button>
        </form>
      )}
    </div>
  );
}

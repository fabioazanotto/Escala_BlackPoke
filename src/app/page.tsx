"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Turno2 } from "@/lib/tipos";

type Resumo = { id: string; nome: string; dia: number; noite: number };

export default function Inicio() {
  const [resumo, setResumo] = useState<Resumo[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const db = supabase();
    Promise.all([
      db.from("unidades").select("id, nome").eq("ativa", true).order("nome"),
      db.from("colaboradores").select("unidade_id, turno").eq("ativo", true),
    ]).then(([u, c]) => {
      if (u.error || c.error) return setErro((u.error ?? c.error)!.message);
      setResumo(
        (u.data ?? []).map((x) => {
          const meus = (c.data ?? []).filter((y) => y.unidade_id === x.id);
          const conta = (t: Turno2) => meus.filter((y) => y.turno === t).length;
          return { id: x.id, nome: x.nome, dia: conta("dia"), noite: conta("noite") };
        }),
      );
    });
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Painel</h1>
      {erro && <p className="rounded-xl bg-red-50 p-3 text-red-700">{erro}</p>}
      {!resumo && !erro && <p className="text-neutral-600">Carregando…</p>}
      {resumo?.map((u) => (
        <section key={u.id} className="cartao">
          <h2 className="text-lg font-semibold">{u.nome}</h2>
          <p className="mt-1 text-neutral-700">
            {u.dia + u.noite} colaboradores ativos · {u.dia} no dia · {u.noite} na noite
          </p>
        </section>
      ))}
      {resumo && resumo.length === 0 && <p className="text-neutral-600">Nenhuma unidade disponível para o seu acesso.</p>}
    </div>
  );
}

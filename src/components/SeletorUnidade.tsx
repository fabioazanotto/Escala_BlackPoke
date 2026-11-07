"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Unidade } from "@/lib/tipos";

/** Carrega as unidades ativas do usuário e guarda qual está escolhida. */
export function useUnidades() {
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [unidadeId, setUnidadeId] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);

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
        setPronto(true);
      });
  }, []);

  return { unidades, unidadeId, setUnidadeId, erro, pronto };
}

export function SeletorUnidade({
  unidades,
  valor,
  aoMudar,
  filtro = false,
}: {
  unidades: Unidade[];
  valor: string;
  aoMudar: (id: string) => void;
  /** true = versão compacta para a linha do título, sem rótulo visível */
  filtro?: boolean;
}) {
  if (filtro) {
    return (
      <select aria-label="Unidade" className="filtro" value={valor} onChange={(e) => aoMudar(e.target.value)}>
        {unidades.map((u) => (
          <option key={u.id} value={u.id}>{u.nome}</option>
        ))}
      </select>
    );
  }
  return (
    <label className="block">
      <span className="mb-1 block font-medium">Unidade</span>
      <select className="campo" value={valor} onChange={(e) => aoMudar(e.target.value)}>
        {unidades.map((u) => (
          <option key={u.id} value={u.id}>{u.nome}</option>
        ))}
      </select>
    </label>
  );
}

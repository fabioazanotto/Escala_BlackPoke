"use client";

import { useEffect, useState } from "react";
import { Icone } from "@/components/Icones";
import { dataBR } from "@/lib/datas";
import { supabase } from "@/lib/supabase";
import type { Situacao } from "@/lib/escala/tipos";
import { CELULA } from "./rotulos";

type Linha = {
  id: string;
  colaborador_id: string;
  data: string;
  situacao_anterior: Situacao;
  situacao_nova: Situacao;
  travada_antes: boolean;
  travada_depois: boolean;
  motivo: string | null;
  usuario_nome: string | null;
  criado_em: string;
};

export function HistoricoEscala({ escalaId, nomes, aoFechar }: { escalaId: string; nomes: Map<string, string>; aoFechar: () => void }) {
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    supabase()
      .from("escala_alteracoes")
      .select("id, colaborador_id, data, situacao_anterior, situacao_nova, travada_antes, travada_depois, motivo, usuario_nome, criado_em")
      .eq("escala_id", escalaId)
      .order("criado_em", { ascending: false })
      .limit(100)
      .then(({ data, error }) => {
        if (error) setErro(`${error.message}. Se a tabela não existe, rode o SQL 06_historico_alteracoes.sql.`);
        else setLinhas(data as Linha[]);
      });
  }, [escalaId]);

  useEffect(() => {
    const fechar = (e: KeyboardEvent) => e.key === "Escape" && aoFechar();
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [aoFechar]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={aoFechar}>
      <div role="dialog" aria-modal="true" aria-label="Histórico de alterações" className="flex max-h-[88vh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:max-w-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
          <h2 className="text-lg font-semibold">Histórico de alterações</h2>
          <button aria-label="Fechar" className="rounded-lg p-1.5 hover:bg-neutral-100" onClick={aoFechar}><Icone nome="fechar" /></button>
        </div>
        <div className="overflow-y-auto p-5">
          {erro && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{erro}</p>}
          {!linhas && !erro && <p className="text-sm text-neutral-600">Carregando…</p>}
          {linhas && linhas.length === 0 && <p className="text-sm text-neutral-600">Nenhuma alteração manual neste mês.</p>}
          <ul className="space-y-3">
            {linhas?.map((l) => {
              const soTrava = l.situacao_anterior === l.situacao_nova;
              return (
                <li key={l.id} className="rounded-xl border border-neutral-200 p-3 text-sm">
                  <p className="font-semibold">{nomes.get(l.colaborador_id) ?? "Colaborador"} · {dataBR(l.data).slice(0, 5)}</p>
                  <p className="text-neutral-800">
                    {soTrava
                      ? `${l.travada_depois ? "Travou" : "Destravou"} a situação “${CELULA[l.situacao_nova].nome}”`
                      : <>{CELULA[l.situacao_anterior].nome} → <strong>{CELULA[l.situacao_nova].nome}</strong></>}
                  </p>
                  {l.motivo && <p className="text-neutral-700">Motivo: {l.motivo}</p>}
                  <p className="mt-1 text-xs text-neutral-500">
                    {l.usuario_nome ?? "Usuário"} · {new Date(l.criado_em).toLocaleString("pt-BR")}
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}

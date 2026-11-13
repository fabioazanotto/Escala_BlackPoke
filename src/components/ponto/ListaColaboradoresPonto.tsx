"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { chamar } from "@/components/ponto/chamar";
import { ATUALIZAR_A_CADA_S } from "@/config/ponto";
import type { PainelAoVivo } from "@/lib/ponto/aoVivoTipos";
import { montarGrupos, resumoDoGrupo, type ItemLista, type StatusLista } from "@/lib/ponto/lista";

const COR: Record<StatusLista, { classe: string; marca: string }> = {
  trabalhando: { classe: "bg-green-100 text-green-900", marca: "●" },
  intervalo: { classe: "bg-sky-100 text-sky-900", marca: "◐" },
  atrasado: { classe: "bg-amber-100 text-amber-900", marca: "▲" },
  ausente: { classe: "bg-red-100 text-red-900", marca: "✕" },
  justificado: { classe: "bg-violet-100 text-violet-900", marca: "✎" },
  fora: { classe: "bg-neutral-100 text-neutral-700", marca: "–" },
  sem_info: { classe: "bg-neutral-100 text-neutral-600", marca: "?" },
  desligado: { classe: "bg-neutral-200 text-neutral-600", marca: "×" },
};

function Selo({ status, texto, alerta }: { status: StatusLista; texto: string; alerta?: boolean }) {
  const c = alerta ? { classe: "bg-amber-100 text-amber-900", marca: "◐" } : COR[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${c.classe}`}>
      <span aria-hidden>{c.marca}</span>
      {texto}
    </span>
  );
}

export function ListaColaboradoresPonto({ funcionarios, onAbrir, erroLista }: { funcionarios: ItemLista[] | null; onAbrir: (id: number) => void; erroLista: string | null }) {
  const [painel, setPainel] = useState<PainelAoVivo | null>(null);
  const [erroPainel, setErroPainel] = useState<string | null>(null);
  const [lojaSel, setLojaSel] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [desligados, setDesligados] = useState(false);
  const [lido, setLido] = useState<string | null>(null);
  const emAndamento = useRef(false);

  const atualizar = useCallback(async () => {
    if (emAndamento.current) return;
    emAndamento.current = true;
    try {
      setPainel(await chamar<PainelAoVivo>("/api/ponto/ao-vivo"));
      setLido(new Date().toLocaleTimeString("pt-BR"));
      setErroPainel(null);
    } catch (e) {
      // Mantém o último painel: falha de comunicação nunca vira "ausência" de ninguém.
      setErroPainel((e as Error).message);
    }
    emAndamento.current = false;
  }, []);

  useEffect(() => {
    const primeira = setTimeout(() => void atualizar(), 0);
    const intervalo = setInterval(() => {
      if (document.visibilityState === "visible") void atualizar();
    }, ATUALIZAR_A_CADA_S * 1000);
    return () => {
      clearTimeout(primeira);
      clearInterval(intervalo);
    };
  }, [atualizar]);

  const lojas = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of funcionarios ?? []) if (f.lojaChave && f.ativo) m.set(f.lojaChave, f.loja);
    return [...m.entries()];
  }, [funcionarios]);

  const grupos = useMemo(() => montarGrupos(funcionarios ?? [], painel, { lojaChave: lojaSel, busca, desligados }), [funcionarios, painel, lojaSel, busca, desligados]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input type="search" className="campo max-w-xs" placeholder="Buscar pelo nome" aria-label="Buscar colaborador pelo nome" value={busca} onChange={(e) => setBusca(e.target.value)} />
        {lojas.length > 1 &&
          [{ chave: null as string | null, nome: "Todas" }, ...lojas.map(([chave, nome]) => ({ chave: chave as string | null, nome: nome.replace("BlackPoke ", "") }))].map((l) => (
            <button key={l.chave ?? "todas"} type="button" aria-pressed={lojaSel === l.chave} onClick={() => setLojaSel(l.chave)} className={`inline-flex h-10 items-center rounded-full border px-4 text-sm font-medium ${lojaSel === l.chave ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"}`}>
              {l.nome}
            </button>
          ))}
        <label className="ml-auto flex items-center gap-2 text-sm text-neutral-700">
          <input type="checkbox" className="h-5 w-5" checked={desligados} onChange={(e) => setDesligados(e.target.checked)} /> incluir desligados
        </label>
      </div>
      <p className="text-sm text-neutral-600">
        Situação agora, pelo ponto de hoje{painel ? ` (dia de trabalho ${painel.diaDeTrabalho.split("-").reverse().join("/")}, agora ${painel.horaAgora}${lido ? `, atualizado às ${lido}` : ""})` : ""}. Toque em um nome para abrir o mês.
      </p>

      {erroLista && <p className="rounded-xl bg-red-50 p-3 text-red-700">{erroLista}</p>}
      {erroPainel && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          Não consegui ler o ponto de hoje agora ({erroPainel}). {painel ? "Mostrando a última leitura. " : "As situações aparecem como “Sem informação”. "}Falta de dados não significa falta do colaborador.
        </p>
      )}
      {!funcionarios && !erroLista && <p className="text-neutral-600">Carregando colaboradores…</p>}
      {funcionarios && grupos.length === 0 && <p className="text-neutral-600">Nenhum colaborador encontrado com esse filtro.</p>}

      {grupos.map((g) => {
        const resumo = resumoDoGrupo(g.itens.map((i) => i.situacao));
        return (
          <section key={g.chave} className="cartao !p-0 overflow-hidden">
            <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-neutral-200 bg-neutral-50 px-4 py-3">
              <h2 className="text-base font-semibold">
                {g.titulo} <span className="font-normal text-neutral-500">· {g.itens.length}</span>
              </h2>
              <ul className="flex flex-wrap gap-1.5">
                {resumo.map((r) => (
                  <li key={r.status}>
                    <Selo status={r.status} texto={r.texto} />
                  </li>
                ))}
              </ul>
            </header>
            <ul className="divide-y divide-neutral-100">
              {g.itens.map((f) => (
                <li key={f.id}>
                  <button type="button" onClick={() => onAbrir(f.id)} className="grid w-full grid-cols-1 gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-neutral-50 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.5fr)_12.5rem_10rem] md:items-center">
                    <span className="font-medium">{f.nome}</span>
                    <span className="min-w-0">
                      <Selo status={f.situacao.status} texto={f.situacao.rotulo} alerta={f.situacao.alerta} />
                      {f.situacao.detalhe && <span className="mt-0.5 block text-xs text-neutral-600">{f.situacao.detalhe}</span>}
                    </span>
                    <span className="text-sm tabular-nums text-neutral-600">{f.situacao.previsto ? `Previsto ${f.situacao.previsto}` : ""}</span>
                    <span className="text-sm tabular-nums text-neutral-700">{f.situacao.ultimaBatida ?? ""}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

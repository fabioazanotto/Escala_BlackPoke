"use client";

import type { CanalVenda } from "@/lib/tipos";
import { CANAIS, ROTULO_CANAL, ROTULO_TIPO_PERIODO, type TipoPeriodo } from "@/lib/vendas/consulta";
import { COR_CANAL } from "./rotulosCanal";

const TIPOS: TipoPeriodo[] = ["ontem", "hoje", "7dias", "30dias", "mes", "mesPassado", "ano", "personalizado"];

export function SeletorPeriodo({ tipo, de, ate, hoje, aoMudarTipo, aoMudarDatas }: { tipo: TipoPeriodo; de: string; ate: string; hoje: string; aoMudarTipo: (t: TipoPeriodo) => void; aoMudarDatas: (de: string, ate: string) => void }) {
  return (
    <>
      <select className="filtro" value={tipo} onChange={(e) => aoMudarTipo(e.target.value as TipoPeriodo)} aria-label="Período">
        {TIPOS.map((t) => (
          <option key={t} value={t}>
            {ROTULO_TIPO_PERIODO[t]}
          </option>
        ))}
      </select>
      {tipo === "personalizado" && (
        <>
          <input type="date" className="filtro" value={de} max={hoje} aria-label="Data inicial" onChange={(e) => e.target.value && aoMudarDatas(e.target.value, e.target.value > ate ? e.target.value : ate)} />
          <span className="text-sm text-neutral-500">até</span>
          <input type="date" className="filtro" value={ate} min={de} max={hoje} aria-label="Data final" onChange={(e) => e.target.value && aoMudarDatas(e.target.value < de ? e.target.value : de, e.target.value)} />
        </>
      )}
    </>
  );
}

function Ficha({ ativa, aoAlternar, children, cor }: { ativa: boolean; aoAlternar: () => void; children: React.ReactNode; cor?: string }) {
  return (
    <button
      type="button"
      aria-pressed={ativa}
      onClick={aoAlternar}
      className={`inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors ${ativa ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"}`}
    >
      {cor && <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: cor, outline: ativa ? "1.5px solid white" : undefined }} />}
      {children}
    </button>
  );
}

/** Escolha de lojas e de canais. Sempre fica pelo menos uma marcada. */
export function FiltrosLojasCanais({ lojas, lojasSel, aoMudarLojas, canaisSel, aoMudarCanais }: { lojas: { chave: string; nome: string }[]; lojasSel: string[]; aoMudarLojas: (v: string[]) => void; canaisSel: CanalVenda[]; aoMudarCanais: (v: CanalVenda[]) => void }) {
  const alternar = <T,>(lista: T[], item: T): T[] => (lista.includes(item) ? (lista.length > 1 ? lista.filter((x) => x !== item) : lista) : [...lista, item]);
  return (
    <div className="mb-5 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-sm text-neutral-600">Lojas</span>
        {lojas.map((l) => (
          <Ficha key={l.chave} ativa={lojasSel.includes(l.chave)} aoAlternar={() => aoMudarLojas(alternar(lojasSel, l.chave))}>
            {l.nome.replace("BlackPoke ", "")}
          </Ficha>
        ))}
        {lojasSel.length < lojas.length && (
          <button className="text-sm underline underline-offset-2" onClick={() => aoMudarLojas(lojas.map((l) => l.chave))}>
            todas
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-sm text-neutral-600">Canais</span>
        {CANAIS.filter((c) => c !== "outros").map((c) => (
          <Ficha key={c} ativa={canaisSel.includes(c)} cor={COR_CANAL[c]} aoAlternar={() => aoMudarCanais(alternar(canaisSel, c))}>
            {ROTULO_CANAL[c]}
          </Ficha>
        ))}
      </div>
    </div>
  );
}

"use client";

import { useEffect } from "react";
import { Icone } from "@/components/Icones";
import { DIAS_SEMANA, dataBR, paraData } from "@/lib/datas";
import { ROTULO_TURNO } from "@/lib/funcoes";
import { sugerirAjustes } from "@/lib/escala/motor";
import type { EntradaMotor, ResultadoMotor } from "@/lib/escala/tipos";
import { CELULA, ROTULO_ESTADO } from "./rotulos";

export function PainelDia({
  data,
  entrada,
  resultado,
  travados,
  funcaoNome,
  nomes,
  podeEditar,
  aoEditar,
  aoFechar,
}: {
  data: string;
  entrada: EntradaMotor;
  resultado: ResultadoMotor;
  travados: Set<string>;
  funcaoNome: (id: string) => string;
  nomes: Map<string, string>;
  podeEditar: boolean;
  aoEditar: (colaboradorId: string) => void;
  aoFechar: () => void;
}) {
  useEffect(() => {
    const fechar = (e: KeyboardEvent) => e.key === "Escape" && aoFechar();
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [aoFechar]);

  const slots = resultado.cobertura.filter((x) => x.data === data);
  const dow = paraData(data).getDay();
  const ordenados = [...entrada.colaboradores].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  return (
    <aside role="complementary" aria-label="Detalhes do dia" className="fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l border-neutral-200 bg-white shadow-2xl sm:w-[400px]">
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-neutral-200 px-5">
        <div>
          <h2 className="text-base font-semibold">{DIAS_SEMANA[dow]}, {dataBR(data)}</h2>
          {resultado.feriados.includes(data) && <p className="text-xs text-amber-800">Feriado</p>}
          {resultado.fechados.includes(data) && <p className="text-xs text-neutral-700">Unidade sem funcionamento neste dia</p>}
        </div>
        <button aria-label="Fechar detalhes do dia" className="rounded-lg p-1.5 hover:bg-neutral-100" onClick={aoFechar}>
          <Icone nome="fechar" />
        </button>
      </div>
      <div className="flex-1 space-y-6 overflow-y-auto p-5">
        <section>
          <h3 className="mb-2 text-sm font-semibold text-neutral-700">Cobertura</h3>
          {slots.length === 0 && (
            <p className="text-sm text-neutral-600">
              {resultado.fechados.includes(data) ? "Unidade sem funcionamento: não se cobra cobertura." : "Nenhuma exigência de cobertura para este dia."}
            </p>
          )}
          <ul className="space-y-2">
            {slots.map((s) => {
              const ajustes = s.estado === "completa" ? [] : sugerirAjustes(entrada, resultado, s.data, s.turno, s.funcaoId);
              return (
                <li key={`${s.turno}${s.funcaoId}`} className="rounded-xl border border-neutral-200 p-3 text-sm">
                  <p className="font-semibold">{ROTULO_TURNO[s.turno]} · {funcaoNome(s.funcaoId)}</p>
                  <p className={`flex items-center gap-1.5 ${s.estado === "deficit" ? "text-red-700" : s.estado === "reduzida" ? "text-amber-800" : "text-green-800"}`}>
                    <Icone nome={s.estado === "completa" ? "ok" : "alerta"} tamanho={15} />
                    {s.presentes} de {s.ideal} · {ROTULO_ESTADO[s.estado]}
                    {s.estado !== "completa" && <span className="text-neutral-600"> (mínimo aceito: {s.minimo})</span>}
                  </p>
                  {ajustes.length > 0 && (
                    <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-xs text-neutral-700">
                      {ajustes.map((a, i) => <li key={i}>{a.descricao}</li>)}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {(["dia", "noite"] as const).map((turno) => {
          const lista = ordenados.filter((c) => c.turno === turno);
          if (lista.length === 0) return null;
          return (
            <section key={turno}>
              <h3 className="mb-2 text-sm font-semibold text-neutral-700">Equipe · turno {ROTULO_TURNO[turno].toLowerCase()}</h3>
              <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200">
                {lista.map((c) => {
                  const s = resultado.celulas[c.id]?.[data] ?? "trabalha";
                  const trava = travados.has(`${c.id}|${data}`);
                  return (
                    <li key={c.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{nomes.get(c.id)}</p>
                        <p className="truncate text-xs text-neutral-600">{funcaoNome(c.funcaoPrincipalId)}</p>
                      </div>
                      <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs ${CELULA[s].classe} ${s === "trabalha" ? "border border-neutral-200 font-normal" : ""}`}>
                        {CELULA[s].nome}
                        {trava && <Icone nome="cadeado" tamanho={11} />}
                      </span>
                      {podeEditar && <button className="botao-secundario !px-3 !py-1.5 !text-xs" onClick={() => aoEditar(c.id)}>Alterar</button>}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </aside>
  );
}

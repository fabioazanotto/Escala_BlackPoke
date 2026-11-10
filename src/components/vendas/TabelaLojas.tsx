"use client";

import { Fragment, useState } from "react";
import { CANAIS, ROTULO_CANAL, ROTULO_PERIODO, agruparPor, somar, type LinhaVenda, type Totais } from "@/lib/vendas/consulta";
import { brl, num } from "@/lib/vendas/formatar";
import { COR_CANAL } from "./rotulosCanal";

const TURNOS: LinhaVenda["periodo"][] = ["manha", "tarde", "noite", "indefinido"];

function Celulas({ t }: { t: Totais }) {
  return (
    <>
      <td className="px-3 py-2 text-right">{num(t.pedidos)}</td>
      <td className="px-3 py-2 text-right">{brl(t.bruto)}</td>
      <td className="px-3 py-2 text-right">{t.descontos > 0 ? `− ${brl(t.descontos)}` : brl(0)}</td>
      <td className="px-3 py-2 text-right">{brl(t.taxaEntrega)}</td>
      <td className="px-3 py-2 text-right font-semibold">{brl(t.liquido)}</td>
      <td className="px-3 py-2 text-right">{brl(t.ticketMedio)}</td>
      <td className="px-3 py-2 text-right">{num(t.cancelados)}</td>
    </>
  );
}

/** Uma linha por loja, com total; toque na loja abre o detalhe por canal e por turno. */
export function TabelaLojas({ linhas, lojas }: { linhas: LinhaVenda[]; lojas: { chave: string; nome: string }[] }) {
  const [aberta, setAberta] = useState<string | null>(null);
  const porLoja = agruparPor(linhas, (l) => l.lojaChave);

  return (
    <div className="cartao">
      <h2 className="text-base font-semibold">Resultado por loja</h2>
      <p className="mt-0.5 text-xs text-neutral-500">Toque em uma loja para ver o detalhe por canal e por turno.</p>

      <div className="-mx-4 mt-3 overflow-x-auto lg:-mx-5">
        <table className="w-full min-w-[760px] text-sm tabular-nums">
          <thead className="text-left text-xs text-neutral-500">
            <tr className="border-b border-neutral-200">
              <th className="px-3 py-2 font-medium">Loja</th>
              <th className="px-3 py-2 text-right font-medium">Pedidos</th>
              <th className="px-3 py-2 text-right font-medium">Bruto</th>
              <th className="px-3 py-2 text-right font-medium">Descontos</th>
              <th className="px-3 py-2 text-right font-medium">Taxa de entrega</th>
              <th className="px-3 py-2 text-right font-medium">Faturamento</th>
              <th className="px-3 py-2 text-right font-medium">Ticket médio</th>
              <th className="px-3 py-2 text-right font-medium">Cancelados</th>
            </tr>
          </thead>
          <tbody>
            {lojas.map((loja) => {
              const ls = porLoja.get(loja.chave) ?? [];
              const t = somar(ls);
              const abre = aberta === loja.chave;
              const canais = CANAIS.filter((c) => ls.some((l) => l.canal === c));
              const turnos = TURNOS.filter((p) => ls.some((l) => l.periodo === p));
              return (
                <Fragment key={loja.chave}>
                  <tr className="cursor-pointer border-b border-neutral-100 hover:bg-neutral-50" onClick={() => setAberta(abre ? null : loja.chave)}>
                    <td className="whitespace-nowrap px-3 py-2 font-medium">
                      <button className="flex items-center gap-2 text-left" aria-expanded={abre} aria-label={`Detalhes de ${loja.nome}`}>
                        <span aria-hidden className={`inline-block text-neutral-400 transition-transform ${abre ? "rotate-90" : ""}`}>
                          ▸
                        </span>
                        {loja.nome.replace("BlackPoke ", "")}
                      </button>
                    </td>
                    <Celulas t={t} />
                  </tr>
                  {abre && (
                    <>
                      {canais.map((c) => (
                        <tr key={`c-${c}`} className="border-b border-neutral-100 bg-neutral-50 text-neutral-700">
                          <td className="whitespace-nowrap py-1.5 pl-9 pr-3">
                            <span className="flex items-center gap-2">
                              <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: COR_CANAL[c] }} />
                              {ROTULO_CANAL[c]}
                            </span>
                          </td>
                          <Celulas t={somar(ls.filter((l) => l.canal === c))} />
                        </tr>
                      ))}
                      {turnos.map((p) => (
                        <tr key={`p-${p}`} className="border-b border-neutral-100 bg-neutral-50 text-neutral-700">
                          <td className="whitespace-nowrap py-1.5 pl-9 pr-3">Turno: {ROTULO_PERIODO[p]}</td>
                          <Celulas t={somar(ls.filter((l) => l.periodo === p))} />
                        </tr>
                      ))}
                    </>
                  )}
                </Fragment>
              );
            })}
          </tbody>
          {lojas.length > 1 && (
            <tfoot>
              <tr className="border-t-2 border-neutral-300 font-semibold">
                <td className="whitespace-nowrap px-3 py-2">Todas as lojas</td>
                <Celulas t={somar(linhas)} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

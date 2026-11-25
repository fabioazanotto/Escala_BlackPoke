"use client";

import { Icone } from "@/components/Icones";
import { DIAS_SEMANA_CURTO, paraData } from "@/lib/datas";
import { ROTULO_TURNO } from "@/lib/funcoes";
import type { ColaboradorMotor, ResultadoMotor, Situacao } from "@/lib/escala/tipos";
import type { Transferido } from "@/lib/escala/carregar";
import { CELULA } from "./rotulos";

export function GradeEscala({
  dias,
  colaboradores,
  resultado,
  travados,
  funcaoRotulo,
  diaSelecionado,
  aoClicarCelula,
  aoClicarDia,
  transferidos = [],
}: {
  dias: string[];
  colaboradores: ColaboradorMotor[];
  resultado: ResultadoMotor;
  travados: Set<string>;
  funcaoRotulo: (id: string) => string;
  diaSelecionado: string | null;
  aoClicarCelula: (colaboradorId: string, data: string) => void;
  aoClicarDia: (data: string) => void;
  transferidos?: Transferido[];
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
      <table className="border-collapse text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 z-[1] min-w-36 border-b bg-white p-2 text-left">Colaborador</th>
            {dias.map((d) => {
              const dow = paraData(d).getDay();
              return (
                <th
                  key={d}
                  className={`border-b p-0 text-center ${dow === 0 ? "bg-purple-50" : ""} ${resultado.feriados.includes(d) ? "bg-amber-100" : ""} ${resultado.fechados.includes(d) ? "bg-neutral-300" : ""} ${diaSelecionado === d ? "outline outline-2 -outline-offset-2 outline-neutral-900" : ""}`}
                >
                  <button
                    className="w-full px-1 py-1.5 hover:bg-neutral-100"
                    onClick={() => aoClicarDia(d)}
                    aria-label={`Abrir o dia ${d.slice(8)}`}
                  >
                    <div>{DIAS_SEMANA_CURTO[dow].slice(0, 1)}</div>
                    <div>{d.slice(8)}</div>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {(["dia", "noite"] as const).map((turno) => {
            const lista = colaboradores.filter((c) => c.turno === turno);
            if (lista.length === 0) return null;
            return [
              <tr key={`t-${turno}`}>
                <td colSpan={dias.length + 1} className="bg-neutral-100 p-2 font-semibold">
                  Turno {ROTULO_TURNO[turno].toLowerCase()}
                </td>
              </tr>,
              ...lista.map((c) => (
                <tr key={c.id}>
                  <td className="sticky left-0 z-[1] whitespace-nowrap border-b bg-white p-2">
                    {c.nome}
                    <div className="text-neutral-500">{funcaoRotulo(c.funcaoPrincipalId)}</div>
                  </td>
                  {dias.map((d) => {
                    const s: Situacao = resultado.celulas[c.id]?.[d] ?? "trabalha";
                    const trava = travados.has(`${c.id}|${d}`);
                    return (
                      <td key={d} className={`border-b border-l p-0 ${CELULA[s].classe}`}>
                        <button
                          className="relative flex h-9 w-full min-w-7 items-center justify-center hover:brightness-95"
                          onClick={() => aoClicarCelula(c.id, d)}
                          aria-label={`${c.nome}, dia ${d.slice(8)}: ${CELULA[s].nome}${trava ? ", travada" : ""}`}
                        >
                          {CELULA[s].letra}
                          {trava && <Icone nome="cadeado" tamanho={9} className="absolute right-0.5 top-0.5 text-neutral-700" />}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              )),
            ];
          })}
          {transferidos.length > 0 && [
            <tr key="t-transferidos">
              <td colSpan={dias.length + 1} className="bg-neutral-100 p-2 font-semibold">
                Transferidos (só consulta)
              </td>
            </tr>,
            ...transferidos.map((t) => (
              <tr key={t.id}>
                <td className="sticky left-0 z-[1] whitespace-nowrap border-b bg-white p-2">
                  {t.nome}
                  <div className="text-neutral-500">{t.etiqueta}</div>
                </td>
                {dias.map((d) => {
                  const s = t.celulas[d];
                  return (
                    <td key={d} className={`border-b border-l p-0 ${s ? CELULA[s].classe : "bg-neutral-50"}`}>
                      <div className="flex h-9 w-full min-w-7 items-center justify-center opacity-70">{s ? CELULA[s].letra : ""}</div>
                    </td>
                  );
                })}
              </tr>
            )),
          ]}
        </tbody>
      </table>
    </div>
  );
}

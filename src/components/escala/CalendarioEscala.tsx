"use client";

import { Icone } from "@/components/Icones";
import { dataBR, paraData } from "@/lib/datas";
import type { ResultadoMotor } from "@/lib/escala/tipos";

const SEMANA = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

function primeiroNome(nome: string) {
  return nome.split(" ")[0];
}

export function CalendarioEscala({
  dias,
  resultado,
  nomes,
  filtro,
  diaSelecionado,
  aoClicarDia,
}: {
  dias: string[];
  resultado: ResultadoMotor;
  nomes: Map<string, string>;
  filtro: Set<string> | null; // null = todos
  diaSelecionado: string | null;
  aoClicarDia: (data: string) => void;
}) {
  const deslocamento = (paraData(dias[0]).getDay() + 6) % 7; // semana começa na segunda
  const ids = Object.keys(resultado.celulas).filter((id) => !filtro || filtro.has(id));

  const resumoDoDia = (d: string) => {
    let faltando = 0;
    let reduzida = 0;
    for (const x of resultado.cobertura) {
      if (x.data !== d) continue;
      faltando += Math.max(0, x.minimo - x.presentes);
      reduzida += Math.max(0, x.ideal - Math.max(x.presentes, x.minimo));
    }
    const nomesDe = (situacao: string) =>
      ids.filter((id) => resultado.celulas[id][d] === situacao).map((id) => primeiroNome(nomes.get(id) ?? "?"));
    const ausentes = ids.filter((id) => ["ferias", "afastamento", "indisponibilidade"].includes(resultado.celulas[id][d])).length;
    const trabalham = Object.keys(resultado.celulas).filter((id) => resultado.celulas[id][d] === "trabalha").length;
    return { faltando, reduzida, folgas: nomesDe("folga"), domingos: nomesDe("domingo"), ausentes, trabalham };
  };

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[720px]">
        <div className="grid grid-cols-7 gap-px rounded-t-xl border border-b-0 border-neutral-200 bg-neutral-200 text-center text-xs font-semibold text-neutral-600">
          {SEMANA.map((s) => (
            <div key={s} className="bg-neutral-50 py-2">{s}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px rounded-b-xl border border-neutral-200 bg-neutral-200">
          {Array.from({ length: deslocamento }, (_, i) => (
            <div key={`v${i}`} className="min-h-28 bg-neutral-50" />
          ))}
          {dias.map((d) => {
            const r = resumoDoDia(d);
            const estado = r.faltando > 0 ? "deficit" : r.reduzida > 0 ? "reduzida" : "completa";
            const feriado = resultado.feriados.includes(d);
            const selecionado = diaSelecionado === d;
            return (
              <button
                key={d}
                onClick={() => aoClicarDia(d)}
                aria-label={`${dataBR(d)}: ${estado === "deficit" ? `${r.faltando} pessoa(s) faltando` : estado === "reduzida" ? "cobertura reduzida autorizada" : "cobertura completa"}`}
                className={`flex min-h-28 flex-col gap-1 bg-white p-2 text-left text-xs hover:bg-neutral-50 ${selecionado ? "outline outline-2 -outline-offset-2 outline-neutral-900" : ""}`}
              >
                <span className="flex items-center justify-between">
                  <span className={`text-sm font-semibold ${paraData(d).getDay() === 0 ? "text-purple-800" : ""}`}>{d.slice(8)}</span>
                  {feriado && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900">feriado</span>}
                </span>
                <span className="flex items-center gap-1.5 font-medium">
                  {estado === "deficit" && (
                    <>
                      <span aria-hidden="true" className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: "var(--viz-deficit)" }} />
                      Falta {r.faltando}
                    </>
                  )}
                  {estado === "reduzida" && (
                    <>
                      <span aria-hidden="true" className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: "var(--viz-reduzida)" }} />
                      Reduzida
                    </>
                  )}
                  {estado === "completa" && (
                    <>
                      <Icone nome="ok" tamanho={13} className="text-green-700" />
                      Completa
                    </>
                  )}
                </span>
                {r.folgas.length > 0 && <span className="text-neutral-700"><strong>Folga:</strong> {r.folgas.join(", ")}</span>}
                {r.domingos.length > 0 && <span className="text-purple-900"><strong>Domingo:</strong> {r.domingos.join(", ")}</span>}
                {r.ausentes > 0 && <span className="text-neutral-600">{r.ausentes} ausente(s)</span>}
                <span className="mt-auto text-neutral-500">{r.trabalham} trabalham</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

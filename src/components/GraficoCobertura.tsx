"use client";

import { useState } from "react";
import { DIAS_SEMANA_CURTO, dataBR, paraData } from "@/lib/datas";

export type PontoCobertura = { data: string; deficit: number; reduzida: number };

// Geometria do gráfico (unidades do viewBox).
const L = 720;
const A = 250;
const M = { esq: 34, dir: 8, topo: 12, base: 38 };
const W = L - M.esq - M.dir;
const H = A - M.topo - M.base;

/** Coluna com o topo arredondado (4px) e a base reta, como pede o guia de gráficos. */
function colunaArredondada(x: number, y: number, w: number, h: number, arredondar: boolean): string {
  const r = arredondar ? Math.min(4, h, w / 2) : 0;
  if (r === 0) return `M${x},${y}H${x + w}V${y + h}H${x}Z`;
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/** Pessoas faltando por dia: déficit (abaixo do mínimo aceito) e cobertura reduzida autorizada. */
export function GraficoCobertura({ pontos, feriados }: { pontos: PontoCobertura[]; feriados: string[] }) {
  const [foco, setFoco] = useState<number | null>(null);
  const [tabela, setTabela] = useState(false);

  const maior = Math.max(0, ...pontos.map((p) => p.deficit + p.reduzida));
  const topo = Math.max(2, Math.ceil(maior / 2) * 2);
  const ticks = [0, topo / 2, topo];
  const passo = W / Math.max(1, pontos.length);
  const larg = Math.max(4, Math.min(18, passo - 6));
  const yBase = M.topo + H;
  const y = (v: number) => M.topo + H - (v / topo) * H;
  const rotuloDia = (d: string) => `${DIAS_SEMANA_CURTO[paraData(d).getDay()]} ${dataBR(d).slice(0, 5)}`;

  const ativo = foco !== null ? pontos[foco] : null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <ul className="flex flex-wrap items-center gap-4 text-sm text-neutral-700">
          <li className="flex items-center gap-2">
            <span aria-hidden="true" className="inline-block h-3 w-3 rounded-sm" style={{ background: "var(--viz-deficit)" }} />
            Pessoas faltando (déficit)
          </li>
          <li className="flex items-center gap-2">
            <span aria-hidden="true" className="inline-block h-3 w-3 rounded-sm" style={{ background: "var(--viz-reduzida)" }} />
            Cobertura reduzida autorizada
          </li>
        </ul>
        <button className="botao-secundario !px-3 !py-1.5 !text-sm" onClick={() => setTabela(!tabela)}>
          {tabela ? "Ver gráfico" : "Ver tabela"}
        </button>
      </div>

      {tabela ? (
        <div className="max-h-[250px] overflow-auto rounded-lg border border-neutral-200">
          <table className="w-full text-sm">
            <caption className="sr-only">Pessoas faltando por dia</caption>
            <thead className="sticky top-0 bg-neutral-50 text-left">
              <tr>
                <th className="px-3 py-2 font-semibold">Dia</th>
                <th className="px-3 py-2 text-right font-semibold">Déficit</th>
                <th className="px-3 py-2 text-right font-semibold">Reduzida</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {pontos.map((p) => (
                <tr key={p.data} className="border-t border-neutral-100">
                  <td className="px-3 py-1.5">{rotuloDia(p.data)}{feriados.includes(p.data) ? " · feriado" : ""}</td>
                  <td className="px-3 py-1.5 text-right">{p.deficit}</td>
                  <td className="px-3 py-1.5 text-right">{p.reduzida}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${L} ${A}`} className="h-auto w-full" role="img" aria-label="Pessoas faltando por dia do mês">
            {/* domingos em faixa discreta */}
            {pontos.map((p, i) =>
              paraData(p.data).getDay() === 0 ? (
                <rect key={`f${p.data}`} x={M.esq + passo * i} y={M.topo} width={passo} height={H} fill="var(--viz-faixa)" />
              ) : null,
            )}
            {ticks.map((t) => (
              <g key={t}>
                <line x1={M.esq} x2={L - M.dir} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--viz-eixo)" : "var(--viz-grade)"} strokeWidth={1} />
                <text x={M.esq - 6} y={y(t) + 3.5} textAnchor="end" fontSize={11} fill="var(--viz-rotulo)">{t}</text>
              </g>
            ))}
            {pontos.map((p, i) => {
              const cx = M.esq + passo * (i + 0.5);
              const x0 = cx - larg / 2;
              const hd = (p.deficit / topo) * H;
              const hr = (p.reduzida / topo) * H;
              const domingo = paraData(p.data).getDay() === 0;
              return (
                <g key={p.data}>
                  {hd > 0 && <path d={colunaArredondada(x0, yBase - hd, larg, hd, hr <= 0)} fill="var(--viz-deficit)" />}
                  {hr > 0 && (
                    <path d={colunaArredondada(x0, yBase - hd - hr, larg, Math.max(1, hr - (hd > 0 ? 2 : 0)), true)} fill="var(--viz-reduzida)" />
                  )}
                  <text x={cx} y={A - 20} textAnchor="middle" fontSize={10.5} fill={domingo ? "var(--viz-texto)" : "var(--viz-rotulo)"} fontWeight={domingo ? 700 : 400}>
                    {p.data.slice(8)}
                  </text>
                  <text x={cx} y={A - 7} textAnchor="middle" fontSize={9.5} fill="var(--viz-rotulo)">
                    {DIAS_SEMANA_CURTO[paraData(p.data).getDay()].slice(0, 1)}
                  </text>
                  <rect
                    x={M.esq + passo * i}
                    y={M.topo}
                    width={passo}
                    height={H + 20}
                    fill="transparent"
                    tabIndex={0}
                    role="img"
                    aria-label={`${rotuloDia(p.data)}: ${p.deficit} faltando, ${p.reduzida} em cobertura reduzida`}
                    onMouseEnter={() => setFoco(i)}
                    onMouseLeave={() => setFoco(null)}
                    onFocus={() => setFoco(i)}
                    onBlur={() => setFoco(null)}
                  />
                </g>
              );
            })}
          </svg>
          {ativo && foco !== null && (
            <div
              className="pointer-events-none absolute top-0 z-10 w-44 -translate-x-1/2 rounded-lg border border-neutral-200 bg-white p-2.5 text-xs shadow-lg"
              style={{ left: `${Math.min(88, Math.max(12, ((M.esq + passo * (foco + 0.5)) / L) * 100))}%` }}
            >
              <p className="font-semibold">{rotuloDia(ativo.data)}{feriados.includes(ativo.data) ? " · feriado" : ""}</p>
              <p className="mt-1 flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "var(--viz-deficit)" }} />Déficit</span>
                <span className="tabular-nums">{ativo.deficit}</span>
              </p>
              <p className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "var(--viz-reduzida)" }} />Reduzida</span>
                <span className="tabular-nums">{ativo.reduzida}</span>
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import type { CanalVenda } from "@/lib/tipos";
import { CANAIS, ROTULO_CANAL, ROTULO_PERIODO, serieDoPeriodo, somar, type LinhaVenda, type PontoSerie } from "@/lib/vendas/consulta";
import { brl, brlCurto, diaCurto, mesCurto, num } from "@/lib/vendas/formatar";
import { COR_CANAL } from "./rotulosCanal";

type Categoria = { chave: string; rotulo: string; porCanal: Record<CanalVenda, number>; total: number; pedidos: number };

const vazio = (): Record<CanalVenda, number> => ({ xmenu: 0, ifood: 0, balcao: 0, outros: 0 });

/** Topo de coluna arredondado em 4px e base reta (parte de baixo da pilha encosta na linha de base). */
function colunaArredondada(x: number, y: number, w: number, h: number, arredondar: boolean): string {
  const r = arredondar ? Math.min(4, h, w / 2) : 0;
  if (r === 0) return `M${x},${y}H${x + w}V${y + h}H${x}Z`;
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/** Barra horizontal: ponta da direita arredondada em 4px, base (esquerda) reta. */
function barraArredondada(x: number, y: number, w: number, h: number, arredondar: boolean): string {
  const r = arredondar ? Math.min(4, w, h / 2) : 0;
  if (r === 0) return `M${x},${y}H${x + w}V${y + h}H${x}Z`;
  return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`;
}

/** Degraus redondos para o eixo: 0, 1k, 2k... */
function eixoBonito(maior: number): { topo: number; marcas: number[] } {
  if (maior <= 0) return { topo: 100, marcas: [0, 50, 100] };
  const bruto = maior / 3;
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * potencia).find((p) => p >= bruto) ?? 10 * potencia;
  const n = Math.ceil(maior / passo);
  return { topo: n * passo, marcas: Array.from({ length: n + 1 }, (_, i) => i * passo) };
}

function Dica({ titulo, cat, canais }: { titulo: string; cat: Categoria; canais: CanalVenda[] }) {
  return (
    <div className="pointer-events-none rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-neutral-900">{titulo}</p>
      <ul className="space-y-0.5">
        {canais
          .filter((c) => cat.porCanal[c] > 0)
          .map((c) => (
            <li key={c} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-neutral-600">
                <span aria-hidden className="inline-block h-[3px] w-3 rounded-full" style={{ background: COR_CANAL[c] }} />
                {ROTULO_CANAL[c]}
              </span>
              <span className="font-semibold tabular-nums text-neutral-900">{brl(cat.porCanal[c])}</span>
            </li>
          ))}
      </ul>
      <p className="mt-1 flex justify-between gap-4 border-t border-neutral-200 pt-1">
        <span className="text-neutral-600">Total · {num(cat.pedidos)} pedidos</span>
        <span className="font-semibold tabular-nums text-neutral-900">{brl(cat.total)}</span>
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- colunas (vários dias)

const L = 720;
const A = 260;
const M = { esq: 62, dir: 8, topo: 12, base: 28 };
const W = L - M.esq - M.dir;
const H = A - M.topo - M.base;

function Colunas({ pontos, granularidade, canais }: { pontos: PontoSerie[]; granularidade: "dia" | "mes"; canais: CanalVenda[] }) {
  const [foco, setFoco] = useState<number | null>(null);
  const eixo = eixoBonito(Math.max(0, ...pontos.map((p) => p.total)));
  const passo = W / Math.max(1, pontos.length);
  const larg = Math.max(3, Math.min(24, passo - 4));
  const yBase = M.topo + H;
  const y = (v: number) => M.topo + H - (v / eixo.topo) * H;
  const rotuloX = (p: PontoSerie) => (granularidade === "dia" ? p.chave.slice(8, 10) + "/" + p.chave.slice(5, 7) : mesCurto(p.chave));
  const cada = Math.max(1, Math.ceil(pontos.length / 12));
  const ativo = foco !== null ? pontos[foco] : null;
  const xCentro = (i: number) => M.esq + passo * (i + 0.5);

  return (
    <div className="overflow-x-auto">
    <div className="relative min-w-[560px]">
      <svg viewBox={`0 0 ${L} ${A}`} className="w-full" role="img" aria-label="Faturamento por período, empilhado por canal" onPointerLeave={() => setFoco(null)}>
        {eixo.marcas.map((t) => (
          <g key={t}>
            <line x1={M.esq} x2={L - M.dir} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--viz-eixo)" : "var(--viz-grade)"} strokeWidth={1} />
            <text x={M.esq - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--viz-rotulo)">
              {brlCurto(t)}
            </text>
          </g>
        ))}

        {pontos.map((p, i) => {
          const cx = xCentro(i);
          const x = cx - larg / 2;
          const visiveis = canais.filter((c) => p.porCanal[c] > 0);
          let acumulado = 0;
          return (
            <g key={p.chave}>
              {foco === i && <rect x={cx - passo / 2} y={M.topo} width={passo} height={H} fill="var(--viz-faixa)" />}
              {visiveis.map((c, k) => {
                const v0 = acumulado;
                acumulado += p.porCanal[c];
                const topo = y(acumulado);
                // 2px de respiro entre os segmentos da pilha (o de baixo encosta na linha de base).
                const base = k === 0 ? y(v0) : y(v0) - 1;
                const altura = base - topo - (k === visiveis.length - 1 ? 0 : 1);
                if (altura <= 0.5) return null;
                return <path key={c} d={colunaArredondada(x, topo, larg, altura, k === visiveis.length - 1)} fill={COR_CANAL[c]} />;
              })}
              {/* área de toque maior que a coluna */}
              <rect
                x={cx - passo / 2}
                y={M.topo}
                width={passo}
                height={H + M.base}
                fill="transparent"
                tabIndex={0}
                role="img"
                aria-label={`${granularidade === "dia" ? diaCurto(p.chave) : mesCurto(p.chave)}: ${brl(p.total)}`}
                onPointerEnter={() => setFoco(i)}
                onPointerDown={() => setFoco(i)}
                onFocus={() => setFoco(i)}
                onBlur={() => setFoco(null)}
              />
              {i % cada === 0 && (
                <text x={cx} y={yBase + 16} textAnchor="middle" fontSize={11} fill="var(--viz-rotulo)">
                  {rotuloX(p)}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {ativo && foco !== null && (
        <div className="absolute top-0 z-10" style={{ left: `${(xCentro(foco) / L) * 100}%`, transform: `translateX(${foco > pontos.length / 2 ? "-105%" : "5%"})` }}>
          <Dica titulo={granularidade === "dia" ? diaCurto(ativo.chave) : mesCurto(ativo.chave)} cat={ativo} canais={canais} />
        </div>
      )}
    </div>
    </div>
  );
}

// ---------------------------------------------------------------- barras (um dia só)

function Barras({ categorias, canais }: { categorias: Categoria[]; canais: CanalVenda[] }) {
  const [foco, setFoco] = useState<number | null>(null);
  const eixo = eixoBonito(Math.max(0, ...categorias.map((c) => c.total)));
  const linha = 44;
  const alt = categorias.length * linha + 30;
  const m = { esq: 118, dir: 96, topo: 4 };
  const w = 720 - m.esq - m.dir;
  const x = (v: number) => m.esq + (v / eixo.topo) * w;
  const ativo = foco !== null ? categorias[foco] : null;

  return (
    <div className="overflow-x-auto">
    <div className="relative min-w-[520px]">
      <svg viewBox={`0 0 720 ${alt}`} className="w-full" role="img" aria-label="Faturamento empilhado por canal" onPointerLeave={() => setFoco(null)}>
        {eixo.marcas.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={m.topo} y2={alt - 24} stroke={t === 0 ? "var(--viz-eixo)" : "var(--viz-grade)"} strokeWidth={1} />
            <text x={x(t)} y={alt - 8} textAnchor="middle" fontSize={11} fill="var(--viz-rotulo)">
              {brlCurto(t)}
            </text>
          </g>
        ))}
        {categorias.map((c, i) => {
          const topoLinha = m.topo + i * linha;
          const yBarra = topoLinha + (linha - 22) / 2;
          const visiveis = canais.filter((k) => c.porCanal[k] > 0);
          let acumulado = 0;
          return (
            <g key={c.chave}>
              {foco === i && <rect x={0} y={topoLinha} width={720} height={linha} fill="var(--viz-faixa)" />}
              <text x={m.esq - 10} y={yBarra + 15} textAnchor="end" fontSize={12} fill="var(--viz-texto)">
                {c.rotulo}
              </text>
              {visiveis.map((k, n) => {
                const v0 = acumulado;
                acumulado += c.porCanal[k];
                const x0 = x(v0) + (n === 0 ? 0 : 1);
                const largura = x(acumulado) - x0 - (n === visiveis.length - 1 ? 0 : 1);
                if (largura <= 0.5) return null;
                return <path key={k} d={barraArredondada(x0, yBarra, largura, 22, n === visiveis.length - 1)} fill={COR_CANAL[k]} />;
              })}
              {c.total > 0 && (
                <text x={x(c.total) + 8} y={yBarra + 15} fontSize={12} fontWeight={600} fill="var(--cor-texto)">
                  {brl(c.total)}
                </text>
              )}
              <rect x={0} y={topoLinha} width={720} height={linha} fill="transparent" tabIndex={0} role="img" aria-label={`${c.rotulo}: ${brl(c.total)}`} onPointerEnter={() => setFoco(i)} onPointerDown={() => setFoco(i)} onFocus={() => setFoco(i)} onBlur={() => setFoco(null)} />
            </g>
          );
        })}
      </svg>
      {ativo && (
        <div className="absolute right-0 top-0 z-10">
          <Dica titulo={ativo.rotulo} cat={ativo} canais={canais} />
        </div>
      )}
    </div>
    </div>
  );
}

// ---------------------------------------------------------------- painel

export function GraficoVendas({ linhas, de, ate, lojas, canais }: { linhas: LinhaVenda[]; de: string; ate: string; lojas: { chave: string; nome: string }[]; canais: CanalVenda[] }) {
  const [tabela, setTabela] = useState(false);
  const umDia = de === ate;
  const nomeLoja = (k: string) => lojas.find((l) => l.chave === k)?.nome.replace("BlackPoke ", "") ?? k;

  const serie = useMemo(() => serieDoPeriodo(linhas, de, ate), [linhas, de, ate]);

  // Um dia só: barras por loja (ou por turno, se for uma loja só).
  const categorias: Categoria[] = useMemo(() => {
    if (!umDia) return [];
    const porLoja = lojas.length > 1;
    const grupos = new Map<string, LinhaVenda[]>();
    for (const l of linhas) {
      const k = porLoja ? l.lojaChave : l.periodo;
      grupos.set(k, [...(grupos.get(k) ?? []), l]);
    }
    return [...grupos.entries()]
      .map(([k, ls]) => {
        const porCanal = vazio();
        for (const l of ls) porCanal[l.canal] += l.liquido;
        const t = somar(ls);
        return { chave: k, rotulo: porLoja ? nomeLoja(k) : ROTULO_PERIODO[k as LinhaVenda["periodo"]], porCanal, total: t.liquido, pedidos: t.pedidos };
      })
      .sort((a, b) => b.total - a.total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhas, umDia, lojas]);

  const canaisComVenda = CANAIS.filter((c) => canais.includes(c) && linhas.some((l) => l.canal === c && l.liquido > 0));
  const titulo = umDia ? (lojas.length > 1 ? "Faturamento por loja" : "Faturamento por turno") : serie.granularidade === "mes" ? "Faturamento por mês" : "Faturamento por dia";
  const semVenda = linhas.every((l) => l.liquido === 0);

  return (
    <div className="cartao h-full min-w-0">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">{titulo}</h2>
          <p className="mt-0.5 text-xs text-neutral-500">Por canal de venda</p>
        </div>
        <button className="text-sm font-medium text-neutral-700 underline underline-offset-2" onClick={() => setTabela((t) => !t)}>
          {tabela ? "Ver gráfico" : "Ver como tabela"}
        </button>
      </div>

      {canaisComVenda.length > 1 && (
        <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-700" aria-label="Legenda">
          {canaisComVenda.map((c) => (
            <li key={c} className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: COR_CANAL[c] }} />
              {ROTULO_CANAL[c]}
            </li>
          ))}
        </ul>
      )}

      {semVenda ? (
        <p className="py-10 text-center text-sm text-neutral-600">Sem vendas neste período para os filtros escolhidos.</p>
      ) : tabela ? (
        <div className="max-h-80 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white text-left text-xs text-neutral-500">
              <tr>
                <th className="py-1.5 pr-3 font-medium">{umDia ? (lojas.length > 1 ? "Loja" : "Turno") : "Período"}</th>
                {canaisComVenda.map((c) => (
                  <th key={c} className="px-2 py-1.5 text-right font-medium">
                    {ROTULO_CANAL[c]}
                  </th>
                ))}
                <th className="px-2 py-1.5 text-right font-medium">Total</th>
                <th className="py-1.5 pl-2 text-right font-medium">Pedidos</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {(umDia ? categorias : serie.pontos.map((p) => ({ ...p, rotulo: serie.granularidade === "dia" ? diaCurto(p.chave) : mesCurto(p.chave) }))).map((p) => (
                <tr key={p.chave} className="border-t border-neutral-100">
                  <td className="py-1.5 pr-3">{p.rotulo}</td>
                  {canaisComVenda.map((c) => (
                    <td key={c} className="px-2 py-1.5 text-right">
                      {brl(p.porCanal[c])}
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-right font-semibold">{brl(p.total)}</td>
                  <td className="py-1.5 pl-2 text-right">{num(p.pedidos)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : umDia ? (
        <Barras categorias={categorias} canais={canaisComVenda} />
      ) : (
        <Colunas pontos={serie.pontos} granularidade={serie.granularidade} canais={canaisComVenda} />
      )}
    </div>
  );
}


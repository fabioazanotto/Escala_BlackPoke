import { CANAIS, ROTULO_CANAL, type Totais } from "@/lib/vendas/consulta";
import { brl, pct } from "@/lib/vendas/formatar";
import type { CanalVenda } from "@/lib/tipos";
import { COR_CANAL } from "./rotulosCanal";

/** Quanto cada canal representa do faturamento do período. */
export function ParticipacaoCanais({ porCanal }: { porCanal: Record<CanalVenda, Totais> }) {
  const total = CANAIS.reduce((s, c) => s + porCanal[c].liquido, 0);
  const lista = CANAIS.filter((c) => porCanal[c].liquido > 0 || porCanal[c].pedidos > 0);

  return (
    <div className="cartao h-full">
      <h2 className="text-base font-semibold">Participação por canal</h2>
      <p className="mt-0.5 text-xs text-neutral-500">Parte do faturamento de cada canal</p>

      {total <= 0 ? (
        <p className="mt-4 text-sm text-neutral-600">Sem vendas no período.</p>
      ) : (
        <ul className="mt-4 space-y-4">
          {lista.map((c) => {
            const parte = (porCanal[c].liquido / total) * 100;
            return (
              <li key={c}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: COR_CANAL[c] }} />
                    {ROTULO_CANAL[c]}
                  </span>
                  <span className="text-sm font-semibold tabular-nums">{pct(parte)}</span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--viz-faixa)" }} role="img" aria-label={`${ROTULO_CANAL[c]}: ${pct(parte)} do faturamento`}>
                  <div className="h-full rounded-full" style={{ width: `${Math.max(parte, 0.5)}%`, background: COR_CANAL[c] }} />
                </div>
                <p className="mt-1 text-xs text-neutral-600 tabular-nums">
                  {brl(porCanal[c].liquido)} · {porCanal[c].pedidos.toLocaleString("pt-BR")} pedidos
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

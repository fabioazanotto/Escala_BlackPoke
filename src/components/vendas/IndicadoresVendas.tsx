import { brl, num, pct } from "@/lib/vendas/formatar";
import { variacao, type Totais } from "@/lib/vendas/consulta";

function Variacao({ atual, anterior, rotulo, altaEhBoa = true }: { atual: number; anterior: number; rotulo: string; altaEhBoa?: boolean }) {
  const v = variacao(atual, anterior);
  if (v === null) return <p className="mt-1 text-xs text-neutral-500">Sem dados em {rotulo} para comparar</p>;
  const sobe = v > 0.05;
  const desce = v < -0.05;
  const bom = sobe ? altaEhBoa : desce ? !altaEhBoa : null;
  const cor = bom === null ? "text-neutral-600" : bom ? "text-green-700" : "text-red-700";
  return (
    <p className={`mt-1 text-xs ${cor}`}>
      <span className="font-semibold">
        {sobe ? "▲ " : desce ? "▼ " : "= "}
        {pct(Math.abs(v))}
      </span>{" "}
      <span className="text-neutral-500">vs. {rotulo}</span>
    </p>
  );
}

function Cartao({ rotulo, valor, apoio, recorde, children }: { rotulo: string; valor: string; apoio?: string; recorde?: string; children: React.ReactNode }) {
  return (
    <div className="cartao">
      <p className="text-sm text-neutral-600">{rotulo}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums sm:text-2xl">
        {valor}
        {recorde && (
          <span role="img" aria-label={recorde} title={recorde} className="ml-1.5">
            🏆
          </span>
        )}
      </p>
      {apoio && <p className="text-xs text-neutral-600 tabular-nums">{apoio}</p>}
      {children}
    </div>
  );
}

/** Quatro números do período, cada um comparado com o período anterior. */
export function IndicadoresVendas({ atual, anterior, rotuloComparacao, recorde }: { atual: Totais; anterior: Totais; rotuloComparacao: string; recorde?: { pedidos: boolean; faturamento: boolean } }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Cartao rotulo="Faturamento" valor={brl(atual.liquido)} recorde={recorde?.faturamento ? "Recorde de faturamento da loja" : undefined}>
        <Variacao atual={atual.liquido} anterior={anterior.liquido} rotulo={rotuloComparacao} />
      </Cartao>
      <Cartao rotulo="Pedidos" valor={num(atual.pedidos)} recorde={recorde?.pedidos ? "Recorde de pedidos da loja" : undefined}>
        <Variacao atual={atual.pedidos} anterior={anterior.pedidos} rotulo={rotuloComparacao} />
      </Cartao>
      <Cartao rotulo="Ticket médio" valor={brl(atual.ticketMedio)}>
        <Variacao atual={atual.ticketMedio} anterior={anterior.ticketMedio} rotulo={rotuloComparacao} />
      </Cartao>
      <Cartao rotulo="Cancelamentos" valor={num(atual.cancelados)} apoio={atual.valorCancelado > 0 ? `${brl(atual.valorCancelado)} em vendas canceladas` : undefined}>
        <Variacao atual={atual.cancelados} anterior={anterior.cancelados} rotulo={rotuloComparacao} altaEhBoa={false} />
      </Cartao>
    </div>
  );
}

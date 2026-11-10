// Períodos, somas e comparações da tela de Vendas. Funções puras (testadas); sem acesso a rede nem ao banco.

import type { CanalVenda } from "@/lib/tipos";
import { somarDiasData } from "./datas";

export type LinhaVenda = {
  lojaChave: string;
  dia: string; // dia de caixa, "2026-11-09"
  periodo: "manha" | "tarde" | "noite" | "indefinido";
  canal: CanalVenda;
  pedidos: number;
  cancelados: number;
  bruto: number;
  descontoComercial: number;
  descontoFuncionarios: number;
  taxaEntrega: number;
  liquido: number;
  valorCancelado: number;
};

export type Totais = {
  pedidos: number;
  cancelados: number;
  bruto: number;
  descontos: number; // comercial + funcionários
  taxaEntrega: number;
  liquido: number;
  valorCancelado: number;
  ticketMedio: number;
};

export const CANAIS: CanalVenda[] = ["xmenu", "ifood", "balcao", "outros"];
export const ROTULO_CANAL: Record<CanalVenda, string> = { xmenu: "Xmenu", ifood: "iFood", balcao: "Balcão", outros: "Outros" };
export const ROTULO_PERIODO: Record<LinhaVenda["periodo"], string> = { manha: "Manhã", tarde: "Tarde", noite: "Noite", indefinido: "Sem turno" };

// ---------------------------------------------------------------- períodos

export type TipoPeriodo = "ontem" | "hoje" | "7dias" | "30dias" | "mes" | "mesPassado" | "ano" | "personalizado";

export const ROTULO_TIPO_PERIODO: Record<TipoPeriodo, string> = {
  ontem: "Ontem",
  hoje: "Hoje",
  "7dias": "Últimos 7 dias",
  "30dias": "Últimos 30 dias",
  mes: "Este mês",
  mesPassado: "Mês passado",
  ano: "Este ano",
  personalizado: "Escolher datas",
};

export type Periodo = { tipo: TipoPeriodo; de: string; ate: string };

const diasNoMes = (ano: number, mes: number) => new Date(Date.UTC(ano, mes, 0)).getUTCDate(); // mes de 1 a 12

/** Move um dia n meses, sem passar do último dia do mês de destino (31/03 - 1 mês = 28/02). */
export function deslocarMeses(dia: string, n: number): string {
  const [a, m, d] = dia.split("-").map(Number);
  const total = a * 12 + (m - 1) + n;
  const ano = Math.floor(total / 12);
  const mes = (total % 12) + 1;
  const dd = Math.min(d, diasNoMes(ano, mes));
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

export function diasEntre(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86400000) + 1;
}

export function periodoDoTipo(tipo: Exclude<TipoPeriodo, "personalizado">, hoje: string): Periodo {
  switch (tipo) {
    case "hoje":
      return { tipo, de: hoje, ate: hoje };
    case "ontem": {
      const d = somarDiasData(hoje, -1);
      return { tipo, de: d, ate: d };
    }
    case "7dias":
      return { tipo, de: somarDiasData(hoje, -6), ate: hoje };
    case "30dias":
      return { tipo, de: somarDiasData(hoje, -29), ate: hoje };
    case "mes":
      return { tipo, de: `${hoje.slice(0, 7)}-01`, ate: hoje };
    case "mesPassado": {
      const primeiro = `${hoje.slice(0, 7)}-01`;
      return { tipo, de: deslocarMeses(primeiro, -1), ate: somarDiasData(primeiro, -1) };
    }
    case "ano":
      return { tipo, de: `${hoje.slice(0, 4)}-01-01`, ate: hoje };
  }
}

/** Período usado na comparação, com o texto que explica contra o que se compara. */
export function periodoAnterior(p: Periodo): { de: string; ate: string; rotulo: string } {
  const n = diasEntre(p.de, p.ate);
  if (p.tipo === "ano") return { de: deslocarMeses(p.de, -12), ate: deslocarMeses(p.ate, -12), rotulo: "mesmo período do ano passado" };
  if (p.tipo === "mes" || p.tipo === "mesPassado") {
    const ateAnterior = p.tipo === "mes" ? deslocarMeses(p.ate, -1) : somarDiasData(p.de, -1);
    const deAnterior = deslocarMeses(p.de, -1);
    return { de: deAnterior, ate: ateAnterior, rotulo: p.tipo === "mes" ? "mesmo período do mês passado" : "mês anterior" };
  }
  if (n === 1) return { de: somarDiasData(p.de, -7), ate: somarDiasData(p.de, -7), rotulo: "mesmo dia da semana anterior" };
  return { de: somarDiasData(p.de, -n), ate: somarDiasData(p.de, -1), rotulo: `${n} dias anteriores` };
}

// ---------------------------------------------------------------- somas

const centavos = (n: number) => Math.round(n * 100) / 100;

export const totaisVazios = (): Totais => ({ pedidos: 0, cancelados: 0, bruto: 0, descontos: 0, taxaEntrega: 0, liquido: 0, valorCancelado: 0, ticketMedio: 0 });

export function somar(linhas: LinhaVenda[]): Totais {
  const t = totaisVazios();
  for (const l of linhas) {
    t.pedidos += l.pedidos;
    t.cancelados += l.cancelados;
    t.bruto += l.bruto;
    t.descontos += l.descontoComercial + l.descontoFuncionarios;
    t.taxaEntrega += l.taxaEntrega;
    t.liquido += l.liquido;
    t.valorCancelado += l.valorCancelado;
  }
  t.bruto = centavos(t.bruto);
  t.descontos = centavos(t.descontos);
  t.taxaEntrega = centavos(t.taxaEntrega);
  t.liquido = centavos(t.liquido);
  t.valorCancelado = centavos(t.valorCancelado);
  t.ticketMedio = t.pedidos > 0 ? centavos(t.liquido / t.pedidos) : 0;
  return t;
}

export type Filtro = { lojas: string[]; canais: CanalVenda[] }; // lista vazia = todos

export function filtrar(linhas: LinhaVenda[], f: Filtro): LinhaVenda[] {
  return linhas.filter((l) => (f.lojas.length === 0 || f.lojas.includes(l.lojaChave)) && (f.canais.length === 0 || f.canais.includes(l.canal)));
}

export function agruparPor<K extends string>(linhas: LinhaVenda[], chave: (l: LinhaVenda) => K): Map<K, LinhaVenda[]> {
  const m = new Map<K, LinhaVenda[]>();
  for (const l of linhas) {
    const k = chave(l);
    const lista = m.get(k);
    if (lista) lista.push(l);
    else m.set(k, [l]);
  }
  return m;
}

/** Variação percentual. Nulo quando não há base de comparação (anterior zerado). */
export function variacao(atual: number, anterior: number): number | null {
  if (anterior === 0) return null;
  return ((atual - anterior) / Math.abs(anterior)) * 100;
}

// ---------------------------------------------------------------- série para o gráfico

export type Granularidade = "dia" | "mes";
export type PontoSerie = { chave: string; rotulo: string; porCanal: Record<CanalVenda, number>; total: number; pedidos: number };

/** Mais de 92 dias vira barras por mês; senão, uma barra por dia (inclusive dias sem venda). */
export function granularidadeDe(de: string, ate: string): Granularidade {
  return diasEntre(de, ate) > 92 ? "mes" : "dia";
}

export function serieDoPeriodo(linhas: LinhaVenda[], de: string, ate: string): { granularidade: Granularidade; pontos: PontoSerie[] } {
  const g = granularidadeDe(de, ate);
  const vazio = (): Record<CanalVenda, number> => ({ xmenu: 0, ifood: 0, balcao: 0, outros: 0 });
  const mapa = new Map<string, PontoSerie>();
  if (g === "dia") {
    for (let d = de; d <= ate; d = somarDiasData(d, 1)) mapa.set(d, { chave: d, rotulo: d, porCanal: vazio(), total: 0, pedidos: 0 });
  } else {
    for (let d = `${de.slice(0, 7)}-01`; d <= ate; d = deslocarMeses(d, 1)) {
      const k = d.slice(0, 7);
      mapa.set(k, { chave: k, rotulo: k, porCanal: vazio(), total: 0, pedidos: 0 });
    }
  }
  for (const l of linhas) {
    const p = mapa.get(g === "dia" ? l.dia : l.dia.slice(0, 7));
    if (!p) continue;
    p.porCanal[l.canal] = centavos(p.porCanal[l.canal] + l.liquido);
    p.total = centavos(p.total + l.liquido);
    p.pedidos += l.pedidos;
  }
  return { granularidade: g, pontos: [...mapa.values()] };
}

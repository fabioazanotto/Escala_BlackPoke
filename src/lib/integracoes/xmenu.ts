// Integração com o Xmenu (API pública v2, SOMENTE LEITURA).
//
// Roda só no servidor (Route Handlers): os tokens vêm das variáveis de ambiente e nunca vão
// para o navegador. Devolve sempre o formato interno do sistema (veja src/lib/tipos.ts).
// Dados de cliente (nome, telefone, endereço) são descartados aqui, na tradução.
//
// Descobertas sobre a API (docs/xmenu-api.md):
//  - valor e canal só existem em `closed-sales` (caixa fechado); a data base é a data do caixa;
//  - o iFood não é um canal: aparece como `delivery.marketplaceOrderId` preenchido;
//  - `/sales` (ao vivo) não traz canal e seus totais não batem com os do caixa fechado;
//  - `from`/`to` são comparados com a data do caixa DEPOIS de converter o fuso para UTC: com "-03:00" o pedido de um dia
//    traz o dia seguinte. Use datas sem fuso (veja `limitesDoDiaDeCaixa`);
//  - `include=delivery` (sem `customer`) já devolve o cliente vazio.

import { LOJAS_XMENU, VARIAVEL_URL_XMENU, type LojaXmenu } from "@/config/lojas";
import type { CanalVenda, PeriodoCaixa, VendaResumida } from "@/lib/tipos";

export type CodigoErro =
  | "SEM_CONFIGURACAO"
  | "NAO_AUTORIZADO"
  | "REQUISICAO_INVALIDA"
  | "NAO_ENCONTRADO"
  | "LIMITE_DE_CHAMADAS"
  | "TEMPO_ESGOTADO"
  | "ERRO_DE_REDE"
  | "ERRO_DO_SERVIDOR"
  | "RESPOSTA_INVALIDA";

export class ErroXmenu extends Error {
  constructor(
    public codigo: CodigoErro,
    mensagem: string,
    public status?: number,
  ) {
    super(mensagem);
    this.name = "ErroXmenu";
  }
}

export type Ambiente = Record<string, string | undefined>;

export type Dependencias = {
  env: Ambiente;
  fetchFn: typeof fetch;
  esperaMs: number; // espera inicial entre tentativas (dobra a cada tentativa)
  tentativas: number;
  tempoLimiteMs: number;
};

const PADRAO = {
  esperaMs: 800,
  tentativas: 3,
  tempoLimiteMs: 20000,
};

type Parametros = Record<string, string | number | boolean | undefined | null>;

function juntar(dep: Partial<Dependencias>): Dependencias {
  return {
    env: dep.env ?? process.env,
    fetchFn: dep.fetchFn ?? fetch,
    esperaMs: dep.esperaMs ?? PADRAO.esperaMs,
    tentativas: dep.tentativas ?? PADRAO.tentativas,
    tempoLimiteMs: dep.tempoLimiteMs ?? PADRAO.tempoLimiteMs,
  };
}

/** Endereço completo de uma consulta: /v2/stores/{storeId}/{caminho}?parametros */
export function montarUrl(base: string, storeId: string, caminho: string, params: Parametros = {}): string {
  const raiz = base.trim().replace(/\/+$/, "");
  const resto = caminho.replace(/^\/+/, "");
  const url = new URL(`${raiz}/v2/stores/${encodeURIComponent(storeId)}/${resto}`);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    url.searchParams.set(k, String(v));
  }
  return url.toString();
}

export function tokenDaLoja(loja: LojaXmenu, env: Ambiente = process.env): string | null {
  const t = env[loja.variavelToken]?.trim();
  return t ? t : null;
}

export function lojasConfiguradas(env: Ambiente = process.env): LojaXmenu[] {
  return LOJAS_XMENU.filter((l) => tokenDaLoja(l, env) !== null);
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

function erroDoStatus(status: number, detalhe: string): ErroXmenu {
  if (status === 401 || status === 403) {
    return new ErroXmenu("NAO_AUTORIZADO", "O Xmenu recusou o token desta loja (inválido, revogado ou sem permissão).", status);
  }
  if (status === 404) return new ErroXmenu("NAO_ENCONTRADO", "Endereço não encontrado no Xmenu.", status);
  if (status === 400) return new ErroXmenu("REQUISICAO_INVALIDA", `O Xmenu não aceitou o pedido${detalhe ? `: ${detalhe}` : "."}`, status);
  if (status === 429) return new ErroXmenu("LIMITE_DE_CHAMADAS", "O Xmenu pediu para esperar (limite de chamadas).", status);
  return new ErroXmenu("ERRO_DO_SERVIDOR", `O Xmenu respondeu com erro ${status}.`, status);
}

/** Faz uma consulta GET na API e devolve o JSON. Tenta de novo em 429, 5xx e falhas de rede. */
export async function obter(
  loja: LojaXmenu,
  caminho: string,
  params: Parametros = {},
  dependencias: Partial<Dependencias> = {},
): Promise<unknown> {
  const dep = juntar(dependencias);
  const base = dep.env[VARIAVEL_URL_XMENU]?.trim();
  const token = tokenDaLoja(loja, dep.env);
  if (!base) throw new ErroXmenu("SEM_CONFIGURACAO", `A variável ${VARIAVEL_URL_XMENU} não está configurada.`);
  if (!token) throw new ErroXmenu("SEM_CONFIGURACAO", `O token desta loja (${loja.variavelToken}) não está configurado.`);

  const url = montarUrl(base, loja.storeId, caminho, params);
  let ultimo: ErroXmenu | null = null;

  for (let tentativa = 1; tentativa <= dep.tentativas; tentativa++) {
    const controle = new AbortController();
    const relogio = setTimeout(() => controle.abort(), dep.tempoLimiteMs);
    let esperaExtra = 0;
    try {
      const resp = await dep.fetchFn(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        signal: controle.signal,
        cache: "no-store",
      });
      if (resp.ok) {
        try {
          return await resp.json();
        } catch {
          throw new ErroXmenu("RESPOSTA_INVALIDA", "O Xmenu respondeu algo que não é JSON.", resp.status);
        }
      }
      let detalhe = "";
      try {
        const p = (await resp.json()) as { detail?: unknown; title?: unknown };
        detalhe = String(p.detail ?? p.title ?? "").slice(0, 200);
      } catch {
        /* sem detalhe */
      }
      ultimo = erroDoStatus(resp.status, detalhe);
      const aguardar = Number(resp.headers.get("retry-after"));
      if (Number.isFinite(aguardar) && aguardar > 0) esperaExtra = Math.min(aguardar, 10) * 1000;
      if (resp.status !== 429 && resp.status < 500) throw ultimo; // não adianta tentar de novo
    } catch (e) {
      if (e instanceof ErroXmenu && e.codigo !== "LIMITE_DE_CHAMADAS" && e.codigo !== "ERRO_DO_SERVIDOR") throw e;
      if (e instanceof ErroXmenu) ultimo = e;
      else if ((e as { name?: string }).name === "AbortError") ultimo = new ErroXmenu("TEMPO_ESGOTADO", "O Xmenu demorou demais para responder.");
      else ultimo = new ErroXmenu("ERRO_DE_REDE", "Não foi possível falar com o Xmenu.");
    } finally {
      clearTimeout(relogio);
    }
    if (tentativa < dep.tentativas) await dormir(Math.max(esperaExtra, dep.esperaMs * 2 ** (tentativa - 1)));
  }
  throw ultimo ?? new ErroXmenu("ERRO_DE_REDE", "Não foi possível falar com o Xmenu.");
}

// ---------------------------------------------------------------- leitura do envelope

type Envelope = { itens: unknown[]; temMais: boolean };

/** A API responde { data: [...], pagination, meta }; o conector de conversa embrulha mais uma vez. Aceita os dois. */
export function lerEnvelope(corpo: unknown): Envelope {
  const c = (corpo ?? {}) as Record<string, unknown>;
  const interno = (c.data && !Array.isArray(c.data) && typeof c.data === "object" ? c.data : null) as Record<string, unknown> | null;
  const lista = Array.isArray(c.data) ? c.data : Array.isArray(interno?.data) ? (interno!.data as unknown[]) : null;
  if (!lista) throw new ErroXmenu("RESPOSTA_INVALIDA", "A resposta do Xmenu não tem a lista esperada.");
  const pag = (c.pagination ?? interno?.pagination ?? {}) as { hasMore?: unknown };
  return { itens: lista, temMais: pag.hasMore === true };
}

// ---------------------------------------------------------------- tradução para o formato interno

type Bruto = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** iFood = entrega com código de marketplace; Xmenu = entrega sem código; balcão. */
export function classificarCanal(venda: Bruto): CanalVenda {
  const canal = venda?.header?.salesChannel;
  const marketplace = venda?.delivery?.marketplaceOrderId;
  if (canal === "counter") return "balcao";
  if (typeof marketplace === "string" && marketplace.trim() !== "") return "ifood";
  if (canal === "delivery" || venda?.delivery?.isDelivery === true) return "xmenu";
  return "outros";
}

const PERIODOS: Record<string, PeriodoCaixa> = { morning: "manha", afternoon: "tarde", night: "noite" };

/** Desconto de consumo de funcionário: identificado pelo nome do desconto cadastrado no Xmenu. */
export function ehDescontoDeFuncionario(nome: unknown): boolean {
  return String(nome ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .includes("funcionario");
}

export function paraVendaResumida(lojaChave: string, venda: Bruto): VendaResumida {
  const cashDate = String(venda?.register?.cashDate ?? "");
  const t = venda?.totals ?? {};
  return {
    lojaChave,
    saleId: num(venda?.header?.saleId),
    saleGuid: String(venda?.header?.saleGuid ?? ""),
    dataCaixa: cashDate.slice(0, 10),
    periodo: PERIODOS[String(venda?.register?.periodCode ?? "")] ?? null,
    canal: classificarCanal(venda),
    entrega: venda?.delivery?.isDelivery === true,
    retirada: venda?.delivery?.isPickup === true,
    cancelada: venda?.header?.cancelled === true,
    bruto: num(t.itemsGross),
    desconto: num(t.discountValue),
    descontoFuncionarios: ehDescontoDeFuncionario(venda?.discount?.discountName) ? num(venda?.discount?.value ?? t.discountValue) : 0,
    taxaEntrega: num(t.deliveryFee),
    liquido: num(t.totalNet),
  };
}

// ---------------------------------------------------------------- consultas

export type FiltroVendas = {
  de: string; // "2026-11-01T00:00:00" (sem fuso!)
  ate: string; // "2026-11-01T23:59:59"
  incluirCanceladas?: boolean;
};

/** Limites, sem fuso, de um dia de caixa ("2026-11-05"), do jeito que o Xmenu entende. */
export function limitesDoDiaDeCaixa(dia: string): { de: string; ate: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) throw new ErroXmenu("REQUISICAO_INVALIDA", `Data inválida: ${dia}`);
  return { de: `${dia}T00:00:00`, ate: `${dia}T23:59:59` };
}

const TAMANHO_PAGINA = 50;
const MAXIMO_PAGINAS = 400; // trava de segurança: 20 mil vendas por consulta

/** Todas as vendas de caixas fechados no período, já no formato interno, paginando até o fim. */
export async function buscarVendasCaixaFechado(
  loja: LojaXmenu,
  filtro: FiltroVendas,
  dependencias: Partial<Dependencias> = {},
): Promise<VendaResumida[]> {
  const vendas: VendaResumida[] = [];
  for (let pagina = 0; pagina < MAXIMO_PAGINAS; pagina++) {
    const corpo = await obter(
      loja,
      "cash-registers/closed-sales",
      {
        from: filtro.de,
        to: filtro.ate,
        include: "delivery", // traz o código de marketplace e não traz o cliente
        include_cancelled: filtro.incluirCanceladas ? true : undefined,
        limit: TAMANHO_PAGINA,
        offset: pagina * TAMANHO_PAGINA,
      },
      dependencias,
    );
    const { itens, temMais } = lerEnvelope(corpo);
    for (const v of itens) vendas.push(paraVendaResumida(loja.chave, v as Bruto));
    if (!temMais || itens.length === 0) return vendas;
  }
  throw new ErroXmenu("RESPOSTA_INVALIDA", "Muitas páginas de vendas: o período pedido é grande demais.");
}

// ---------------------------------------------------------------- diagnóstico

export type ResultadoTeste = { nome: string; ok: boolean; status?: number; tempoMs: number; mensagem: string };

export type DiagnosticoLoja = {
  chave: string;
  nome: string;
  storeId: string;
  tokenConfigurado: boolean;
  testes: ResultadoTeste[];
};

async function testar(nome: string, fazer: () => Promise<unknown>): Promise<ResultadoTeste> {
  const inicio = Date.now();
  try {
    await fazer();
    return { nome, ok: true, status: 200, tempoMs: Date.now() - inicio, mensagem: "Respondeu normalmente." };
  } catch (e) {
    const erro = e instanceof ErroXmenu ? e : new ErroXmenu("ERRO_DE_REDE", "Falha inesperada.");
    return { nome, ok: false, status: erro.status, tempoMs: Date.now() - inicio, mensagem: erro.message };
  }
}

/** Testa uma loja sem expor token nem dados: só diz se cada consulta respondeu. */
export async function diagnosticarLoja(loja: LojaXmenu, dependencias: Partial<Dependencias> = {}): Promise<DiagnosticoLoja> {
  const dep = juntar(dependencias);
  const tokenConfigurado = tokenDaLoja(loja, dep.env) !== null;
  const base = { chave: loja.chave, nome: loja.nome, storeId: loja.storeId, tokenConfigurado };
  if (!tokenConfigurado || !dep.env[VARIAVEL_URL_XMENU]?.trim()) {
    return {
      ...base,
      testes: [
        {
          nome: "Configuração",
          ok: false,
          tempoMs: 0,
          mensagem: !tokenConfigurado
            ? `Falta a variável ${loja.variavelToken} na Vercel.`
            : `Falta a variável ${VARIAVEL_URL_XMENU} na Vercel.`,
        },
      ],
    };
  }
  const agora = new Date();
  const doisDiasAtras = new Date(agora.getTime() - 2 * 86400000);
  const semFuso = (d: Date) => d.toISOString().slice(0, 19); // o Xmenu espera datas sem fuso
  const testes = await Promise.all([
    testar("Horários da loja", () => obter(loja, "operations/store-hours", { limit: 1 }, dependencias)),
    testar("Vendas de caixa fechado", () =>
      obter(loja, "cash-registers/closed-sales", { from: semFuso(doisDiasAtras), to: semFuso(agora), limit: 1 }, dependencias),
    ),
  ]);
  return { ...base, testes };
}

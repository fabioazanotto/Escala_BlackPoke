import { describe, expect, it } from "vitest";
import { LOJAS_XMENU } from "@/config/lojas";
import {
  buscarVendasCaixaFechado,
  classificarCanal,
  diagnosticarLoja,
  ErroXmenu,
  lerEnvelope,
  montarUrl,
  obter,
  paraVendaResumida,
  tokenDaLoja,
} from "./xmenu";

const loja = LOJAS_XMENU[0];
const ENV = { XMENU_API_URL: "https://api.exemplo.test/XMenuDataApi/PublicApi/", [loja.variavelToken]: "xmdapi_teste" };
const RAPIDO = { esperaMs: 0, tentativas: 3 };

// Vendas de exemplo no formato da API (inventadas, sem dados reais).
const venda = (extra: Record<string, unknown> = {}) => ({
  register: { cashDate: "2026-11-07T00:00:00", periodCode: "afternoon", periodName: "Tarde" },
  header: { saleId: 719, saleGuid: "AAAA-1", salesChannel: "delivery", salesChannelLabel: "Delivery", cancelled: false },
  totals: { itemsGross: 61.17, discountValue: 5, deliveryFee: 5, totalNet: 56.17 },
  delivery: {
    isDelivery: true,
    isPickup: false,
    marketplaceOrderId: "11111111-2222-3333-4444-555555555555",
    customer: { name: "Fulano de Tal", phone: "13999999999", fullAddress: "Rua X, 1" },
  },
  ...extra,
});

const resposta = (corpo: unknown, status = 200, cabecalhos: Record<string, string> = {}) =>
  new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json", ...cabecalhos } });

describe("classificação do canal", () => {
  it("iFood = entrega com código de marketplace", () => expect(classificarCanal(venda())).toBe("ifood"));
  it("Xmenu = entrega sem código de marketplace", () => {
    const v = venda({ delivery: { isDelivery: true, isPickup: false, marketplaceOrderId: null } });
    expect(classificarCanal(v)).toBe("xmenu");
  });
  it("balcão", () => {
    const v = venda({ header: { saleId: 1, salesChannel: "counter" }, delivery: null });
    expect(classificarCanal(v)).toBe("balcao");
  });
  it("canal desconhecido não é chutado", () => {
    expect(classificarCanal({ header: { salesChannel: "mesa" }, delivery: null })).toBe("outros");
    expect(classificarCanal({})).toBe("outros");
  });
  it("código de marketplace só com espaços não conta como iFood", () => {
    expect(classificarCanal(venda({ delivery: { isDelivery: true, marketplaceOrderId: "  " } }))).toBe("xmenu");
  });
});

describe("tradução para o formato interno", () => {
  it("copia os valores e a data do caixa", () => {
    const r = paraVendaResumida("pg", venda());
    expect(r).toMatchObject({ lojaChave: "pg", saleId: 719, dataCaixa: "2026-11-07", periodo: "tarde", canal: "ifood", entrega: true, bruto: 61.17, desconto: 5, taxaEntrega: 5, liquido: 56.17 });
  });
  it("NÃO guarda nenhum dado de cliente", () => {
    const texto = JSON.stringify(paraVendaResumida("pg", venda()));
    for (const proibido of ["Fulano", "13999999999", "Rua X", "customer", "phone", "name", "address"]) expect(texto).not.toContain(proibido);
  });
  it("aguenta venda incompleta sem quebrar", () => {
    const r = paraVendaResumida("pg", { header: { saleId: 1 } });
    expect(r).toMatchObject({ dataCaixa: "", periodo: null, bruto: 0, liquido: 0, canal: "outros" });
  });
  it("reconhece os três períodos do caixa", () => {
    const de = (p: string) => paraVendaResumida("pg", { register: { periodCode: p }, header: {} }).periodo;
    expect([de("morning"), de("afternoon"), de("night"), de("outro")]).toEqual(["manha", "tarde", "noite", null]);
  });
});

describe("endereço e configuração", () => {
  it("monta o endereço por loja, sem barras duplicadas e ignorando parâmetros vazios", () => {
    const u = montarUrl("https://a.test/Api/", "20210", "/cash-registers/closed-sales", { from: "x", limit: 50, vazio: undefined, nulo: null, texto: "" });
    expect(u).toBe("https://a.test/Api/v2/stores/20210/cash-registers/closed-sales?from=x&limit=50");
  });
  it("lê o token da variável da loja", () => {
    expect(tokenDaLoja(loja, ENV)).toBe("xmdapi_teste");
    expect(tokenDaLoja(loja, {})).toBeNull();
    expect(tokenDaLoja(loja, { [loja.variavelToken]: "   " })).toBeNull();
  });
  it("aceita o envelope da API e o do conector", () => {
    expect(lerEnvelope({ data: [1, 2], pagination: { hasMore: true } })).toEqual({ itens: [1, 2], temMais: true });
    expect(lerEnvelope({ success: true, data: { data: [3], pagination: { hasMore: false } } })).toEqual({ itens: [3], temMais: false });
    expect(() => lerEnvelope({ data: "x" })).toThrow(ErroXmenu);
  });
});

describe("chamadas à API", () => {
  it("envia o token no cabeçalho, só por GET, e nunca o coloca no endereço", async () => {
    let visto: { url: string; init: RequestInit } | null = null;
    const fetchFn = (async (url: string, init: RequestInit) => {
      visto = { url, init };
      return resposta({ data: [] });
    }) as unknown as typeof fetch;
    await obter(loja, "catalog/units", { limit: 1 }, { env: ENV, fetchFn, ...RAPIDO });
    expect(visto!.init.method).toBe("GET");
    expect((visto!.init.headers as Record<string, string>).Authorization).toBe("Bearer xmdapi_teste");
    expect(visto!.url).not.toContain("xmdapi_teste");
    expect(visto!.url).toContain(`/v2/stores/${loja.storeId}/catalog/units?limit=1`);
  });

  it("sem configuração, nem chama a API", async () => {
    let chamou = false;
    const fetchFn = (async () => {
      chamou = true;
      return resposta({});
    }) as unknown as typeof fetch;
    await expect(obter(loja, "x", {}, { env: {}, fetchFn })).rejects.toMatchObject({ codigo: "SEM_CONFIGURACAO" });
    expect(chamou).toBe(false);
  });

  it("token recusado (401) falha na hora, sem insistir", async () => {
    let chamadas = 0;
    const fetchFn = (async () => {
      chamadas++;
      return resposta({}, 401);
    }) as unknown as typeof fetch;
    await expect(obter(loja, "x", {}, { env: ENV, fetchFn, ...RAPIDO })).rejects.toMatchObject({ codigo: "NAO_AUTORIZADO", status: 401 });
    expect(chamadas).toBe(1);
  });

  it("tenta de novo em 429 e em 503 e depois dá certo", async () => {
    const respostas = [resposta({}, 429, { "retry-after": "0" }), resposta({}, 503), resposta({ data: [] })];
    let i = 0;
    const fetchFn = (async () => respostas[i++]) as unknown as typeof fetch;
    const r = await obter(loja, "x", {}, { env: ENV, fetchFn, ...RAPIDO });
    expect(r).toEqual({ data: [] });
    expect(i).toBe(3);
  });

  it("desiste depois das tentativas e diz o motivo", async () => {
    const fetchFn = (async () => resposta({}, 429)) as unknown as typeof fetch;
    await expect(obter(loja, "x", {}, { env: ENV, fetchFn, ...RAPIDO })).rejects.toMatchObject({ codigo: "LIMITE_DE_CHAMADAS" });
  });

  it("falha de rede vira erro claro", async () => {
    const fetchFn = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    await expect(obter(loja, "x", {}, { env: ENV, fetchFn, ...RAPIDO })).rejects.toMatchObject({ codigo: "ERRO_DE_REDE" });
  });

  it("a mensagem de erro nunca contém o token", async () => {
    const fetchFn = (async () => resposta({ detail: "ok" }, 400)) as unknown as typeof fetch;
    const e = (await obter(loja, "x", {}, { env: ENV, fetchFn, ...RAPIDO }).catch((x: unknown) => x)) as ErroXmenu;
    expect(e).toBeInstanceOf(ErroXmenu);
    expect(String(e.message)).not.toContain("xmdapi_teste");
  });
});

describe("busca de vendas por caixa fechado", () => {
  it("pagina até o fim e junta as vendas no formato interno", async () => {
    const paginas = [
      { data: [venda(), venda({ header: { saleId: 2, salesChannel: "counter" }, delivery: null })], pagination: { hasMore: true } },
      { data: [venda({ header: { saleId: 3, salesChannel: "delivery", cancelled: true }, delivery: { isDelivery: true, marketplaceOrderId: null } })], pagination: { hasMore: false } },
    ];
    const urls: string[] = [];
    let i = 0;
    const fetchFn = (async (url: string) => {
      urls.push(url);
      return resposta(paginas[i++]);
    }) as unknown as typeof fetch;
    const r = await buscarVendasCaixaFechado(loja, { de: "2026-11-01T00:00:00-03:00", ate: "2026-11-02T00:00:00-03:00" }, { env: ENV, fetchFn, ...RAPIDO });
    expect(r.map((v) => v.saleId)).toEqual([719, 2, 3]);
    expect(r.map((v) => v.canal)).toEqual(["ifood", "balcao", "xmenu"]);
    expect(r[2].cancelada).toBe(true);
    expect(urls[0]).toContain("offset=0");
    expect(urls[1]).toContain("offset=50");
  });
});

describe("diagnóstico", () => {
  it("sem token, explica o que falta e não chama a API", async () => {
    const d = await diagnosticarLoja(loja, { env: { XMENU_API_URL: "https://a.test" } });
    expect(d.tokenConfigurado).toBe(false);
    expect(d.testes[0].mensagem).toContain(loja.variavelToken);
  });
  it("com tudo certo, roda os dois testes e não expõe segredos", async () => {
    const fetchFn = (async () => resposta({ data: [] })) as unknown as typeof fetch;
    const d = await diagnosticarLoja(loja, { env: ENV, fetchFn, ...RAPIDO });
    expect(d.testes).toHaveLength(2);
    expect(d.testes.every((t) => t.ok)).toBe(true);
    expect(JSON.stringify(d)).not.toContain("xmdapi_teste");
  });
  it("token recusado aparece como falha com o código", async () => {
    const fetchFn = (async () => resposta({}, 401)) as unknown as typeof fetch;
    const d = await diagnosticarLoja(loja, { env: ENV, fetchFn, ...RAPIDO });
    expect(d.testes.every((t) => !t.ok && t.status === 401)).toBe(true);
  });
});

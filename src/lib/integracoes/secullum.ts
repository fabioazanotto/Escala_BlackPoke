// Integração com o Secullum Ponto Web (API de integração externa, SOMENTE LEITURA).
//
// Roda só no servidor (Route Handlers): usuário e senha vêm das variáveis de ambiente e nunca vão para o
// navegador nem para os logs. Contrato conferido no manual oficial: veja docs/secullum-api.md.
//
// Segurança de leitura: só as rotas da lista `ROTAS_LIDAS` e as consultas `Calcular` passam por `rotaPermitida`.
// Qualquer rota de escrita (POST/DELETE de cadastros, CartaoPonto, InclusaoPonto...) é recusada AQUI, mesmo por engano.

export type CodigoErro =
  | "SEM_CONFIGURACAO"
  | "NAO_AUTORIZADO"
  | "BANCO_INVALIDO"
  | "REQUISICAO_INVALIDA"
  | "LIMITE_DE_CHAMADAS"
  | "TEMPO_ESGOTADO"
  | "ERRO_DE_REDE"
  | "ERRO_DO_SERVIDOR"
  | "RESPOSTA_INVALIDA"
  | "ROTA_BLOQUEADA";

export class ErroSecullum extends Error {
  constructor(
    public codigo: CodigoErro,
    mensagem: string,
    public status?: number,
  ) {
    super(mensagem);
    this.name = "ErroSecullum";
  }
}

export const URL_AUTENTICADOR = "https://autenticador.secullum.com.br";
export const URL_API = "https://pontowebintegracaoexterna.secullum.com.br/IntegracaoExterna/";
export const VARIAVEL_USUARIO = "SECULLUM_USUARIO";
export const VARIAVEL_SENHA = "SECULLUM_SENHA";
export const VARIAVEL_BANCO = "SECULLUM_BANCO_ID"; // opcional: só se a conta enxergar mais de um banco

/** Rotas de leitura (GET) liberadas. Comparação sem diferenciar maiúsculas e sem a barra inicial. */
export const ROTAS_LIDAS = [
  "Empresas",
  "Departamentos",
  "Funcoes",
  "Justificativas",
  "Equipamentos",
  "Funcionarios",
  "Funcionarios/Cpf",
  "Horarios",
  "Batidas",
  "FonteDados",
  "FonteDados/APartirDoId",
  "FuncionariosAfastamentos",
  "FuncionariosAfastamentos/Cpf",
] as const;

/** POST que apenas CONSULTA (não grava): cálculos oficiais do Secullum. */
export const ROTAS_CONSULTA_POST = ["Calcular", "Calcular/SomenteTotais"] as const;

const normalizar = (caminho: string) => caminho.replace(/^\/+/, "").replace(/\/+$/, "").toLowerCase();

export function rotaPermitida(metodo: string, caminho: string): boolean {
  const m = metodo.toUpperCase();
  const c = normalizar(caminho);
  if (m === "GET") return ROTAS_LIDAS.some((r) => r.toLowerCase() === c);
  if (m === "POST") return ROTAS_CONSULTA_POST.some((r) => r.toLowerCase() === c);
  return false;
}

export type Ambiente = Record<string, string | undefined>;

export type Dependencias = {
  env: Ambiente;
  fetchFn: typeof fetch;
  esperaMs: number;
  tentativas: number;
  tempoLimiteMs: number;
};

const PADRAO = { esperaMs: 800, tentativas: 3, tempoLimiteMs: 20000 };

function juntar(d: Partial<Dependencias>): Dependencias {
  return {
    env: d.env ?? process.env,
    fetchFn: d.fetchFn ?? fetch,
    esperaMs: d.esperaMs ?? PADRAO.esperaMs,
    tentativas: d.tentativas ?? PADRAO.tentativas,
    tempoLimiteMs: d.tempoLimiteMs ?? PADRAO.tempoLimiteMs,
  };
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Parametros = Record<string, string | number | boolean | null | undefined>;

export function montarUrl(caminho: string, params: Parametros = {}): string {
  const url = new URL(caminho.replace(/^\/+/, ""), URL_API);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  return url.toString();
}

/** Fetch com tempo limite; erros de rede viram ErroSecullum sem expor o endereço completo nem dados. */
async function requisitar(dep: Dependencias, url: string, init: RequestInit): Promise<Response> {
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), dep.tempoLimiteMs);
  try {
    return await dep.fetchFn(url, { ...init, signal: controle.signal, cache: "no-store" });
  } catch (e) {
    if ((e as { name?: string }).name === "AbortError") throw new ErroSecullum("TEMPO_ESGOTADO", "O Secullum demorou demais para responder.");
    throw new ErroSecullum("ERRO_DE_REDE", "Não foi possível falar com o Secullum.");
  } finally {
    clearTimeout(relogio);
  }
}

function erroDoStatus(status: number, detalhe: string): ErroSecullum {
  if (status === 401 || status === 403) return new ErroSecullum("NAO_AUTORIZADO", "O Secullum recusou o acesso (login inválido, conta não autorizada no banco ou sem permissão).", status);
  if (status === 400) return new ErroSecullum("REQUISICAO_INVALIDA", `O Secullum não aceitou o pedido${detalhe ? `: ${detalhe}` : "."}`, status);
  if (status === 429) return new ErroSecullum("LIMITE_DE_CHAMADAS", "O Secullum pediu para esperar (limite de chamadas).", status);
  return new ErroSecullum("ERRO_DO_SERVIDOR", `O Secullum respondeu com erro ${status}.`, status);
}

/** Mensagem do HTTP 400 do Secullum: lista de { Property, Message } (só os textos de validação, sem dados). */
async function detalheDoErro(resp: Response): Promise<string> {
  try {
    const corpo = (await resp.json()) as unknown;
    if (Array.isArray(corpo)) {
      return corpo
        .map((e) => (e && typeof e === "object" ? `${String((e as Record<string, unknown>).Property ?? "")}: ${String((e as Record<string, unknown>).Message ?? "")}` : ""))
        .filter(Boolean)
        .join("; ")
        .slice(0, 300);
    }
  } catch {
    /* sem detalhe */
  }
  return "";
}

// ---------------------------------------------------------------- autenticação

export function credenciais(env: Ambiente = process.env): { usuario: string; senha: string } {
  const usuario = env[VARIAVEL_USUARIO]?.trim();
  const senha = env[VARIAVEL_SENHA];
  if (!usuario || !senha) throw new ErroSecullum("SEM_CONFIGURACAO", `As variáveis ${VARIAVEL_USUARIO} e ${VARIAVEL_SENHA} não estão configuradas.`);
  return { usuario, senha };
}

/** Pede o token de acesso. A senha só aparece no corpo da requisição; nunca em mensagem de erro. */
export async function obterToken(dependencias: Partial<Dependencias> = {}): Promise<string> {
  const dep = juntar(dependencias);
  const { usuario, senha } = credenciais(dep.env);
  const corpo = new URLSearchParams({ grant_type: "password", username: usuario, password: senha, client_id: "3" });
  const resp = await requisitar(dep, `${URL_AUTENTICADOR}/Token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: corpo.toString(),
  });
  if (!resp.ok) {
    if (resp.status === 400 || resp.status === 401 || resp.status === 403) {
      throw new ErroSecullum("NAO_AUTORIZADO", "Login recusado pelo Secullum: confira o e-mail e a senha da conta da integração.", resp.status);
    }
    throw erroDoStatus(resp.status, "");
  }
  try {
    const json = (await resp.json()) as { access_token?: unknown };
    if (typeof json.access_token !== "string" || json.access_token === "") throw new Error("sem token");
    return json.access_token;
  } catch {
    throw new ErroSecullum("RESPOSTA_INVALIDA", "O Secullum respondeu ao login sem um token válido.", resp.status);
  }
}

export type BancoSecullum = { id: number | string; identificador: string; nome: string };

export async function listarBancos(token: string, dependencias: Partial<Dependencias> = {}): Promise<BancoSecullum[]> {
  const dep = juntar(dependencias);
  const resp = await requisitar(dep, `${URL_AUTENTICADOR}/ContasSecullumExterno/ListarBancos/`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!resp.ok) throw erroDoStatus(resp.status, await detalheDoErro(resp));
  try {
    const lista = (await resp.json()) as unknown;
    if (!Array.isArray(lista)) throw new Error("não é lista");
    return lista.map((b) => {
      const o = b as Record<string, unknown>;
      return { id: (o.id as number | string) ?? "", identificador: String(o.identificador ?? ""), nome: String(o.nome ?? o.razaoSocial ?? "") };
    });
  } catch {
    throw new ErroSecullum("RESPOSTA_INVALIDA", "A lista de bancos veio em formato inesperado.", resp.status);
  }
}

/**
 * Valores possíveis do cabeçalho `secullumidbancoselecionado` para um banco, em ordem de tentativa.
 * O Swagger manda usar o `id`; o manual diz que o `identificador` deve ir só com letras e números.
 */
export function candidatosDoCabecalhoBanco(banco: BancoSecullum): string[] {
  const lista = [String(banco.id), banco.identificador.replace(/[^a-zA-Z0-9]/g, "")].filter((v) => v !== "");
  return [...new Set(lista)];
}

// ---------------------------------------------------------------- sessão e chamadas

/**
 * Sessão para uma conta e um banco. Guarda o token em memória (nunca em disco ou log) e, se o Secullum responder 401,
 * pede um token novo UMA vez e repete a chamada.
 */
export class SessaoSecullum {
  private token: string | null = null;
  private dep: Dependencias;
  constructor(
    private bancoCabecalho: string,
    dependencias: Partial<Dependencias> = {},
  ) {
    this.dep = juntar(dependencias);
  }

  private async garantirToken(renovar = false): Promise<string> {
    if (!this.token || renovar) this.token = await obterToken(this.dep);
    return this.token;
  }

  /** GET (ou o POST de consulta `Calcular`). Rotas de escrita lançam ROTA_BLOQUEADA antes de qualquer chamada. */
  async chamar(metodo: "GET" | "POST", caminho: string, params: Parametros = {}, corpo?: unknown): Promise<unknown> {
    if (!rotaPermitida(metodo, caminho)) {
      throw new ErroSecullum("ROTA_BLOQUEADA", `A rota ${metodo} ${caminho} não é permitida: esta integração só lê dados.`);
    }
    const url = montarUrl(caminho, params);
    const ehLeitura = metodo === "GET";
    const maximo = ehLeitura ? this.dep.tentativas : 1; // consulta de cálculo tem limite por hora: não repetir sozinha
    let reautenticou = false;
    let ultimo: ErroSecullum | null = null;

    for (let tentativa = 1; tentativa <= maximo; tentativa++) {
      const token = await this.garantirToken();
      let resp: Response;
      try {
        resp = await requisitar(this.dep, url, {
          method: metodo,
          headers: {
            Authorization: `Bearer ${token}`,
            secullumidbancoselecionado: this.bancoCabecalho,
            "Accept-Language": "pt-BR",
            Accept: "application/json",
            ...(metodo === "POST" ? { "Content-Type": "application/json; charset=utf-8" } : {}),
          },
          body: metodo === "POST" ? JSON.stringify(corpo ?? {}) : undefined,
        });
      } catch (e) {
        ultimo = e as ErroSecullum;
        if (tentativa < maximo) await dormir(this.dep.esperaMs * 2 ** (tentativa - 1));
        continue;
      }
      if (resp.ok) {
        try {
          return await resp.json();
        } catch {
          throw new ErroSecullum("RESPOSTA_INVALIDA", "O Secullum respondeu algo que não é JSON.", resp.status);
        }
      }
      if (resp.status === 401 && !reautenticou) {
        reautenticou = true; // uma única reautenticação controlada
        await this.garantirToken(true);
        tentativa -= 1;
        continue;
      }
      ultimo = erroDoStatus(resp.status, await detalheDoErro(resp));
      const repetir = ehLeitura && (resp.status === 429 || resp.status >= 500);
      if (!repetir) throw ultimo;
      if (tentativa < maximo) {
        const aguardar = Number(resp.headers.get("retry-after"));
        await dormir(Number.isFinite(aguardar) && aguardar > 0 ? Math.min(aguardar, 10) * 1000 : this.dep.esperaMs * 2 ** (tentativa - 1));
      }
    }
    throw ultimo ?? new ErroSecullum("ERRO_DE_REDE", "Não foi possível falar com o Secullum.");
  }

  obter(caminho: string, params: Parametros = {}) {
    return this.chamar("GET", caminho, params);
  }
}

// ---------------------------------------------------------------- inspeção de estrutura (sem dados pessoais)

export type CampoVisto = { campo: string; tipos: string[] };

const tipoDe = (v: unknown) => (v === null ? "null" : Array.isArray(v) ? "lista" : typeof v === "object" ? "objeto" : typeof v);

/** Nomes e tipos dos campos de uma lista de objetos (união das primeiras linhas). Nunca devolve valores. */
export function camposDe(lista: unknown, amostra = 50): CampoVisto[] {
  if (!Array.isArray(lista)) return [];
  const mapa = new Map<string, Set<string>>();
  for (const item of lista.slice(0, amostra)) {
    if (!item || typeof item !== "object") continue;
    for (const [k, v] of Object.entries(item as Record<string, unknown>)) {
      if (!mapa.has(k)) mapa.set(k, new Set());
      mapa.get(k)!.add(tipoDe(v));
    }
  }
  return [...mapa.entries()].map(([campo, tipos]) => ({ campo, tipos: [...tipos].sort() }));
}

/** Procura um campo sem diferenciar maiúsculas (a API mistura "Id" e "id"). */
export function valorDoCampo(obj: unknown, nome: string): unknown {
  if (!obj || typeof obj !== "object") return undefined;
  const chave = Object.keys(obj as object).find((k) => k.toLowerCase() === nome.toLowerCase());
  return chave === undefined ? undefined : (obj as Record<string, unknown>)[chave];
}

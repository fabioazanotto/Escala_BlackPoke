// ESCRITA no Secullum Ponto Web (API de integração externa). Roda só no servidor.
//
// Separada da leitura de propósito: usa OUTRA conta (variáveis SECULLUM_ESCRITA_USUARIO e SECULLUM_ESCRITA_SENHA) e uma lista
// fixa de operações. Qualquer outra rota é recusada AQUI antes de qualquer chamada. Nunca entram: apagar funcionário, empresa,
// horário ou cadastro, nem criar/alterar funcionário. Contrato conferido no manual oficial: veja docs/secullum-api.md.

import { ErroSecullum, detalheDoErro, erroDoStatus, juntar, montarUrl, obterToken, requisitar, type Ambiente, type Dependencias } from "./secullum";

export const VARIAVEL_USUARIO_ESCRITA = "SECULLUM_ESCRITA_USUARIO";
export const VARIAVEL_SENHA_ESCRITA = "SECULLUM_ESCRITA_SENHA";

/** As ÚNICAS operações de escrita liberadas nesta etapa. */
export const ROTAS_ESCRITA = [
  { metodo: "POST", caminho: "CartaoPonto/Justificativa" }, // justificar um grupo de batidas do dia
  { metodo: "DELETE", caminho: "CartaoPonto" }, // apagar a justificativa (ou valor) de uma coluna
  { metodo: "POST", caminho: "FuncionariosAfastamentos" }, // lançar afastamento
  { metodo: "DELETE", caminho: "FuncionariosAfastamentos/Cpf" }, // apagar afastamento
] as const;

const normalizar = (c: string) => c.replace(/^\/+/, "").replace(/\/+$/, "").toLowerCase();

export function rotaDeEscritaPermitida(metodo: string, caminho: string): boolean {
  const m = metodo.toUpperCase();
  const c = normalizar(caminho);
  return ROTAS_ESCRITA.some((r) => r.metodo === m && r.caminho.toLowerCase() === c);
}

export function credenciaisDeEscrita(env: Ambiente = process.env): { usuario: string; senha: string } {
  const usuario = env[VARIAVEL_USUARIO_ESCRITA]?.trim();
  const senha = env[VARIAVEL_SENHA_ESCRITA];
  if (!usuario || !senha) throw new ErroSecullum("SEM_CONFIGURACAO", `As variáveis ${VARIAVEL_USUARIO_ESCRITA} e ${VARIAVEL_SENHA_ESCRITA} não estão configuradas na Vercel.`);
  return { usuario, senha };
}

export type RespostaEscrita = { status: number; corpo: unknown };

/** Sessão da conta de ESCRITA. Sem repetição automática (só uma reautenticação se o token vencer). */
export class SessaoSecullumEscrita {
  private token: string | null = null;
  private dep: Dependencias;
  constructor(
    private bancoCabecalho: string,
    dependencias: Partial<Dependencias> = {},
  ) {
    this.dep = juntar(dependencias);
  }

  private async garantirToken(renovar = false): Promise<string> {
    if (!this.token || renovar) {
      const { usuario, senha } = credenciaisDeEscrita(this.dep.env);
      this.token = await obterToken({ ...this.dep, env: { SECULLUM_USUARIO: usuario, SECULLUM_SENHA: senha } });
    }
    return this.token;
  }

  async escrever(metodo: "POST" | "DELETE", caminho: string, opcoes: { corpo?: unknown; params?: Record<string, string | number | undefined> } = {}): Promise<RespostaEscrita> {
    if (!rotaDeEscritaPermitida(metodo, caminho)) {
      throw new ErroSecullum("ROTA_BLOQUEADA", `A operação ${metodo} ${caminho} não está liberada para escrita.`);
    }
    const url = montarUrl(caminho, opcoes.params ?? {});
    let reautenticou = false;
    for (;;) {
      const token = await this.garantirToken();
      const resp = await requisitar(this.dep, url, {
        method: metodo,
        headers: {
          Authorization: `Bearer ${token}`,
          secullumidbancoselecionado: this.bancoCabecalho,
          "Accept-Language": "pt-BR",
          Accept: "application/json",
          ...(opcoes.corpo !== undefined ? { "Content-Type": "application/json; charset=utf-8" } : {}),
        },
        body: opcoes.corpo !== undefined ? JSON.stringify(opcoes.corpo) : undefined,
      });
      if (resp.status === 401 && !reautenticou) {
        reautenticou = true;
        await this.garantirToken(true);
        continue;
      }
      if (!resp.ok) throw erroDoStatus(resp.status, await detalheDoErro(resp));
      let corpo: unknown = null;
      try {
        const texto = await resp.text();
        corpo = texto ? (JSON.parse(texto) as unknown) : null;
      } catch {
        corpo = null; // resposta sem JSON (comum em escrita): o que vale é o status
      }
      return { status: resp.status, corpo };
    }
  }
}

// Sincronização das batidas do Secullum para o banco do BlackPoke (somente leitura no Secullum).
// Dependências por parâmetro, para testar sem rede nem banco.

import { somarDiasData } from "@/lib/vendas/datas";
import { traduzirLote, type MarcacaoNormalizada } from "./marcacoes";

export type TipoSync = "inicial" | "incremental" | "reprocesso";

export type ContagemGravacao = { novas: number; alteradas: number; iguais: number; removidas: number };

export type Registro = { id: string };

export type AmbienteSync = {
  hoje: () => string;
  /** Funcionário -> empresa, só das empresas incluídas no projeto. */
  funcionariosIncluidos: () => Promise<Map<number, number>>;
  lerPorPeriodo: (de: string, ate: string) => Promise<unknown[]>;
  lerAPartirDoId: (id: number) => Promise<unknown[]>;
  gravar: (marcacoes: MarcacaoNormalizada[], janela?: { de: string; ate: string }) => Promise<ContagemGravacao>;
  lerCursor: () => Promise<number | null>;
  gravarCursor: (id: number) => Promise<void>;
  /** Abre o registro e a trava. Devolve null se já existe uma rodada em andamento. */
  iniciar: (tipo: TipoSync, de: string | null, ate: string | null) => Promise<Registro | null>;
  concluir: (r: Registro, dados: Partial<ResultadoSync> & { status: "ok" | "erro"; mensagem?: string }) => Promise<void>;
};

export type ResultadoSync = {
  tipo: TipoSync;
  status: "ok" | "erro" | "ocupado";
  lidas: number;
  descartadas: number;
  novas: number;
  alteradas: number;
  removidas: number;
  mensagem?: string;
};

export const DIAS_CARGA_INICIAL = 90;
export const DIAS_REPROCESSO = 3;
export const DIAS_POR_JANELA = 7;
export const TAMANHO_PAGINA_FONTE = 5000; // limite documentado de FonteDados/APartirDoId

const vazio = (tipo: TipoSync): ResultadoSync => ({ tipo, status: "ok", lidas: 0, descartadas: 0, novas: 0, alteradas: 0, removidas: 0 });

function somar(a: ResultadoSync, lidas: number, descartadas: number, c: ContagemGravacao) {
  a.lidas += lidas;
  a.descartadas += descartadas;
  a.novas += c.novas;
  a.alteradas += c.alteradas;
  a.removidas += c.removidas;
}

const maiorId = (brutos: unknown[]) => brutos.reduce<number>((m, b) => Math.max(m, Number((b as { Id?: unknown })?.Id) || 0), 0);

export async function sincronizarPonto(tipo: TipoSync, amb: AmbienteSync): Promise<ResultadoSync> {
  const hoje = amb.hoje();
  const de = tipo === "inicial" ? somarDiasData(hoje, -(DIAS_CARGA_INICIAL - 1)) : tipo === "reprocesso" ? somarDiasData(hoje, -(DIAS_REPROCESSO - 1)) : null;
  const reg = await amb.iniciar(tipo, de, de ? hoje : null);
  if (!reg) return { ...vazio(tipo), status: "ocupado", mensagem: "Já existe uma sincronização em andamento." };

  const r = vazio(tipo);
  try {
    const incluidos = await amb.funcionariosIncluidos();
    if (incluidos.size === 0) throw new Error("Nenhum funcionário das empresas do projeto foi encontrado. Confira ponto_empresas e as permissões da conta.");
    let maior = 0;

    if (tipo === "incremental") {
      const cursor = await amb.lerCursor();
      if (cursor === null) throw new Error("Ainda não há carga inicial. Rode a carga inicial primeiro.");
      let proximo = cursor + 1;
      for (let pagina = 0; pagina < 100; pagina++) {
        const brutos = await amb.lerAPartirDoId(proximo);
        if (brutos.length === 0) break;
        const t = traduzirLote(brutos, incluidos);
        somar(r, brutos.length, t.foraDoProjeto + t.incompletas, t.marcacoes.length > 0 ? await amb.gravar(t.marcacoes) : { novas: 0, alteradas: 0, iguais: 0, removidas: 0 });
        maior = Math.max(maior, maiorId(brutos));
        if (brutos.length < TAMANHO_PAGINA_FONTE) break;
        proximo = maior + 1;
      }
      if (maior > cursor) await amb.gravarCursor(maior);
    } else if (tipo === "inicial") {
      // Janelas de 7 dias, da mais antiga para a mais nova: períodos longos de uma vez poderiam estourar limites não documentados.
      for (let ini = de!; ini <= hoje; ini = somarDiasData(ini, DIAS_POR_JANELA)) {
        const fim = somarDiasData(ini, DIAS_POR_JANELA - 1) > hoje ? hoje : somarDiasData(ini, DIAS_POR_JANELA - 1);
        const brutos = await amb.lerPorPeriodo(ini, fim);
        const t = traduzirLote(brutos, incluidos);
        somar(r, brutos.length, t.foraDoProjeto + t.incompletas, t.marcacoes.length > 0 ? await amb.gravar(t.marcacoes) : { novas: 0, alteradas: 0, iguais: 0, removidas: 0 });
        maior = Math.max(maior, maiorId(brutos));
      }
      const atual = await amb.lerCursor();
      if (maior > 0 && (atual === null || maior > atual)) await amb.gravarCursor(maior);
    } else {
      // Reprocesso: relê os últimos dias para pegar alterações, atrasos e remoções. Remoção só é aplicada se o Secullum devolveu algo
      // (uma resposta vazia por falha não pode marcar tudo como removido).
      const brutos = await amb.lerPorPeriodo(de!, hoje);
      const t = traduzirLote(brutos, incluidos);
      const aplicarRemocao = t.marcacoes.length > 0;
      somar(r, brutos.length, t.foraDoProjeto + t.incompletas, aplicarRemocao ? await amb.gravar(t.marcacoes, { de: de!, ate: hoje }) : { novas: 0, alteradas: 0, iguais: 0, removidas: 0 });
      if (!aplicarRemocao) r.mensagem = "O Secullum não devolveu batidas no período; nenhuma remoção foi aplicada.";
      // O reprocesso NÃO mexe no cursor: avançá-lo pularia batidas com ID menor ainda não lidas pela leitura incremental.
    }
    await amb.concluir(reg, { ...r, status: "ok" });
    return r;
  } catch (e) {
    const mensagem = (e as Error).message.slice(0, 400);
    await amb.concluir(reg, { ...r, status: "erro", mensagem }).catch(() => undefined);
    return { ...r, status: "erro", mensagem };
  }
}

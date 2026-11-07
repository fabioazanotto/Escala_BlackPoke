// Sincroniza as vendas do Xmenu para o banco, um dia de caixa por vez.
// As dependências entram por parâmetro para poder testar sem Xmenu nem banco de verdade.

import { LOJAS_XMENU, type LojaXmenu } from "@/config/lojas";
import type { VendaResumida } from "@/lib/tipos";
import { agregarVendas, type LinhaResumo } from "./agregar";
import { dataValida, somarDiasData, ultimosDias } from "./datas";

export type Origem = "automatica" | "manual" | "historico";

export type Pedido = {
  origem: Origem;
  dataDe?: string;
  dataAte?: string;
  lojas?: string[]; // chaves; vazio = todas
};

export type ResultadoLoja = {
  chave: string;
  nome: string;
  status: "ok" | "erro" | "sem_token";
  diasGravados: number;
  mensagem?: string;
};

export type Ambiente = {
  buscarVendas: (loja: LojaXmenu, dia: string) => Promise<VendaResumida[]>;
  gravarDia: (loja: LojaXmenu, dia: string, linhas: LinhaResumo[]) => Promise<void>;
  registrar: (loja: LojaXmenu, pedido: { origem: Origem; de: string; ate: string; status: "ok" | "erro"; dias: number; mensagem?: string }) => Promise<void>;
  tokenConfigurado: (loja: LojaXmenu) => boolean;
  hoje: () => string;
};

export const DIAS_AUTOMATICOS = 3; // hoje e os 2 dias anteriores (pega ajustes e cancelamentos tardios)
export const MAXIMO_DIAS = 95;

/** Define o intervalo final a sincronizar, validando datas e tamanho. */
export function intervaloDoPedido(pedido: Pedido, hoje: string): { de: string; ate: string } {
  if (pedido.dataDe || pedido.dataAte) {
    const de = pedido.dataDe ?? "";
    const ate = pedido.dataAte ?? hoje;
    if (!dataValida(de) || !dataValida(ate)) throw new Error("Datas inválidas.");
    if (de > ate) throw new Error("A data inicial é depois da final.");
    if (ate > hoje) throw new Error("Não é possível buscar datas futuras.");
    const dias = (Date.parse(ate) - Date.parse(de)) / 86400000 + 1;
    if (dias > MAXIMO_DIAS) throw new Error(`Período grande demais (máximo ${MAXIMO_DIAS} dias por vez).`);
    return { de, ate };
  }
  return { de: somarDiasData(hoje, -(DIAS_AUTOMATICOS - 1)), ate: hoje };
}

export async function sincronizarVendas(pedido: Pedido, amb: Ambiente): Promise<ResultadoLoja[]> {
  const hoje = amb.hoje();
  const { de, ate } = intervaloDoPedido(pedido, hoje);
  const dias = ultimosDias((Date.parse(ate) - Date.parse(de)) / 86400000 + 1, ate);
  const alvo = LOJAS_XMENU.filter((l) => !pedido.lojas?.length || pedido.lojas.includes(l.chave));

  const resultados: ResultadoLoja[] = [];
  // Lojas em paralelo (tokens e limites são por loja); dias em sequência dentro de cada loja.
  await Promise.all(
    alvo.map(async (loja) => {
      if (!amb.tokenConfigurado(loja)) {
        resultados.push({ chave: loja.chave, nome: loja.nome, status: "sem_token", diasGravados: 0, mensagem: "Token da loja não configurado." });
        return;
      }
      let gravados = 0;
      try {
        for (const dia of dias) {
          const vendas = await amb.buscarVendas(loja, dia);
          await amb.gravarDia(loja, dia, agregarVendas(vendas));
          gravados += 1;
        }
        await amb.registrar(loja, { origem: pedido.origem, de, ate, status: "ok", dias: gravados });
        resultados.push({ chave: loja.chave, nome: loja.nome, status: "ok", diasGravados: gravados });
      } catch (e) {
        const mensagem = (e as Error).message;
        await amb.registrar(loja, { origem: pedido.origem, de, ate, status: "erro", dias: gravados, mensagem }).catch(() => undefined);
        resultados.push({ chave: loja.chave, nome: loja.nome, status: "erro", diasGravados: gravados, mensagem });
      }
    }),
  );
  return resultados.sort((a, b) => a.nome.localeCompare(b.nome));
}

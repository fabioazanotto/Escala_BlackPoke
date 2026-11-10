// Completa o histórico de vendas aos poucos, do dia mais novo para o mais antigo, sem deixar buracos.
// A cada dia gravado o "marco" da loja anda um dia para trás; se algo falhar, o marco fica onde está
// e a próxima rodada continua dali.

import { LOJAS_XMENU, type LojaXmenu } from "@/config/lojas";
import { agregarVendas } from "./agregar";
import { somarDiasData } from "./datas";
import type { Ambiente, ResultadoLoja } from "./sincronizar";

export type AmbienteHistorico = Ambiente & {
  lerMarco: (loja: LojaXmenu) => Promise<string | null>;
  gravarMarco: (loja: LojaXmenu, dia: string) => Promise<void>;
};

export type ResultadoHistorico = ResultadoLoja & { marco: string | null; completo: boolean };

type Opcoes = { desde: string; diasPorRodada: number; lojas?: string[] };

export async function completarHistorico(amb: AmbienteHistorico, opcoes: Opcoes): Promise<ResultadoHistorico[]> {
  const hoje = amb.hoje();
  const alvo = LOJAS_XMENU.filter((l) => !opcoes.lojas?.length || opcoes.lojas.includes(l.chave));
  const resultados: ResultadoHistorico[] = [];

  // Uma loja por vez: o Xmenu limita as chamadas e não gosta de rajadas.
  for (const loja of alvo) {
    if (!amb.tokenConfigurado(loja)) {
      resultados.push({ chave: loja.chave, nome: loja.nome, status: "sem_token", diasGravados: 0, mensagem: "Token da loja não configurado.", marco: null, completo: false });
      continue;
    }
    // Sem marco: tudo a partir de (hoje - 2) já é coberto pela atualização automática dos últimos 3 dias.
    const inicial = await amb.lerMarco(loja);
    let marco = inicial ?? somarDiasData(hoje, -2);
    if (marco <= opcoes.desde) {
      resultados.push({ chave: loja.chave, nome: loja.nome, status: "ok", diasGravados: 0, marco, completo: true });
      continue;
    }

    const limite = somarDiasData(marco, -opcoes.diasPorRodada) < opcoes.desde ? opcoes.desde : somarDiasData(marco, -opcoes.diasPorRodada);
    let gravados = 0;
    let erro: string | undefined;
    for (let dia = somarDiasData(marco, -1); dia >= limite; dia = somarDiasData(dia, -1)) {
      try {
        const vendas = await amb.buscarVendas(loja, dia);
        await amb.gravarDia(loja, dia, agregarVendas(vendas));
        await amb.gravarMarco(loja, dia);
        marco = dia;
        gravados += 1;
      } catch (e) {
        erro = (e as Error).message;
        break;
      }
    }
    const feito = gravados > 0 || erro !== undefined;
    if (feito) {
      await amb
        .registrar(loja, { origem: "historico", de: marco, ate: somarDiasData(inicial ?? somarDiasData(hoje, -2), -1), status: erro ? "erro" : "ok", dias: gravados, mensagem: erro })
        .catch(() => undefined);
    }
    resultados.push({
      chave: loja.chave,
      nome: loja.nome,
      status: erro ? "erro" : "ok",
      diasGravados: gravados,
      mensagem: erro,
      marco,
      completo: !erro && marco <= opcoes.desde,
    });
  }
  return resultados;
}

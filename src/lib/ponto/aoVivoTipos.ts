// Formato que a rota /api/ponto/ao-vivo devolve e a tela usa. Só tipos (sem código).

import type { Avaliacao, Contagem } from "./aoVivo";

export type PessoaAoVivo = {
  chave: string;
  funcionarioId: number | null; // para abrir a tela do colaborador
  nome: string;
  loja: string | null;
  previsto: string | null; // "16:00–00:20"
  fontePrevisto: "escala" | "secullum" | null;
  batidas: { hora: string; manual: boolean }[];
  batidasExtras: number; // quantas batidas além das 4 mostradas
  avaliacao: Avaliacao;
  rotulo: string; // texto da situação
  escalaSituacao: string | null; // o que a escala diz (trabalha, folga, dobra...)
  foraDaEscala: boolean; // bateu ponto sem estar escalado para trabalhar
  semVinculo: boolean; // colaborador sem ligação com o Secullum: não dá para saber o que bateu
  unidade: string | null;
};

export type LojaAoVivo = {
  chave: string;
  nome: string;
  ponto: { pessoas: PessoaAoVivo[]; contagem: Contagem };
  escala: { pessoas: PessoaAoVivo[]; contagem: Contagem; foraDaEscala: PessoaAoVivo[] };
};

export type PainelAoVivo = {
  atualizadoEm: string; // ISO
  diaDeTrabalho: string; // yyyy-mm-dd
  horaAgora: string; // HH:mm no Brasil
  lojas: LojaAoVivo[];
  semVinculo: PessoaAoVivo[];
  escalaStatus: { unidade: string; status: string }[];
};

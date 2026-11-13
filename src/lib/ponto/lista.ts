// Lista de colaboradores do Ponto: situação de cada um agora, em palavras simples. Funções puras (testadas).
// Usa a mesma classificação da tela "Ponto ao vivo" (Avaliacao): as duas telas nunca divergem.
// Classificação operacional: não gera desconto nem falta oficial.

import { posicionar } from "./aoVivo";
import type { PainelAoVivo, PessoaAoVivo } from "./aoVivoTipos";

export type StatusLista = "trabalhando" | "intervalo" | "atrasado" | "ausente" | "justificado" | "fora" | "sem_info" | "desligado";

export type SituacaoDaLista = {
  status: StatusLista;
  rotulo: string;
  detalhe: string | null;
  previsto: string | null; // "16:00–00:20"
  ultimaBatida: string | null; // "Entrada 16:02"
  alerta: boolean; // intervalo passou do limite
};

const NOMES_BATIDA = ["Entrada", "Saída interv.", "Retorno", "Saída"];
const duracao = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}` : `${min} min`);

export type PessoasDoFuncionario = { escala?: PessoaAoVivo; ponto?: PessoaAoVivo };

/** Junta, por código do funcionário no Secullum, o que a escala de hoje e as batidas dizem. */
export function indicePorFuncionario(painel: PainelAoVivo | null): Map<number, PessoasDoFuncionario> {
  const m = new Map<number, PessoasDoFuncionario>();
  for (const l of painel?.lojas ?? []) {
    for (const p of l.escala.pessoas) if (p.funcionarioId !== null) m.set(p.funcionarioId, { ...m.get(p.funcionarioId), escala: p });
    for (const p of l.ponto.pessoas) if (p.funcionarioId !== null) m.set(p.funcionarioId, { ...m.get(p.funcionarioId), ponto: p });
  }
  return m;
}

function ultimaBatidaDe(p: PessoaAoVivo): string | null {
  if (p.batidas.length === 0) return null;
  if (p.batidasExtras > 0) return `${p.batidas[p.batidas.length - 1].hora} (+${p.batidasExtras})`;
  const slots = posicionar(p.batidas, p.avaliacao.retornoEmAberto);
  const i = slots.reduce((u, b, k) => (b ? k : u), 0);
  return `${NOMES_BATIDA[i]} ${slots[i]!.hora}`;
}

/** Situação de uma pessoa. A escala de hoje manda quando existe; senão vale a leitura só pelas batidas. */
export function situacaoDaLista(pessoas: PessoasDoFuncionario | undefined, ativo: boolean): SituacaoDaLista {
  const vazio = { previsto: null, ultimaBatida: null, alerta: false };
  if (!ativo) return { status: "desligado", rotulo: "Desligado", detalhe: null, ...vazio };
  const p = pessoas?.escala ?? pessoas?.ponto;
  if (!p) return { status: "sem_info", rotulo: "Sem informação", detalhe: "Ainda não li o ponto de hoje", ...vazio };

  const a = p.avaliacao;
  const base = { previsto: p.previsto, ultimaBatida: ultimaBatidaDe(p), alerta: false };
  const foraEscala = p.foraDaEscala ? "Fora da escala hoje" : null;
  const turno = p.turnoDeduzido ? `Turno da ${p.turnoDeduzido === "noite" ? "noite" : "manhã"} (deduzido pelas batidas)` : null;
  const juntar = (...t: (string | null)[]) => t.filter(Boolean).join(" · ") || null;

  switch (a.situacao) {
    case "trabalhando":
      return { ...base, status: "trabalhando", rotulo: "Trabalhando", detalhe: juntar(foraEscala, turno, a.atrasoMin !== null ? `Chegou ${a.atrasoMin} min depois do previsto` : null) };
    case "intervalo":
      return { ...base, status: "intervalo", rotulo: "Em intervalo", alerta: a.alertaIntervalo, detalhe: juntar(foraEscala, turno, a.minutosNoIntervalo !== null ? `Há ${duracao(a.minutosNoIntervalo)}${a.alertaIntervalo ? " ⚠ passou do limite" : ""}` : null) };
    case "atrasado_sem_registro":
      return { ...base, status: "atrasado", rotulo: "Atrasado", detalhe: a.minutosSemRegistro !== null ? `Sem registro há ${a.minutosSemRegistro} min` : "Sem registro" };
    case "ausente":
      return { ...base, status: "ausente", rotulo: "Ausente", detalhe: a.minutosSemRegistro !== null ? `Sem registro há ${a.minutosSemRegistro} min do horário` : "Sem registro" };
    case "falta":
      return { ...base, status: "ausente", rotulo: "Faltou", detalhe: "Turno terminou sem nenhuma batida" };
    case "justificado":
      return { ...base, status: "justificado", rotulo: a.motivo ? `Justificado: ${a.motivo}` : "Justificado", detalhe: null };
    case "encerrou":
      return { ...base, status: "fora", rotulo: "Fora do horário", detalhe: juntar(foraEscala, turno, "Turno encerrado", a.retornoEmAberto ? "Retorno do intervalo sem registro" : null) };
    case "folga":
      return { ...base, status: "fora", rotulo: "Fora do horário", detalhe: juntar(foraEscala, "Folga") };
    case "aguardando":
      return { ...base, status: "fora", rotulo: "Fora do horário", detalhe: "Ainda não começou" };
    case "sem_registro_desatualizado":
      return { ...base, status: "sem_info", rotulo: "Sem informação", detalhe: "Os dados do ponto podem estar desatualizados" };
    default:
      return { ...base, status: "fora", rotulo: "Fora do horário", detalhe: "Sem batida hoje" };
  }
}

export const ROTULO_CONTADOR: Record<Exclude<StatusLista, "desligado" | "sem_info" | "fora">, string> = {
  trabalhando: "trabalhando",
  intervalo: "em intervalo",
  atrasado: "atrasado",
  ausente: "ausente",
  justificado: "justificado",
};

/** "3 trabalhando · 1 em intervalo": só o que tem alguém, na ordem de atenção. */
export function resumoDoGrupo(situacoes: SituacaoDaLista[]): { status: StatusLista; texto: string }[] {
  const ordem: (keyof typeof ROTULO_CONTADOR)[] = ["ausente", "atrasado", "intervalo", "trabalhando", "justificado"];
  const fora = situacoes.filter((s) => s.status === "fora").length;
  const itens = ordem.flatMap((st) => {
    const n = situacoes.filter((s) => s.status === st).length;
    return n > 0 ? [{ status: st as StatusLista, texto: `${n} ${ROTULO_CONTADOR[st]}` }] : [];
  });
  if (fora > 0) itens.push({ status: "fora", texto: `${fora} fora do horário` });
  return itens;
}

export type ItemLista = { id: number; nome: string; empresa: string; lojaChave: string | null; loja: string; ativo: boolean };
export type GrupoLista = { chave: string; titulo: string; itens: (ItemLista & { situacao: SituacaoDaLista })[] };

const ORDEM_LOJAS = ["santos", "miyagi", "pg", "abc"];
const SEM_ACENTO = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Agrupa por empresa (e loja), em ordem alfabética dentro de cada grupo. Filtra por loja, busca e desligados. */
export function montarGrupos(funcionarios: ItemLista[], painel: PainelAoVivo | null, filtro: { lojaChave: string | null; busca: string; desligados: boolean }): GrupoLista[] {
  const indice = indicePorFuncionario(painel);
  const termo = SEM_ACENTO(filtro.busca.trim());
  const grupos = new Map<string, GrupoLista & { ordem: number }>();
  for (const f of funcionarios) {
    if (!f.ativo && !filtro.desligados) continue;
    if (filtro.lojaChave !== null && f.lojaChave !== filtro.lojaChave) continue;
    if (termo && !SEM_ACENTO(f.nome).includes(termo)) continue;
    const chave = `${f.lojaChave ?? "sem"}|${f.empresa}`;
    const g = grupos.get(chave) ?? { chave, titulo: f.lojaChave ? `${f.loja.replace("BlackPoke ", "")} · ${f.empresa}` : f.empresa || "Sem loja", itens: [], ordem: f.lojaChave ? (ORDEM_LOJAS.indexOf(f.lojaChave) + 1 || 99) : 100 };
    g.itens.push({ ...f, situacao: situacaoDaLista(indice.get(f.id), f.ativo) });
    grupos.set(chave, g);
  }
  return [...grupos.values()]
    .sort((a, b) => a.ordem - b.ordem || a.titulo.localeCompare(b.titulo, "pt-BR"))
    .map((g) => ({ chave: g.chave, titulo: g.titulo, itens: g.itens.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")) }));
}

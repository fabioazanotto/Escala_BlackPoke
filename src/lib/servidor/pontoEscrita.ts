// ESCRITA no Secullum a partir de uma tela do BlackPoke (justificar falta e afastamentos). Só no servidor.
// Fluxo de toda ação: valida → mostra a PRÉVIA do que vai mudar → só grava com confirmação → relê o Secullum para conferir → registra auditoria.
// Só o creator chega aqui (a rota confere) e, no modo teste, só para o funcionário de teste. Nunca registra CPF, PIS nem senha.

import type { SupabaseClient } from "@supabase/supabase-js";
import { MODO_TESTE_ESCRITA } from "@/config/escrita";
import { ErroSecullum, valorDoCampo } from "@/lib/integracoes/secullum";
import { SessaoSecullumEscrita } from "@/lib/integracoes/secullumEscrita";
import { agoraNoBrasil, diaDeTrabalho } from "@/lib/ponto/aoVivo";
import {
  corpoAfastamento, corpoApagarColuna, corpoJustificar, diaSemanaSecullum, estadoDoDia, gruposDoHorarioDoDia, lerAfastamentos, liberadoParaEscrita, listarJustificativas,
  paramsApagarAfastamento, periodosSeSobrepoem, validarDiaDaFalta, validarData, validarPeriodo, type AfastamentoLido, type Justificativa,
} from "@/lib/ponto/escrita";
import { somarDiasData } from "@/lib/vendas/datas";
import { comCache, limparCachePorPrefixo } from "./cacheCurto";
import { carregarContexto, traduzirFuncionarios } from "./pontoDados";

export class ErroEscrita extends Error {}

export type Pedido =
  | { acao: "opcoes" }
  | { acao: "listar_afastamentos"; funcionario: number }
  | { acao: "justificar"; funcionario: number; dia: string; justificativa: string; confirmar?: boolean }
  | { acao: "remover_justificativa"; funcionario: number; dia: string; confirmar?: boolean }
  | { acao: "afastamento"; funcionario: number; inicio: string; fim: string; justificativa: string; motivo?: string; confirmar?: boolean }
  | { acao: "remover_afastamento"; funcionario: number; inicio: string; fim: string; confirmar?: boolean };

export type Previa = { titulo: string; linhas: string[]; avisos: string[] };
export type ResultadoEscrita = { ok: boolean; mensagem: string; avisos: string[] };
export type RespostaEscrita = { modoTeste: boolean; justificativas?: Justificativa[]; afastamentos?: AfastamentoLido[]; previa?: Previa; resultado?: ResultadoEscrita };

const lista = (x: unknown) => (Array.isArray(x) ? x : []);
const texto = (x: unknown) => (typeof x === "string" ? x : "");
const digitos = (s: string) => s.replace(/\D/g, "");
const dataBR = (d: string) => d.split("-").reverse().join("/");
const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const nomeDoDia = (d: string) => DIAS[new Date(`${d}T00:00:00Z`).getUTCDay()];

type Quem = { nome: string };

async function preparar(db: SupabaseClient, funcionarioId: number) {
  if (!Number.isInteger(funcionarioId) || funcionarioId <= 0) throw new ErroEscrita("Informe o funcionário.");
  const { contexto } = await comCache("contexto", 10 * 60000, () => carregarContexto(db));
  const { sessao, empresas } = contexto;
  const [funcsBrutos, horariosBrutos] = await Promise.all([comCache("funcionarios", 10 * 60000, () => sessao.obter("Funcionarios")), comCache("horarios", 10 * 60000, () => sessao.obter("Horarios"))]);
  const f = traduzirFuncionarios(lista(funcsBrutos), empresas).funcionarios.find((x) => x.id === funcionarioId);
  if (!f) throw new ErroEscrita("Funcionário não encontrado nas empresas do projeto.");
  const bloqueio = liberadoParaEscrita(f.nome, MODO_TESTE_ESCRITA);
  if (bloqueio) throw new ErroEscrita(bloqueio);
  const cpf = digitos(f.cpf);
  if (cpf.length !== 11) throw new ErroEscrita("Este funcionário não tem CPF no Secullum.");
  const { data: bancos } = await db.from("ponto_bancos").select("secullum_id").eq("ativo", true);
  if (!bancos || bancos.length !== 1) throw new ErroEscrita("Configure exatamente um banco ativo do Secullum (tabela ponto_bancos).");
  const bruto = lista(funcsBrutos).find((x) => Number(valorDoCampo(x, "Id")) === funcionarioId);
  const horario = lista(horariosBrutos).find((h) => Number(valorDoCampo(h, "Id")) === Number(valorDoCampo(bruto, "HorarioId")));
  const justificativas = listarJustificativas(await comCache("justificativas", 10 * 60000, () => sessao.obter("Justificativas")));
  return {
    contexto, f, cpf, cpfSecullum: f.cpf, horario, justificativas,
    escrita: new SessaoSecullumEscrita(String(bancos[0].secullum_id)),
    hoje: diaDeTrabalho(agoraNoBrasil()).dia,
  };
}
type Preparado = Awaited<ReturnType<typeof preparar>>;

async function lerDia(p: Preparado, dia: string) {
  const r = await p.contexto.sessao.obter("Batidas", { dataInicio: dia, dataFim: dia, funcionarioCpf: p.cpf });
  const linha = lista(r).find((l) => Number(valorDoCampo(l, "FuncionarioId")) === p.f.id && texto(valorDoCampo(l, "Data")).slice(0, 10) === dia);
  return estadoDoDia(linha);
}

async function lerAfastamentosDe(p: Preparado, de: string, ate: string) {
  return lerAfastamentos(await p.contexto.sessao.obter("FuncionariosAfastamentos", { dataInicio: de, dataFim: ate, funcionarioCpf: p.cpf }));
}

function invalidar(p: Preparado) {
  limparCachePorPrefixo(`mes:${p.f.id}:`);
  limparCachePorPrefixo("batidas:");
  limparCachePorPrefixo("afast:");
  limparCachePorPrefixo("fonte:");
}

async function registrar(db: SupabaseClient, quem: Quem, p: Preparado, acao: string, inicio: string, fim: string | null, detalhe: Record<string, unknown>, status: "ok" | "parcial" | "erro", mensagem: string) {
  try {
    await db.from("secullum_escritas").insert({ lancado_por_nome: quem.nome, funcionario_ponto_id: p.f.id, nome_registrado: p.f.nome, acao, dia_inicio: inicio, dia_fim: fim, detalhe, status, mensagem: mensagem.slice(0, 500) });
  } catch {
    /* a auditoria nunca derruba a ação; a falha aparece nos logs do banco */
  }
}

const mensagemDe = (e: unknown) => (e instanceof ErroSecullum || e instanceof ErroEscrita || e instanceof Error ? e.message : "Erro inesperado.");

// ---------------------------------------------------------------- ações

async function justificar(db: SupabaseClient, quem: Quem, pedido: Extract<Pedido, { acao: "justificar" }>): Promise<RespostaEscrita> {
  const p = await preparar(db, pedido.funcionario);
  const erroDia = validarDiaDaFalta(pedido.dia, p.hoje);
  if (erroDia) throw new ErroEscrita(erroDia);
  const just = p.justificativas.find((j) => j.abreviada === pedido.justificativa);
  if (!just) throw new ErroEscrita("Escolha uma justificativa da lista do Secullum.");

  const estado = await lerDia(p, pedido.dia);
  if (estado.batidas.length > 0) throw new ErroEscrita(`Este dia tem batida no Secullum (${estado.batidas.map((b) => b.hora).join(", ")}). Só dá para justificar dia sem batida.`);
  const { grupos: doHorario, folga } = gruposDoHorarioDoDia(p.horario, diaSemanaSecullum(pedido.dia));
  if (folga) throw new ErroEscrita("O horário do Secullum marca este dia como folga: não precisa justificar.");
  const avisos: string[] = [];
  const grupos = doHorario.length > 0 ? doHorario : [1];
  if (doHorario.length === 0) avisos.push("Não achei os horários deste dia no Secullum: vou justificar só o grupo 1 (Entrada 1 e Saída 1).");
  if (estado.justificativas.length > 0) avisos.push(`O dia já tem justificativa (${[...new Set(estado.justificativas.map((j) => j.texto))].join(", ")}): será substituída.`);

  const previa: Previa = {
    titulo: "Justificar falta no Secullum",
    linhas: [`Funcionário: ${p.f.nome}`, `Dia: ${dataBR(pedido.dia)} (${nomeDoDia(pedido.dia)})`, `Justificativa: ${just.abreviada}${just.completa ? ` — ${just.completa}` : ""}`, `Grupos de batidas: ${grupos.join(" e ")} (${grupos.map((g) => `Entrada ${g}/Saída ${g}`).join(", ")})`],
    avisos,
  };
  if (!pedido.confirmar) return { modoTeste: MODO_TESTE_ESCRITA, previa };

  const aplicados: number[] = [];
  try {
    for (const g of grupos) {
      await p.escrita.escrever("POST", "CartaoPonto/Justificativa", { corpo: corpoJustificar(p.cpfSecullum, pedido.dia, g, just.abreviada) });
      aplicados.push(g);
    }
  } catch (e) {
    const falhas: string[] = [];
    for (const g of aplicados) {
      try {
        await p.escrita.escrever("DELETE", "CartaoPonto", { corpo: corpoApagarColuna(p.cpfSecullum, pedido.dia, `Entrada${g}`, "Desfeito pelo BlackPoke: falha ao justificar o resto do dia") });
      } catch {
        falhas.push(`grupo ${g}`);
      }
    }
    const msg = `${mensagemDe(e)}${aplicados.length ? (falhas.length ? ` Atenção: não consegui desfazer ${falhas.join(", ")}; confira o cartão no Secullum.` : " Os grupos já gravados foram desfeitos.") : ""}`;
    await registrar(db, quem, p, "justificar", pedido.dia, null, { justificativa: just.abreviada, grupos, aplicados }, falhas.length ? "parcial" : "erro", msg);
    invalidar(p);
    throw new ErroEscrita(msg);
  }

  const depois = await lerDia(p, pedido.dia).catch(() => null);
  const conferido = depois !== null && grupos.every((g) => depois.justificativas.some((j) => j.grupo === g));
  invalidar(p);
  const mensagem = conferido ? "Justificativa gravada e conferida no Secullum." : "Gravei no Secullum, mas não consegui conferir agora. Abra o cartão no Secullum para ver.";
  await registrar(db, quem, p, "justificar", pedido.dia, null, { justificativa: just.abreviada, grupos, conferido }, "ok", mensagem);
  return { modoTeste: MODO_TESTE_ESCRITA, resultado: { ok: true, mensagem, avisos: conferido ? [] : ["Conferência pendente."] } };
}

async function removerJustificativa(db: SupabaseClient, quem: Quem, pedido: Extract<Pedido, { acao: "remover_justificativa" }>): Promise<RespostaEscrita> {
  const p = await preparar(db, pedido.funcionario);
  const erroDia = validarData(pedido.dia, p.hoje);
  if (erroDia) throw new ErroEscrita(erroDia);
  const estado = await lerDia(p, pedido.dia);
  const grupos = [...new Set(estado.justificativas.map((j) => j.grupo))];
  if (grupos.length === 0) throw new ErroEscrita("Não há justificativa no Secullum neste dia.");
  const previa: Previa = {
    titulo: "Remover justificativa no Secullum",
    linhas: [`Funcionário: ${p.f.nome}`, `Dia: ${dataBR(pedido.dia)} (${nomeDoDia(pedido.dia)})`, `Justificativa atual: ${[...new Set(estado.justificativas.map((j) => j.texto))].join(", ")}`, `Grupos: ${grupos.join(" e ")}`],
    avisos: estado.batidas.length > 0 ? ["As batidas do dia não serão tocadas."] : [],
  };
  if (!pedido.confirmar) return { modoTeste: MODO_TESTE_ESCRITA, previa };

  const motivo = "Justificativa removida pelo BlackPoke";
  try {
    for (const g of grupos) {
      await p.escrita.escrever("DELETE", "CartaoPonto", { corpo: corpoApagarColuna(p.cpfSecullum, pedido.dia, `Entrada${g}`, motivo) });
    }
    // Se o Secullum deixou texto na coluna de saída do grupo, apaga também (só coluna que ainda tem justificativa).
    const meio = await lerDia(p, pedido.dia);
    for (const j of meio.justificativas) await p.escrita.escrever("DELETE", "CartaoPonto", { corpo: corpoApagarColuna(p.cpfSecullum, pedido.dia, j.coluna, motivo) });
  } catch (e) {
    const msg = mensagemDe(e);
    await registrar(db, quem, p, "remover_justificativa", pedido.dia, null, { grupos }, "erro", msg);
    invalidar(p);
    throw new ErroEscrita(msg);
  }
  const depois = await lerDia(p, pedido.dia).catch(() => null);
  const conferido = depois !== null && depois.justificativas.length === 0;
  invalidar(p);
  const mensagem = conferido ? "Justificativa removida e conferida no Secullum." : "Pedi a remoção, mas não consegui conferir. Abra o cartão no Secullum para ver.";
  await registrar(db, quem, p, "remover_justificativa", pedido.dia, null, { grupos, conferido }, "ok", mensagem);
  return { modoTeste: MODO_TESTE_ESCRITA, resultado: { ok: true, mensagem, avisos: [] } };
}

async function afastamento(db: SupabaseClient, quem: Quem, pedido: Extract<Pedido, { acao: "afastamento" }>): Promise<RespostaEscrita> {
  const p = await preparar(db, pedido.funcionario);
  const erroPeriodo = validarPeriodo(pedido.inicio, pedido.fim, p.hoje);
  if (erroPeriodo) throw new ErroEscrita(erroPeriodo);
  const just = p.justificativas.find((j) => j.abreviada === pedido.justificativa);
  if (!just) throw new ErroEscrita("Escolha uma justificativa da lista do Secullum.");
  const motivo = (pedido.motivo ?? "").trim().slice(0, 100);
  const existentes = (await lerAfastamentosDe(p, pedido.inicio, pedido.fim)).filter((a) => periodosSeSobrepoem(a, pedido));
  if (existentes.length > 0) throw new ErroEscrita(`Já existe afastamento neste período (${existentes.map((a) => `${dataBR(a.inicio)} a ${dataBR(a.fim)}`).join("; ")}). Apague-o antes.`);
  const previa: Previa = {
    titulo: "Lançar afastamento no Secullum",
    linhas: [`Funcionário: ${p.f.nome}`, `Período: ${dataBR(pedido.inicio)} a ${dataBR(pedido.fim)}`, `Justificativa: ${just.abreviada}${just.completa ? ` — ${just.completa}` : ""}`, ...(motivo ? [`Motivo: ${motivo}`] : [])],
    avisos: ["Dias com batida original podem continuar mostrando as batidas; o afastamento vale para o cálculo do Secullum."],
  };
  if (!pedido.confirmar) return { modoTeste: MODO_TESTE_ESCRITA, previa };

  try {
    await p.escrita.escrever("POST", "FuncionariosAfastamentos", { corpo: corpoAfastamento(p.cpfSecullum, pedido.inicio, pedido.fim, just.abreviada, motivo) });
  } catch (e) {
    const msg = mensagemDe(e);
    await registrar(db, quem, p, "afastamento", pedido.inicio, pedido.fim, { justificativa: just.abreviada }, "erro", msg);
    throw new ErroEscrita(msg);
  }
  const depois = await lerAfastamentosDe(p, pedido.inicio, pedido.fim).catch(() => null);
  const conferido = depois !== null && depois.some((a) => a.inicio === pedido.inicio && a.fim === pedido.fim);
  invalidar(p);
  const mensagem = conferido ? "Afastamento lançado e conferido no Secullum." : "Lancei no Secullum, mas não consegui conferir agora. Abra o cadastro no Secullum para ver.";
  await registrar(db, quem, p, "afastamento", pedido.inicio, pedido.fim, { justificativa: just.abreviada, conferido }, "ok", mensagem);
  return { modoTeste: MODO_TESTE_ESCRITA, resultado: { ok: true, mensagem, avisos: [] } };
}

async function removerAfastamento(db: SupabaseClient, quem: Quem, pedido: Extract<Pedido, { acao: "remover_afastamento" }>): Promise<RespostaEscrita> {
  const p = await preparar(db, pedido.funcionario);
  const erroPeriodo = validarPeriodo(pedido.inicio, pedido.fim, p.hoje);
  if (erroPeriodo) throw new ErroEscrita(erroPeriodo);
  const iguais = (await lerAfastamentosDe(p, pedido.inicio, pedido.fim)).filter((a) => a.inicio === pedido.inicio && a.fim === pedido.fim);
  if (iguais.length !== 1) throw new ErroEscrita(iguais.length === 0 ? "Não achei esse afastamento no Secullum (início e fim exatos)." : "Há mais de um afastamento com essas datas: apague pelo Secullum para não remover o errado.");
  const previa: Previa = {
    titulo: "Apagar afastamento no Secullum",
    linhas: [`Funcionário: ${p.f.nome}`, `Período: ${dataBR(pedido.inicio)} a ${dataBR(pedido.fim)}`, `Justificativa: ${iguais[0].justificativa}`],
    avisos: ["Para recuperar, é preciso lançar o afastamento de novo."],
  };
  if (!pedido.confirmar) return { modoTeste: MODO_TESTE_ESCRITA, previa };

  try {
    await p.escrita.escrever("DELETE", "FuncionariosAfastamentos/Cpf", { params: paramsApagarAfastamento(p.cpfSecullum, pedido.inicio, pedido.fim) });
  } catch (e) {
    const msg = mensagemDe(e);
    await registrar(db, quem, p, "remover_afastamento", pedido.inicio, pedido.fim, { justificativa: iguais[0].justificativa }, "erro", msg);
    throw new ErroEscrita(msg);
  }
  const depois = await lerAfastamentosDe(p, pedido.inicio, pedido.fim).catch(() => null);
  const conferido = depois !== null && !depois.some((a) => a.inicio === pedido.inicio && a.fim === pedido.fim);
  invalidar(p);
  const mensagem = conferido ? "Afastamento apagado e conferido no Secullum." : "Pedi para apagar, mas não consegui conferir. Abra o cadastro no Secullum para ver.";
  await registrar(db, quem, p, "remover_afastamento", pedido.inicio, pedido.fim, { justificativa: iguais[0].justificativa, conferido }, "ok", mensagem);
  return { modoTeste: MODO_TESTE_ESCRITA, resultado: { ok: true, mensagem, avisos: [] } };
}

// ---------------------------------------------------------------- entrada

export async function processarEscrita(db: SupabaseClient, quem: Quem, pedido: Pedido): Promise<RespostaEscrita> {
  switch (pedido.acao) {
    case "opcoes": {
      const { contexto } = await comCache("contexto", 10 * 60000, () => carregarContexto(db));
      const justificativas = listarJustificativas(await comCache("justificativas", 10 * 60000, () => contexto.sessao.obter("Justificativas")));
      return { modoTeste: MODO_TESTE_ESCRITA, justificativas };
    }
    case "listar_afastamentos": {
      const p = await preparar(db, pedido.funcionario);
      return { modoTeste: MODO_TESTE_ESCRITA, afastamentos: await lerAfastamentosDe(p, somarDiasData(p.hoje, -365), somarDiasData(p.hoje, 365)) };
    }
    case "justificar":
      return justificar(db, quem, pedido);
    case "remover_justificativa":
      return removerJustificativa(db, quem, pedido);
    case "afastamento":
      return afastamento(db, quem, pedido);
    case "remover_afastamento":
      return removerAfastamento(db, quem, pedido);
    default:
      throw new ErroEscrita("Ação desconhecida.");
  }
}

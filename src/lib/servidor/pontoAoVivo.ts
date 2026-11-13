// Monta o painel "ao vivo" do ponto: lê o Secullum na hora (só leitura) e cruza com a escala e os vínculos do BlackPoke.
// Só no servidor. Nunca afirma que alguém está fisicamente no local: classifica pelas batidas recebidas.

import type { SupabaseClient } from "@supabase/supabase-js";
import { LOJAS_XMENU } from "@/config/lojas";
import { valorDoCampo } from "@/lib/integracoes/secullum";
import { ROTULO_SITUACAO, ORDEM_SITUACAO, agoraNoBrasil, batidasDoDia, classificar, contar, deMinutos, diaDeTrabalho, inferirTurno, jornadaDe, type Avaliacao, type Jornada } from "@/lib/ponto/aoVivo";
import type { LojaAoVivo, PainelAoVivo, PessoaAoVivo } from "@/lib/ponto/aoVivoTipos";
import { somarDiasData } from "@/lib/vendas/datas";
import { comCache, reiniciarCache } from "./cacheCurto";
import { carregarContexto, traduzirFuncionarios, type ContextoPonto } from "./pontoDados";

const lista = (x: unknown) => (Array.isArray(x) ? x : []);
const texto = (x: unknown) => (typeof x === "string" ? x : "");
const digitos = (s: string) => s.replace(/\D/g, "");
const HORA = /^\d{1,2}[:.]\d{2}/;

/** Só para testes: esvazia o cache curto. */
export const reiniciarCacheAoVivo = reiniciarCache;

// ---------------------------------------------------------------- horário previsto no Secullum

/** DiaSemana do Secullum: segunda = 0 ... domingo = 6. */
const diaSemanaSecullum = (dia: string) => (new Date(`${dia}T00:00:00Z`).getUTCDay() + 6) % 7;

export function jornadaDoHorario(horario: unknown, dia: string): { jornada: Jornada | null; folga: boolean; texto: string | null } {
  const dow = diaSemanaSecullum(dia);
  const d = lista(valorDoCampo(horario, "Dias")).find((x) => Number(valorDoCampo(x, "DiaSemana")) === dow);
  if (!d) return { jornada: null, folga: false, texto: null };
  const horas: string[] = [];
  for (let i = 1; i <= 5; i++) {
    const e = texto(valorDoCampo(d, `Entrada${i}`));
    const s = texto(valorDoCampo(d, `Saida${i}`));
    if (HORA.test(e)) horas.push(e);
    if (HORA.test(s)) horas.push(s);
  }
  const folga = Number(valorDoCampo(d, "TipoDia")) === 2;
  if (horas.length < 2) return { jornada: null, folga, texto: folga ? null : null };
  const jornada = jornadaDe(horas[0], horas[horas.length - 1]);
  return { jornada, folga, texto: jornada ? `${deMinutos(jornada.inicio)}–${deMinutos(jornada.fim)}` : null };
}

// ---------------------------------------------------------------- montagem

type Ordenavel = { avaliacao: Avaliacao; nome: string };
const ordenar = <T extends Ordenavel>(l: T[]): T[] => [...l].sort((a, b) => ORDEM_SITUACAO.indexOf(a.avaliacao.situacao) - ORDEM_SITUACAO.indexOf(b.avaliacao.situacao) || a.nome.localeCompare(b.nome, "pt-BR"));

const ROTULO_ESCALA: Record<string, string> = { ferias: "Férias (escala)", afastamento: "Afastamento (escala)", indisponibilidade: "Indisponível (escala)" };

export async function montarAoVivo(db: SupabaseClient, agora = agoraNoBrasil()): Promise<PainelAoVivo> {
  const { dia, agoraMin } = diaDeTrabalho(agora);
  const seguinte = somarDiasData(dia, 1);
  const [ano, mes] = dia.split("-").map(Number);

  const contexto: ContextoPonto = (await comCache("contexto", 10 * 60000, () => carregarContexto(db))).contexto;
  const { sessao, empresas } = contexto;
  const lojaDaEmpresa = new Map(empresas.map((e) => [e.empresaId, e.lojaChave ?? null]));

  // Secullum (somente leitura): cadastros em cache de 10 min; batidas do dia em cache de 20 s.
  const [funcsBrutos, horariosBrutos, fonte, agrupadas, afastamentos] = await Promise.all([
    comCache("funcionarios", 10 * 60000, () => sessao.obter("Funcionarios")),
    comCache("horarios", 10 * 60000, () => sessao.obter("Horarios")),
    comCache(`fonte:${dia}`, 20000, () => sessao.obter("FonteDados", { dataInicio: dia, dataFim: seguinte })),
    comCache(`batidas:${dia}`, 20000, () => sessao.obter("Batidas", { dataInicio: dia, dataFim: dia })),
    comCache(`afast:${dia}`, 60000, () => sessao.obter("FuncionariosAfastamentos", { dataInicio: dia, dataFim: dia })),
  ]);

  const { funcionarios } = traduzirFuncionarios(lista(funcsBrutos), empresas);
  const ativos = funcionarios.filter((f) => f.ativo);
  const ativoPorId = new Map(ativos.map((f) => [f.id, f]));
  const horarioPorId = new Map(lista(horariosBrutos).map((h) => [Number(valorDoCampo(h, "Id")), h]));

  // Batidas por funcionário (só dos incluídos), traduzidas para o dia de trabalho.
  const registros = new Map<number, { data: string; hora: string; tipo: number }[]>();
  for (const r of lista(fonte)) {
    const id = Number(valorDoCampo(r, "FuncionarioId"));
    if (!ativoPorId.has(id)) continue;
    registros.set(id, [...(registros.get(id) ?? []), { data: texto(valorDoCampo(r, "Data")), hora: texto(valorDoCampo(r, "Hora")), tipo: Number(valorDoCampo(r, "Tipo")) }]);
  }

  // Folga e justificativas do dia (formato agrupado do Secullum) e afastamentos.
  const folgaSecullum = new Set<number>();
  const justificativa = new Map<number, string>();
  for (const l of lista(agrupadas)) {
    if (texto(valorDoCampo(l, "Data")).slice(0, 10) !== dia) continue;
    const id = Number(valorDoCampo(l, "FuncionarioId"));
    if (valorDoCampo(l, "Folga") === true) folgaSecullum.add(id);
    for (let i = 1; i <= 5; i++) for (const campo of [`Entrada${i}`, `Saida${i}`]) {
      const v = texto(valorDoCampo(l, campo)).trim();
      if (v && !HORA.test(v) && !justificativa.has(id)) justificativa.set(id, v);
    }
  }
  const porCpf = new Map(ativos.filter((f) => digitos(f.cpf).length === 11).map((f) => [digitos(f.cpf), f.id]));
  for (const a of lista(afastamentos)) {
    const id = porCpf.get(digitos(texto(valorDoCampo(a, "Cpf"))));
    if (id !== undefined && !justificativa.has(id)) justificativa.set(id, texto(valorDoCampo(a, "JustificativaNome")) || "Afastamento");
  }

  const batidasDe = (id: number) => batidasDoDia(registros.get(id) ?? [], dia);
  const mostrar = (b: { hora: string; manual: boolean }[]) => ({ batidas: b.slice(0, 4).map((x) => ({ hora: x.hora, manual: x.manual })), batidasExtras: Math.max(0, b.length - 4) });

  // ---------- BlackPoke: colaboradores, vínculos, escala e jornadas
  const [{ data: colabs }, { data: vincs }, { data: escalaDias }, { data: jornadas }] = await Promise.all([
    db.from("colaboradores").select("id, nome, turno, unidade_id, unidades(nome)").eq("ativo", true),
    db.from("colaborador_ponto_ids").select("colaborador_id, secullum_funcionario_id").eq("banco_id", contexto.bancoId).is("vigencia_fim", null),
    db.from("escala_dias").select("colaborador_id, situacao, escalas_mensais!inner(ano, mes, status, unidade_id, unidades(nome))").eq("data", dia).eq("escalas_mensais.ano", ano).eq("escalas_mensais.mes", mes),
    db.from("jornadas").select("unidade_id, turno, hora_inicio, hora_fim"),
  ]);
  const funcionarioDoColab = new Map((vincs ?? []).map((v) => [v.colaborador_id as string, Number(v.secullum_funcionario_id)]));
  const colabDoFuncionario = new Map((vincs ?? []).map((v) => [Number(v.secullum_funcionario_id), v.colaborador_id as string]));
  const situacaoEscala = new Map((escalaDias ?? []).map((d) => [d.colaborador_id as string, d.situacao as string]));
  const jornadaDaUnidade = (unidadeId: string, turno: string) => {
    const j = (jornadas ?? []).find((x) => x.unidade_id === unidadeId && x.turno === turno);
    return j ? jornadaDe(String(j.hora_inicio), String(j.hora_fim)) : null;
  };
  const statusEscala = new Map<string, string>();
  for (const d of escalaDias ?? []) {
    const em = d.escalas_mensais as unknown as { status: string; unidades?: { nome?: string } | null };
    statusEscala.set(em.unidades?.nome ?? "?", em.status);
  }

  const nomeLoja = (chave: string | null) => LOJAS_XMENU.find((l) => l.chave === chave)?.nome ?? chave ?? "Sem loja";
  const rotuloDe = (a: Avaliacao) => (a.situacao === "justificado" && a.motivo ? `Justificado: ${a.motivo}` : ROTULO_SITUACAO[a.situacao]);

  // ---------- Visão "Ponto": todos os ativos, só pelas batidas (nunca declara ausência: não sabe de folgas)
  const pontoPorLoja = new Map<string | null, PessoaAoVivo[]>();
  const trabalhadoresDeHoje = new Set<number>(); // quem tem batida
  for (const f of ativos) {
    const b = batidasDe(f.id);
    if (b.length > 0) trabalhadoresDeHoje.add(f.id);
    const h = horarioPorId.get(f.horarioId ?? -1);
    const previsto = h ? jornadaDoHorario(h, dia) : { jornada: null, folga: false, texto: null };
    let av = classificar({ jornada: previsto.jornada, batidas: b, agoraMin, folga: folgaSecullum.has(f.id), justificativa: justificativa.get(f.id) ?? null, confiavel: true });
    if (b.length === 0 && av.situacao !== "justificado" && av.situacao !== "folga") av = { ...av, situacao: "sem_batida", minutosSemRegistro: null };
    av = { ...av, atrasoMin: null };
    const loja = lojaDaEmpresa.get(f.empresaId) ?? null;
    const colab = colabDoFuncionario.get(f.id);
    const pessoa: PessoaAoVivo = {
      chave: `f${f.id}`, funcionarioId: f.id, nome: f.nome, loja, previsto: previsto.texto, fontePrevisto: previsto.texto ? "secullum" : null, ...mostrar(b), avaliacao: av, rotulo: rotuloDe(av),
      escalaSituacao: colab ? (situacaoEscala.get(colab) ?? null) : null, foraDaEscala: false, semVinculo: !colab, unidade: null,
    };
    pontoPorLoja.set(loja, [...(pontoPorLoja.get(loja) ?? []), pessoa]);
  }

  // ---------- Visão "Escala": quem deveria trabalhar hoje, comparado com as batidas
  const escalaPorLoja = new Map<string | null, PessoaAoVivo[]>();
  const semVinculo: PessoaAoVivo[] = [];
  const escalados = new Set<number>();
  for (const c of colabs ?? []) {
    const id = c.id as string;
    const sit = situacaoEscala.get(id);
    if (!sit || sit === "fora") continue;
    const unidade = ((c.unidades as unknown as { nome?: string } | null)?.nome as string | undefined) ?? null;
    const turno = String(c.turno);
    const unidadeId = c.unidade_id as string;
    let jornada: Jornada | null = null;
    if (sit === "trabalha") jornada = jornadaDaUnidade(unidadeId, turno);
    else if (sit === "dobra") {
      const d = jornadaDaUnidade(unidadeId, "dia");
      const n = jornadaDaUnidade(unidadeId, "noite");
      jornada = d && n ? { inicio: d.inicio, fim: n.fim } : (d ?? n);
    }
    const trabalha = sit === "trabalha" || sit === "dobra";
    const fid = funcionarioDoColab.get(id);
    const f = fid !== undefined ? ativoPorId.get(fid) : undefined;

    if (!f) {
      const av: Avaliacao = { situacao: "sem_batida", atrasoMin: null, minutosSemRegistro: null, minutosNoIntervalo: null, alertaIntervalo: false, intervaloCurtoMin: null, semRetorno: false, semSaida: false, retornoEmAberto: false, motivo: null };
      semVinculo.push({ chave: `c${id}`, funcionarioId: null, nome: String(c.nome), loja: null, previsto: jornada ? `${deMinutos(jornada.inicio)}–${deMinutos(jornada.fim)}` : null, fontePrevisto: "escala", batidas: [], batidasExtras: 0, avaliacao: av, rotulo: "Sem vínculo com o Secullum", escalaSituacao: sit, foraDaEscala: false, semVinculo: true, unidade });
      continue;
    }
    if (trabalha) escalados.add(f.id);
    const b = batidasDe(f.id);
    // Troca de turno só neste dia, deduzida pela primeira batida (antes dela não há como saber).
    let turnoDeduzido: "dia" | "noite" | null = null;
    if (sit === "trabalha" && jornada) {
      const outro = turno === "dia" ? "noite" : "dia";
      const alt = jornadaDaUnidade(unidadeId, outro);
      if (alt && inferirTurno(b, jornada, alt)) {
        jornada = alt;
        turnoDeduzido = outro;
      }
    }
    const motivoEscala = ROTULO_ESCALA[sit] ?? null;
    const just = justificativa.get(f.id) ?? motivoEscala ?? (folgaSecullum.has(f.id) && trabalha ? "Folga marcada no Secullum" : null);
    const av = classificar({ jornada: trabalha ? jornada : null, batidas: b, agoraMin, folga: !trabalha && !motivoEscala, justificativa: just, confiavel: true });
    const loja = lojaDaEmpresa.get(f.empresaId) ?? null;
    const pessoa: PessoaAoVivo = {
      chave: `c${id}`, funcionarioId: f.id, nome: String(c.nome), loja, previsto: trabalha && jornada ? `${deMinutos(jornada.inicio)}–${deMinutos(jornada.fim)}` : null, fontePrevisto: trabalha ? "escala" : null, ...mostrar(b), avaliacao: av, rotulo: rotuloDe(av),
      escalaSituacao: sit, foraDaEscala: !trabalha && b.length > 0, semVinculo: false, unidade, turnoDeduzido,
    };
    escalaPorLoja.set(loja, [...(escalaPorLoja.get(loja) ?? []), pessoa]);
  }

  // Bateram ponto sem estar escalados para trabalhar hoje (inclui quem não tem colaborador ligado).
  const foraPorLoja = new Map<string | null, PessoaAoVivo[]>();
  for (const f of ativos) {
    if (escalados.has(f.id) || !trabalhadoresDeHoje.has(f.id)) continue;
    const loja = lojaDaEmpresa.get(f.empresaId) ?? null;
    const doPonto = (pontoPorLoja.get(loja) ?? []).find((p) => p.chave === `f${f.id}`);
    if (doPonto) foraPorLoja.set(loja, [...(foraPorLoja.get(loja) ?? []), { ...doPonto, foraDaEscala: true }]);
  }

  const chaves = ["santos", "miyagi", "pg", "abc"];
  const todas = new Set<string | null>([...pontoPorLoja.keys(), ...escalaPorLoja.keys(), ...chaves]);
  const lojas: LojaAoVivo[] = [...todas]
    .filter((k): k is string => k !== null)
    .sort((a, b) => chaves.indexOf(a) - chaves.indexOf(b))
    .map((chave) => {
      const ponto = ordenar(pontoPorLoja.get(chave) ?? []);
      const escala = ordenar(escalaPorLoja.get(chave) ?? []);
      return {
        chave,
        nome: nomeLoja(chave),
        ponto: { pessoas: ponto, contagem: contar(ponto.map((p) => p.avaliacao)) },
        escala: { pessoas: escala, contagem: contar(escala.map((p) => p.avaliacao)), foraDaEscala: foraPorLoja.get(chave) ?? [] },
      };
    })
    .filter((l) => l.ponto.pessoas.length > 0 || l.escala.pessoas.length > 0);

  return {
    atualizadoEm: new Date().toISOString(),
    diaDeTrabalho: dia,
    horaAgora: deMinutos(agora.minutos),
    lojas,
    semVinculo: ordenar(semVinculo),
    escalaStatus: [...statusEscala.entries()].map(([unidade, status]) => ({ unidade, status })),
  };
}


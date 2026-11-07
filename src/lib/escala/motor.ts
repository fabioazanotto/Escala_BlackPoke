// Motor de geração e avaliação de escalas mensais.
//
// Funções puras, determinísticas (mesmos dados = mesma escala) e sem acesso ao banco.
// Restrições obrigatórias: turno fixo, unidade fixa, ausências, travas do gerente e
// exigências trabalhistas VALIDADAS. Objetivos: reduzir déficits e equilibrar folgas.
// Nada é presumido: uma função só cobre outra se estiver autorizada no cadastro.

import { horaParaMinutos, inicioDaSemana, paraData, paraISO, somarDias } from "../datas";
import { descansoEntreJornadasMin, duracaoEfetivaMin, duracaoJornadaMin } from "./jornada";
import type {
  Ajuste,
  Celulas,
  ColaboradorMotor,
  Conflito,
  EntradaMotor,
  RegraMotor,
  ResultadoCobertura,
  ResultadoMotor,
  Situacao,
  Trava,
  Turno,
} from "./tipos";

// ---------------------------------------------------------------- datas

export function diasDoMes(ano: number, mes: number): string[] {
  const total = new Date(ano, mes, 0).getDate();
  return Array.from({ length: total }, (_, i) => paraISO(new Date(ano, mes - 1, i + 1)));
}

const diaDaSemana = (iso: string) => paraData(iso).getDay();
const chave = (colaboradorId: string, data: string) => `${colaboradorId}|${data}`;

/** Semanas (segunda a domingo) cuja folga pertence a este mês, com os dias candidatos dentro do mês. */
export function semanasDoMes(
  dias: string[],
  diasFolga: number[],
): { segunda: string; dias: string[]; candidatos: string[] }[] {
  const noMes = new Set(dias);
  const segundas = [...new Set(dias.map(inicioDaSemana))].sort();
  const semanas: { segunda: string; dias: string[]; candidatos: string[] }[] = [];
  for (const segunda of segundas) {
    const todos = Array.from({ length: 7 }, (_, i) => somarDias(segunda, i));
    const candidatosDaSemana = todos.filter((d) => diasFolga.includes(diaDaSemana(d)));
    const candidatos = candidatosDaSemana.filter((d) => noMes.has(d));
    // A semana pertence ao mês que contém a maior parte dos seus dias de folga.
    if (candidatos.length * 2 > candidatosDaSemana.length) {
      semanas.push({ segunda, dias: todos, candidatos });
    }
  }
  return semanas;
}

// ---------------------------------------------------------------- contexto

type Exigencia = { funcaoId: string; ideal: number; minimo: number };

type RegraDobra = Extract<RegraMotor, { tipo: "dobra" }>;

type Contexto = {
  e: EntradaMotor;
  dias: string[];
  porTurno: Record<Turno, ColaboradorMotor[]>;
  colab: Map<string, ColaboradorMotor>;
  travados: Set<string>; // travas manuais do gerente
  bloqueados: Set<string>; // travas manuais + situações fixadas por regras da unidade
  fechados: Set<string>; // dias sem funcionamento
  dobras: RegraDobra[];
  folgaFixa: Map<string, number[]>; // colaborador -> dias da semana permitidos para a folga semanal
  virtual: boolean; // durante a otimização, uma dobra possível já conta na cobertura
  exigencias: (data: string, turno: Turno) => Exigencia[];
  limiteSequencia: { limite: number; peso: number };
};

/** Trabalha naquele dia (inclui a dobra). */
const trabalhando = (s: Situacao | undefined) => s === "trabalha" || s === "dobra";

function numeroLegal(e: EntradaMotor, chaveParametro: string): number | null {
  const p = e.parametros.legais.find((x) => x.chave === chaveParametro);
  if (!p || !p.validado || p.valor === null) return null;
  const n = Number(String(p.valor).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function criarContexto(e: EntradaMotor, travados: Set<string>, fixas: Set<string>): Contexto {
  const dias = diasDoMes(e.ano, e.mes);
  const regras = e.regras ?? [];
  const fechados = new Set(regras.flatMap((r) => (r.tipo === "dia_fechado" ? [r.data] : [])));
  const ativos = new Set(e.colaboradores.map((c) => c.id));
  const dobras = regras.filter((r): r is RegraDobra => r.tipo === "dobra" && ativos.has(r.cobreId) && ativos.has(r.cobertoId));
  const folgaFixa = new Map<string, number[]>();
  for (const r of regras) if (r.tipo === "folga_fixa" && ativos.has(r.colaboradorId)) folgaFixa.set(r.colaboradorId, r.diasSemana);
  const ordenados = [...e.colaboradores].sort(
    (a, b) => a.nome.localeCompare(b.nome, "pt-BR") || a.id.localeCompare(b.id),
  );
  const porTurno: Record<Turno, ColaboradorMotor[]> = {
    dia: ordenados.filter((c) => c.turno === "dia"),
    noite: ordenados.filter((c) => c.turno === "noite"),
  };
  const cache = new Map<string, Exigencia[]>();
  const exigencias = (data: string, turno: Turno): Exigencia[] => {
    if (fechados.has(data)) return []; // unidade fechada: não há cobertura a cobrar
    const dow = diaDaSemana(data);
    const k = `${turno}|${dow}`;
    const guardado = cache.get(k);
    if (guardado) return guardado;
    const porFuncao = new Map<string, (typeof e.cobertura)[number]>();
    for (const c of e.cobertura) {
      if (c.turno !== turno || (c.diaSemana !== null && c.diaSemana !== dow)) continue;
      const atual = porFuncao.get(c.funcaoId);
      // A linha específica do dia vale mais que a linha "todos os dias".
      if (!atual || (atual.diaSemana === null && c.diaSemana !== null)) porFuncao.set(c.funcaoId, c);
    }
    const lista = [...porFuncao.values()]
      .map((c) => ({ funcaoId: c.funcaoId, ideal: c.ideal, minimo: c.minimoReduzido ?? c.ideal }))
      .sort((a, b) => a.funcaoId.localeCompare(b.funcaoId));
    cache.set(k, lista);
    return lista;
  };
  const maxDias = numeroLegal(e, "dias_consecutivos_maximos");
  const limiteSequencia = maxDias !== null ? { limite: maxDias, peso: 5000 } : { limite: 6, peso: 20 };
  return {
    e,
    dias,
    porTurno,
    colab: new Map(e.colaboradores.map((c) => [c.id, c])),
    travados,
    bloqueados: new Set([...travados, ...fixas]),
    fechados,
    dobras,
    folgaFixa,
    virtual: false,
    exigencias,
    limiteSequencia,
  };
}

// ---------------------------------------------------------------- situação base

const PRIORIDADE_AUSENCIA = ["afastamento", "ferias", "indisponibilidade"] as const;

/** Datas de folga de cada pessoa numa alternância (A em diaA, B em diaB; invertem a cada semana). */
export function datasDaAlternancia(
  regra: Extract<RegraMotor, { tipo: "alternancia" }>,
  dias: string[],
): { a: string[]; b: string[] } {
  const noMes = new Set(dias);
  const segundaAncora = paraData(inicioDaSemana(regra.ancora)).getTime();
  const a: string[] = [];
  const b: string[] = [];
  for (const segunda of [...new Set(dias.map(inicioDaSemana))].sort()) {
    const k = Math.round((paraData(segunda).getTime() - segundaAncora) / (7 * 86400000));
    const par = ((k % 2) + 2) % 2 === 0;
    const dataDe = (dow: number) => somarDias(segunda, (dow + 6) % 7);
    const dA = dataDe(par ? regra.diaA : regra.diaB);
    const dB = dataDe(par ? regra.diaB : regra.diaA);
    if (noMes.has(dA)) a.push(dA);
    if (noMes.has(dB)) b.push(dB);
  }
  return { a, b };
}

function celulasBase(
  e: EntradaMotor,
  dias: string[],
): { celulas: Celulas; travados: Set<string>; fixas: Set<string> } {
  const celulas: Celulas = {};
  const travados = new Set<string>();
  const fixas = new Set<string>();
  const travaPor = new Map<string, Trava["situacao"]>();
  for (const t of e.travas) travaPor.set(chave(t.colaboradorId, t.data), t.situacao);

  for (const c of e.colaboradores) {
    const linha: Record<string, Situacao> = {};
    const minhas = e.ausencias.filter((a) => a.colaboradorId === c.id);
    for (const d of dias) {
      let s: Situacao = "trabalha";
      if ((c.admissao && d < c.admissao) || (c.desligamento && d > c.desligamento)) {
        s = "fora";
      } else {
        const ativas = minhas.filter((a) => d >= a.inicio && d <= a.fim);
        const aus = PRIORIDADE_AUSENCIA.find((t) => ativas.some((a) => a.tipo === t));
        if (aus) {
          s = aus;
        } else {
          const t = travaPor.get(chave(c.id, d));
          if (t) {
            s = t;
            travados.add(chave(c.id, d));
          }
        }
      }
      linha[d] = s;
    }
    celulas[c.id] = linha;
  }

  // Situações fixadas por regras da unidade (a trava manual do gerente sempre vale mais).
  const fixar = (colaboradorId: string, data: string, situacao: Situacao) => {
    const k = chave(colaboradorId, data);
    if (celulas[colaboradorId]?.[data] !== "trabalha" || travados.has(k)) return;
    celulas[colaboradorId][data] = situacao;
    fixas.add(k);
  };
  for (const r of e.regras ?? []) {
    if (r.tipo === "dia_fechado" && r.folgaColetiva) {
      for (const c of e.colaboradores) fixar(c.id, r.data, "folga");
    }
    if (r.tipo === "alternancia") {
      const { a, b } = datasDaAlternancia(r, dias);
      for (const d of a) fixar(r.colaboradorA, d, "folga");
      for (const d of b) fixar(r.colaboradorB, d, "folga");
    }
  }
  return { celulas, travados, fixas };
}

// ---------------------------------------------------------------- cobertura

/** Quantos profissionais cobrem cada função exigida naquele dia e turno. */
function presentesPorFuncao(ctx: Contexto, celulas: Celulas, data: string, turno: Turno): Map<string, number> {
  const exig = ctx.exigencias(data, turno);
  const ideais = new Map(exig.map((x) => [x.funcaoId, x.ideal]));
  const presentes = new Map(exig.map((x) => [x.funcaoId, 0]));
  const sobra: ColaboradorMotor[] = [];
  for (const c of ctx.porTurno[turno]) {
    if (!trabalhando(celulas[c.id][data])) continue;
    const f = c.funcaoPrincipalId;
    if (presentes.has(f) && presentes.get(f)! < ideais.get(f)!) presentes.set(f, presentes.get(f)! + 1);
    else sobra.push(c);
  }
  // Quem sobrou só cobre outra função se estiver autorizado no cadastro.
  for (const c of sobra) {
    let melhor: string | null = null;
    let maiorFalta = 0;
    for (const f of [...c.funcoesAdicionais].sort()) {
      if (!presentes.has(f)) continue;
      const falta = ideais.get(f)! - presentes.get(f)!;
      if (falta > maiorFalta) {
        maiorFalta = falta;
        melhor = f;
      }
    }
    if (melhor) presentes.set(melhor, presentes.get(melhor)! + 1);
  }
  // Dobra prevista numa regra: quem trabalha os dois turnos cobre o posto de quem folgou.
  if (ctx.dobras.length > 0) {
    const usados = new Set<string>();
    for (const x of exig) {
      let p = presentes.get(x.funcaoId)!;
      for (const r of ctx.dobras) {
        if (p >= x.ideal) break;
        const a = ctx.colab.get(r.cobertoId);
        const b = ctx.colab.get(r.cobreId);
        if (!a || !b || a.turno !== turno || b.turno === turno || a.funcaoPrincipalId !== x.funcaoId) continue;
        const sa = celulas[a.id][data];
        if (sa !== "folga" && sa !== "domingo") continue;
        const sb = celulas[b.id][data];
        const pode = sb === "dobra" || (ctx.virtual && sb === "trabalha" && !ctx.bloqueados.has(chave(b.id, data)));
        if (!pode || usados.has(b.id)) continue;
        usados.add(b.id);
        p++;
      }
      presentes.set(x.funcaoId, p);
    }
  }
  return presentes;
}

function avaliarCobertura(ctx: Contexto, celulas: Celulas): ResultadoCobertura[] {
  const lista: ResultadoCobertura[] = [];
  for (const data of ctx.dias) {
    for (const turno of ["dia", "noite"] as const) {
      const exig = ctx.exigencias(data, turno);
      if (exig.length === 0) continue;
      const presentes = presentesPorFuncao(ctx, celulas, data, turno);
      for (const x of exig) {
        const p = presentes.get(x.funcaoId) ?? 0;
        lista.push({
          data,
          turno,
          funcaoId: x.funcaoId,
          ideal: x.ideal,
          minimo: x.minimo,
          presentes: p,
          estado: p >= x.ideal ? "completa" : p >= x.minimo ? "reduzida" : "deficit",
        });
      }
    }
  }
  return lista;
}

// ---------------------------------------------------------------- custo (objetivo da otimização)

function custo(ctx: Contexto, celulas: Celulas): number {
  let total = 0;
  for (const data of ctx.dias) {
    for (const turno of ["dia", "noite"] as const) {
      const exig = ctx.exigencias(data, turno);
      if (exig.length > 0) {
        const presentes = presentesPorFuncao(ctx, celulas, data, turno);
        for (const x of exig) {
          const p = presentes.get(x.funcaoId) ?? 0;
          total += 1000 * Math.max(0, x.minimo - p); // déficit não autorizado
          total += 10 * Math.max(0, x.ideal - Math.max(p, x.minimo)); // cobertura reduzida
        }
      }
      // Desempate leve: não empilhar folgas no mesmo dia e turno.
      let fora = 0;
      for (const c of ctx.porTurno[turno]) {
        const s = celulas[c.id][data];
        if (s === "folga" || s === "domingo") fora++;
      }
      total += 0.01 * fora * fora;
    }
  }
  // Dias seguidos de trabalho acima do limite (legal validado = obrigatório; senão, preferência).
  const { limite, peso } = ctx.limiteSequencia;
  for (const c of ctx.e.colaboradores) {
    let seguidos = 0;
    for (const data of ctx.dias) {
      if (trabalhando(celulas[c.id][data])) {
        seguidos++;
        if (seguidos > limite) total += peso;
      } else {
        seguidos = 0;
      }
    }
  }
  return total;
}

// ---------------------------------------------------------------- geração

type Tarefa = { colaboradorId: string; tipo: "folga" | "domingo"; opcoes: string[]; atual: string | null };

function montarTarefas(ctx: Contexto, celulas: Celulas, avisos: string[]): Tarefa[] {
  const { e, dias } = ctx;
  const nomes = new Map(e.colaboradores.map((c) => [c.id, c.nome]));
  const ordem = [...ctx.porTurno.dia, ...ctx.porTurno.noite];
  const tarefas: Tarefa[] = [];

  // Uma folga semanal por semana, nos dias preferidos (padrão: segunda a quarta) ou nos dias da regra "folga fixa".
  const noMes = new Set(dias);
  for (const semana of semanasDoMes(dias, e.parametros.diasFolgaSemanal)) {
    for (const c of ordem) {
      const jaTemFolga = semana.dias.some((d) => celulas[c.id][d] === "folga" && ctx.bloqueados.has(chave(c.id, d)));
      if (jaTemFolga) continue;
      const fixos = ctx.folgaFixa.get(c.id);
      const candidatos = fixos ? semana.dias.filter((d) => noMes.has(d) && fixos.includes(diaDaSemana(d))) : semana.candidatos;
      const opcoes = candidatos.filter(
        (d) => celulas[c.id][d] === "trabalha" && !ctx.bloqueados.has(chave(c.id, d)),
      );
      if (opcoes.length > 0) tarefas.push({ colaboradorId: c.id, tipo: "folga", opcoes, atual: null });
    }
  }

  // Domingos de descanso adicionais.
  const domingos = dias.filter((d) => diaDaSemana(d) === 0);
  for (const c of ordem) {
    // Uma folga semanal travada (ou fixada por regra) num domingo também vale como descanso de domingo.
    const jaTem = domingos.filter(
      (d) => celulas[c.id][d] === "domingo" || (celulas[c.id][d] === "folga" && ctx.bloqueados.has(chave(c.id, d))),
    ).length;
    const precisa = e.parametros.domingosPorMes - jaTem;
    if (precisa <= 0) continue;
    const opcoes = domingos.filter((d) => celulas[c.id][d] === "trabalha" && !ctx.bloqueados.has(chave(c.id, d)));
    if (opcoes.length < precisa) {
      avisos.push(`${nomes.get(c.id)}: sem domingo disponível para o descanso do mês.`);
    }
    for (let i = 0; i < Math.min(precisa, opcoes.length); i++) {
      tarefas.push({ colaboradorId: c.id, tipo: "domingo", opcoes, atual: null });
    }
  }
  return tarefas;
}

function otimizar(ctx: Contexto, celulas: Celulas, tarefas: Tarefa[]): void {
  const marca = (t: Tarefa): Situacao => (t.tipo === "folga" ? "folga" : "domingo");

  // 1) Construção: cada folga vai para o dia que menos piora o conjunto.
  for (const t of tarefas) {
    let melhor: string | null = null;
    let melhorCusto = Infinity;
    for (const d of t.opcoes) {
      if (celulas[t.colaboradorId][d] !== "trabalha") continue;
      celulas[t.colaboradorId][d] = marca(t);
      const c = custo(ctx, celulas);
      celulas[t.colaboradorId][d] = "trabalha";
      if (c < melhorCusto - 1e-9) {
        melhorCusto = c;
        melhor = d;
      }
    }
    if (melhor) {
      celulas[t.colaboradorId][melhor] = marca(t);
      t.atual = melhor;
    }
  }

  // 2) Melhoria: troca de dia enquanto o custo diminuir.
  let atual = custo(ctx, celulas);
  for (let passada = 0; passada < 40; passada++) {
    let melhorou = false;
    for (const t of tarefas) {
      if (!t.atual) continue;
      for (const d of t.opcoes) {
        if (d === t.atual || celulas[t.colaboradorId][d] !== "trabalha") continue;
        const antes = t.atual;
        celulas[t.colaboradorId][antes] = "trabalha";
        celulas[t.colaboradorId][d] = marca(t);
        const c = custo(ctx, celulas);
        if (c < atual - 1e-9) {
          atual = c;
          t.atual = d;
          melhorou = true;
        } else {
          celulas[t.colaboradorId][d] = "trabalha";
          celulas[t.colaboradorId][antes] = marca(t);
        }
      }
    }
    if (!melhorou) break;
  }
}

/** Depois da otimização: quem dobra passa a aparecer como "Dobra" na célula. */
function materializarDobras(ctx: Contexto, celulas: Celulas): void {
  ctx.virtual = false;
  if (ctx.dobras.length === 0) return;
  for (const data of ctx.dias) {
    for (const r of ctx.dobras) {
      const a = ctx.colab.get(r.cobertoId);
      const b = ctx.colab.get(r.cobreId);
      if (!a || !b || a.turno === b.turno) continue;
      const sa = celulas[a.id][data];
      if (sa !== "folga" && sa !== "domingo") continue;
      if (celulas[b.id][data] !== "trabalha" || ctx.bloqueados.has(chave(b.id, data))) continue;
      const exig = ctx.exigencias(data, a.turno).find((x) => x.funcaoId === a.funcaoPrincipalId);
      if (!exig) continue;
      const presentes = presentesPorFuncao(ctx, celulas, data, a.turno).get(exig.funcaoId) ?? 0;
      if (presentes < exig.ideal) celulas[b.id][data] = "dobra";
    }
  }
}

// ---------------------------------------------------------------- verificações

const LEGAIS_VERIFICADOS = [
  "dias_consecutivos_maximos",
  "jornada_maxima_diaria_horas",
  "jornada_semanal_horas",
  "descanso_entre_jornadas_horas",
  "domingo_de_descanso_periodicidade",
];

function verificar(ctx: Contexto, celulas: Celulas, avisos: string[]): { conflitos: Conflito[]; legaisNaoVerificados: number } {
  const { e, dias } = ctx;
  const conflitos: Conflito[] = [];
  const nome = (id: string) => e.colaboradores.find((c) => c.id === id)?.nome ?? id;
  let legaisNaoVerificados = 0;

  for (const p of e.parametros.legais) {
    if (!LEGAIS_VERIFICADOS.includes(p.chave)) {
      legaisNaoVerificados++;
      avisos.push(`Exigência “${p.chave}” ainda não é verificada pelo motor.`);
    } else if (!p.validado || p.valor === null || p.valor === "") {
      legaisNaoVerificados++;
      avisos.push(`Exigência “${p.chave}” sem valor validado: não foi verificada.`);
    }
  }

  const maxSeguidos = numeroLegal(e, "dias_consecutivos_maximos");
  if (maxSeguidos !== null) {
    for (const c of e.colaboradores) {
      let seguidos = 0;
      for (const d of dias) {
        seguidos = trabalhando(celulas[c.id][d]) ? seguidos + 1 : 0;
        if (seguidos === maxSeguidos + 1) {
          conflitos.push({
            codigo: "dias_consecutivos",
            mensagem: `${nome(c.id)} trabalha mais de ${maxSeguidos} dias seguidos (até ${d} ou depois).`,
            colaboradorId: c.id,
            data: d,
          });
        }
      }
    }
  }

  const maxDiaria = numeroLegal(e, "jornada_maxima_diaria_horas");
  const maxSemanal = numeroLegal(e, "jornada_semanal_horas");
  const minDescanso = numeroLegal(e, "descanso_entre_jornadas_horas");
  for (const j of e.jornadas) {
    if (maxDiaria !== null && duracaoEfetivaMin(j) > maxDiaria * 60) {
      conflitos.push({ codigo: "jornada_diaria", mensagem: `A jornada do turno ${j.turno} excede ${maxDiaria}h por dia.` });
    }
    if (minDescanso !== null && descansoEntreJornadasMin(j) < minDescanso * 60) {
      conflitos.push({
        codigo: "descanso_entre_jornadas",
        mensagem: `O descanso entre jornadas do turno ${j.turno} (${Math.floor(descansoEntreJornadasMin(j) / 60)}h${String(descansoEntreJornadasMin(j) % 60).padStart(2, "0")}) é menor que ${minDescanso}h.`,
      });
    }
  }
  if (maxSemanal !== null) {
    const noMes = new Set(dias);
    const segundas = [...new Set(dias.map(inicioDaSemana))].sort();
    for (const segunda of segundas) {
      const semana = Array.from({ length: 7 }, (_, i) => somarDias(segunda, i));
      if (!semana.every((d) => noMes.has(d))) continue; // só semanas inteiras dentro do mês
      for (const c of e.colaboradores) {
        const j = e.jornadas.find((x) => x.turno === c.turno);
        if (!j) continue;
        const trabalhados = semana.filter((d) => trabalhando(celulas[c.id][d])).length;
        if (trabalhados * duracaoEfetivaMin(j) > maxSemanal * 60) {
          conflitos.push({
            codigo: "jornada_semanal",
            mensagem: `${nome(c.id)} passa de ${maxSemanal}h na semana de ${segunda}.`,
            colaboradorId: c.id,
            data: segunda,
          });
        }
      }
    }
  }

  const periodicidade = numeroLegal(e, "domingo_de_descanso_periodicidade");
  if (periodicidade !== null && periodicidade >= 1) {
    const domingos = dias.filter((d) => diaDaSemana(d) === 0);
    for (const c of e.colaboradores) {
      for (let i = 0; i + periodicidade <= domingos.length; i++) {
        const janela = domingos.slice(i, i + periodicidade);
        const todosTrabalhados = janela.every((d) => trabalhando(celulas[c.id][d]));
        if (todosTrabalhados) {
          conflitos.push({
            codigo: "domingo_periodicidade",
            mensagem: `${nome(c.id)} não descansa em nenhum domingo de ${janela[0]} a ${janela[janela.length - 1]}.`,
            colaboradorId: c.id,
            data: janela[0],
          });
          break;
        }
      }
    }
  }

  verificarDobras(ctx, celulas, conflitos, avisos);

  // Trava do gerente fora dos dias de folga preferidos: permitido, mas avisado.
  for (const t of e.travas) {
    if (t.situacao === "folga" && !e.parametros.diasFolgaSemanal.includes(diaDaSemana(t.data))) {
      avisos.push(`Folga de ${nome(t.colaboradorId)} em ${t.data} está fora dos dias preferidos para folga semanal.`);
    }
  }
  return { conflitos, legaisNaoVerificados };
}

/** Dobras: exceção ao turno fixo. Sempre avisadas; viram conflito quando violam um limite legal validado. */
function verificarDobras(ctx: Contexto, celulas: Celulas, conflitos: Conflito[], avisos: string[]): void {
  const { e, dias } = ctx;
  const maxDiaria = numeroLegal(e, "jornada_maxima_diaria_horas");
  const minDescanso = numeroLegal(e, "descanso_entre_jornadas_horas");
  const hm = (min: number) => `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}`;

  for (const c of e.colaboradores) {
    const datas = dias.filter((d) => celulas[c.id][d] === "dobra");
    if (datas.length === 0) continue;
    avisos.push(
      `${c.nome}: ${datas.length} dobra(s) no mês. É uma exceção cadastrada: contraria o turno fixo e a regra de não abrir e fechar no mesmo dia.`,
    );
    const propria = e.jornadas.find((j) => j.turno === c.turno);
    const outra = e.jornadas.find((j) => j.turno !== c.turno);
    if (!propria || !outra) continue;

    const iniP = horaParaMinutos(propria.horaInicio);
    const fimP = iniP + duracaoJornadaMin(propria);
    const iniO = horaParaMinutos(outra.horaInicio);
    const fimO = iniO + duracaoJornadaMin(outra);
    const ini = Math.min(iniP, iniO);
    const fim = Math.max(fimP, fimO);
    const efetivas = fim - ini - propria.intervaloMinutos - outra.intervaloMinutos;

    if (maxDiaria !== null && efetivas > maxDiaria * 60) {
      conflitos.push({
        codigo: "dobra_jornada_diaria",
        mensagem: `${c.nome}: ${datas.length} dobra(s) com ${hm(efetivas)} de trabalho efetivo no dia, acima de ${maxDiaria}h (primeira em ${datas[0]}).`,
        colaboradorId: c.id,
        data: datas[0],
      });
    }
    if (minDescanso !== null) {
      let menor = Infinity;
      let quando = datas[0];
      for (const d of datas) {
        const ontem = somarDias(d, -1);
        const amanha = somarDias(d, 1);
        if (dias.includes(ontem) && trabalhando(celulas[c.id][ontem])) {
          const fimOntem = celulas[c.id][ontem] === "dobra" ? fim : fimP;
          const folga = ini - (fimOntem - 1440);
          if (folga < menor) {
            menor = folga;
            quando = d;
          }
        }
        if (dias.includes(amanha) && trabalhando(celulas[c.id][amanha])) {
          const iniAmanha = celulas[c.id][amanha] === "dobra" ? ini : iniP;
          const folga = 1440 + iniAmanha - fim;
          if (folga < menor) {
            menor = folga;
            quando = d;
          }
        }
      }
      if (menor < minDescanso * 60) {
        conflitos.push({
          codigo: "dobra_descanso",
          mensagem: `${c.nome}: descanso de ${hm(menor)} perto de uma dobra, abaixo de ${minDescanso}h (em ${quando}).`,
          colaboradorId: c.id,
          data: quando,
        });
      }
    }
  }
}

// ---------------------------------------------------------------- resultado

function montarResultado(ctx: Contexto, celulas: Celulas, avisosIniciais: string[]): ResultadoMotor {
  const { e, dias } = ctx;
  const avisos = [...avisosIniciais];
  const cobertura = avaliarCobertura(ctx, celulas);
  const { conflitos, legaisNaoVerificados } = verificar(ctx, celulas, avisos);

  const estadoDoDia = new Map<string, "completa" | "reduzida" | "deficit">();
  for (const x of cobertura) {
    const atual = estadoDoDia.get(x.data) ?? "completa";
    const ordem = { completa: 0, reduzida: 1, deficit: 2 } as const;
    if (ordem[x.estado] > ordem[atual]) estadoDoDia.set(x.data, x.estado);
    else estadoDoDia.set(x.data, atual);
  }
  let folgas = 0;
  let domingos = 0;
  const dobrasPorColaborador: Record<string, number> = {};
  for (const c of e.colaboradores) {
    for (const d of dias) {
      if (celulas[c.id][d] === "folga") folgas++;
      if (celulas[c.id][d] === "domingo") domingos++;
      if (celulas[c.id][d] === "dobra") dobrasPorColaborador[c.id] = (dobrasPorColaborador[c.id] ?? 0) + 1;
    }
  }
  const estados = dias.map((d) => estadoDoDia.get(d) ?? "completa");
  return {
    dias,
    celulas,
    travados: [...ctx.travados],
    feriados: e.feriados.filter((d) => dias.includes(d)),
    fechados: [...ctx.fechados].filter((d) => dias.includes(d)).sort(),
    dobrasPorColaborador,
    cobertura,
    conflitos,
    avisos,
    regular: conflitos.length === 0,
    resumo: {
      colaboradoresAtivos: e.colaboradores.length,
      folgasProgramadas: folgas,
      domingosDistribuidos: domingos,
      diasCompletos: estados.filter((s) => s === "completa").length,
      diasReduzidos: estados.filter((s) => s === "reduzida").length,
      diasComDeficit: estados.filter((s) => s === "deficit").length,
      conflitos: conflitos.length,
      legaisNaoVerificados,
      dobras: Object.values(dobrasPorColaborador).reduce((a, b) => a + b, 0),
    },
  };
}

/** Gera a proposta do mês respeitando ausências e travas. */
export function gerarEscala(entrada: EntradaMotor): ResultadoMotor {
  const dias = diasDoMes(entrada.ano, entrada.mes);
  const { celulas, travados, fixas } = celulasBase(entrada, dias);
  const ctx = criarContexto(entrada, travados, fixas);
  const avisos: string[] = [];
  const tarefas = montarTarefas(ctx, celulas, avisos);
  ctx.virtual = true; // durante a otimização, uma dobra possível já conta na cobertura
  otimizar(ctx, celulas, tarefas);
  materializarDobras(ctx, celulas);
  return montarResultado(ctx, celulas, avisos);
}

/** Avalia uma escala já existente (por exemplo, a que foi salva ou editada à mão). */
export function avaliarEscala(entrada: EntradaMotor, celulas: Celulas): ResultadoMotor {
  const dias = diasDoMes(entrada.ano, entrada.mes);
  const base = celulasBase(entrada, dias);
  const ctx = criarContexto(entrada, base.travados, base.fixas);
  // Quem entrou depois da geração (ou dias sem registro) é tratado pela situação de base.
  const completas: Celulas = {};
  for (const c of entrada.colaboradores) completas[c.id] = { ...base.celulas[c.id], ...(celulas[c.id] ?? {}) };
  return montarResultado(ctx, completas, []);
}

/** Ajustes possíveis para um posto descoberto. Só sugere: nunca aplica. */
export function sugerirAjustes(
  entrada: EntradaMotor,
  resultado: ResultadoMotor,
  data: string,
  turno: Turno,
  funcaoId: string,
): Ajuste[] {
  const travados = new Set(resultado.travados);
  const ajustes: Ajuste[] = [];
  const ordenados = [...entrada.colaboradores].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  for (const c of ordenados) {
    const pode = c.funcaoPrincipalId === funcaoId || c.funcoesAdicionais.includes(funcaoId);
    if (!pode) continue;
    const s = resultado.celulas[c.id]?.[data];
    if (c.turno === turno && (s === "folga" || s === "domingo") && !travados.has(chave(c.id, data))) {
      ajustes.push({
        tipo: "mover_folga",
        colaboradorId: c.id,
        descricao: `Mover para outro dia a ${s === "folga" ? "folga" : "folga de domingo"} de ${c.nome}.`,
      });
    }
    if (c.turno !== turno && s === "trabalha" && c.funcaoPrincipalId === funcaoId) {
      ajustes.push({
        tipo: "dobra",
        colaboradorId: c.id,
        descricao: `${c.nome} (turno ${c.turno}) poderia dobrar. Contraria o turno fixo e exige validação trabalhista antes.`,
      });
    }
  }
  return ajustes;
}

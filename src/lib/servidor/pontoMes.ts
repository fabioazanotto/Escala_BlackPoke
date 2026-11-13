// Monta o mês de UM colaborador: batidas do Secullum (lidas na hora, só leitura), escala do BlackPoke e cálculo oficial do Secullum.
// Só no servidor. Traz nomes e CPF mascarado: só para quem tem permissão.

import type { SupabaseClient } from "@supabase/supabase-js";
import { LOJAS_XMENU } from "@/config/lojas";
import { ErroSecullum, valorDoCampo } from "@/lib/integracoes/secullum";
import { agoraNoBrasil, diaDeTrabalho, jornadaDe, type Jornada } from "@/lib/ponto/aoVivo";
import { montarCabecalho, type CabecalhoCartao } from "@/lib/ponto/cartao";
import { mascararCpf } from "@/lib/ponto/conferencia";
import { montarMes, parseCalcular, pontosDeAtencao, ultimoDiaDoMes, type DiaEscala, type InfoDiaSecullum } from "@/lib/ponto/mes";
import { somarDiasData } from "@/lib/vendas/datas";
import { comCache } from "./cacheCurto";
import { carregarContexto, traduzirFuncionarios } from "./pontoDados";
import { jornadaDoHorario } from "./pontoAoVivo";

const lista = (x: unknown) => (Array.isArray(x) ? x : []);
const texto = (x: unknown) => (typeof x === "string" ? x : "");
const digitos = (s: string) => s.replace(/\D/g, "");
const HORA = /^\d{1,2}[:.]\d{2}/;
const nomeLoja = (chave: string | null) => LOJAS_XMENU.find((l) => l.chave === chave)?.nome ?? chave ?? "";

export class ErroMes extends Error {}

export async function listarFuncionarios(db: SupabaseClient) {
  const { contexto } = await comCache("contexto", 10 * 60000, () => carregarContexto(db));
  const brutos = await comCache("funcionarios", 10 * 60000, () => contexto.sessao.obter("Funcionarios"));
  const { funcionarios } = traduzirFuncionarios(lista(brutos), contexto.empresas);
  const lojaDaEmpresa = new Map(contexto.empresas.map((e) => [e.empresaId, e.lojaChave ?? null]));
  return funcionarios
    .map((f) => {
      const loja = lojaDaEmpresa.get(f.empresaId) ?? null;
      return { id: f.id, nome: f.nome, empresa: f.empresaNome, lojaChave: loja, loja: nomeLoja(loja), ativo: f.ativo };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export async function montarMesDoColaborador(db: SupabaseClient, funcionarioId: number, mes: string, agora = agoraNoBrasil()) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) throw new ErroMes("Mês inválido.");
  const { dia: hoje, agoraMin } = diaDeTrabalho(agora);
  const primeiro = `${mes}-01`;
  const ultimo = ultimoDiaDoMes(mes);

  const { contexto } = await comCache("contexto", 10 * 60000, () => carregarContexto(db));
  const { sessao, empresas, bancoId } = contexto;
  const [funcsBrutos, horariosBrutos] = await Promise.all([comCache("funcionarios", 10 * 60000, () => sessao.obter("Funcionarios")), comCache("horarios", 10 * 60000, () => sessao.obter("Horarios"))]);
  const f = traduzirFuncionarios(lista(funcsBrutos), empresas).funcionarios.find((x) => x.id === funcionarioId);
  if (!f) throw new ErroMes("Funcionário não encontrado nas empresas do projeto.");
  const cpf = digitos(f.cpf);
  if (cpf.length !== 11) throw new ErroMes("Este funcionário não tem CPF no Secullum: não dá para consultar o mês.");
  const horario = lista(horariosBrutos).find((h) => Number(valorDoCampo(h, "Id")) === f.horarioId);
  const lojaChave = empresas.find((e) => e.empresaId === f.empresaId)?.lojaChave ?? null;

  // Secullum (só leitura). Cache curto: o cálculo oficial tem limite de 100 consultas por hora no banco.
  const ttl = hoje.slice(0, 7) === mes ? 2 * 60000 : 10 * 60000;
  const limite = ultimo < hoje ? ultimo : hoje;
  const dados = await comCache(`mes:${f.id}:${mes}:${hoje}`, ttl, async () => {
    const [fonte, agrupadas, afastamentos, calculo] = await Promise.all([
      sessao.obter("FonteDados", { dataInicio: primeiro, dataFim: somarDiasData(ultimo, 1), funcionarioCpf: cpf }),
      sessao.obter("Batidas", { dataInicio: primeiro, dataFim: ultimo, funcionarioCpf: cpf }),
      sessao.obter("FuncionariosAfastamentos", { dataInicio: primeiro, dataFim: ultimo, funcionarioCpf: cpf }),
      limite >= primeiro
        ? sessao.chamar("POST", "Calcular", {}, { FuncionarioCpf: cpf, DataInicial: primeiro, DataFinal: limite }).then((r) => ({ r }), (e) => ({ erro: e instanceof ErroSecullum ? e.message : "Falha na consulta do cálculo oficial." }))
        : Promise.resolve({ r: null as unknown }),
    ]);
    return { fonte, agrupadas, afastamentos, calculo };
  });

  // Por segurança: mesmo que o filtro por CPF fosse ignorado pelo Secullum, só entram batidas deste funcionário.
  const registros = lista(dados.fonte)
    .filter((r) => Number(valorDoCampo(r, "FuncionarioId")) === f.id)
    .map((r) => ({ data: texto(valorDoCampo(r, "Data")), hora: texto(valorDoCampo(r, "Hora")), tipo: Number(valorDoCampo(r, "Tipo")) }));

  const agrupadas = new Map<string, InfoDiaSecullum>();
  for (const l of lista(dados.agrupadas)) {
    if (Number(valorDoCampo(l, "FuncionarioId")) !== f.id) continue;
    const d = texto(valorDoCampo(l, "Data")).slice(0, 10);
    const info = agrupadas.get(d) ?? { folga: false, justificativa: null };
    if (valorDoCampo(l, "Folga") === true) info.folga = true;
    for (let i = 1; i <= 5; i++) for (const campo of [`Entrada${i}`, `Saida${i}`]) {
      const v = texto(valorDoCampo(l, campo)).trim();
      if (v && !HORA.test(v) && !info.justificativa) info.justificativa = v;
    }
    agrupadas.set(d, info);
  }
  for (const a of lista(dados.afastamentos)) {
    const ini = texto(valorDoCampo(a, "Inicio")).slice(0, 10);
    const fim = texto(valorDoCampo(a, "Fim")).slice(0, 10);
    const nome = texto(valorDoCampo(a, "JustificativaNome")) || "Afastamento";
    for (let d = ini < primeiro ? primeiro : ini; d <= (fim > ultimo ? ultimo : fim); d = somarDiasData(d, 1)) {
      const info = agrupadas.get(d) ?? { folga: false, justificativa: null };
      if (!info.justificativa) info.justificativa = nome;
      agrupadas.set(d, info);
    }
  }

  // Escala do BlackPoke (se existir para o mês) e vínculo.
  const { data: vinc } = await db.from("colaborador_ponto_ids").select("colaborador_id").eq("banco_id", bancoId).eq("secullum_funcionario_id", f.id).is("vigencia_fim", null).maybeSingle();
  let colaborador: { id: string; nome: string; unidade: string | null } | null = null;
  let escala: Map<string, DiaEscala> | null = null;
  let statusEscala: string | null = null;
  if (vinc) {
    const { data: c } = await db.from("colaboradores").select("id, nome, turno, unidade_id, unidades(nome)").eq("id", vinc.colaborador_id).maybeSingle();
    if (c) {
      colaborador = { id: c.id as string, nome: String(c.nome), unidade: ((c.unidades as unknown as { nome?: string } | null)?.nome as string | undefined) ?? null };
      const [{ data: dias }, { data: jornadas }] = await Promise.all([
        db.from("escala_dias").select("data, situacao, escalas_mensais!inner(status)").eq("colaborador_id", c.id).gte("data", primeiro).lte("data", ultimo),
        db.from("jornadas").select("unidade_id, turno, hora_inicio, hora_fim").eq("unidade_id", c.unidade_id),
      ]);
      const jor = (turno: string): Jornada | null => {
        const j = (jornadas ?? []).find((x) => x.turno === turno);
        return j ? jornadaDe(String(j.hora_inicio), String(j.hora_fim)) : null;
      };
      if ((dias ?? []).length > 0) {
        escala = new Map();
        for (const d of dias ?? []) {
          const sit = String(d.situacao);
          let jornada: Jornada | null = null;
          if (sit === "trabalha") jornada = jor(String(c.turno));
          else if (sit === "dobra") {
            const a = jor("dia");
            const b = jor("noite");
            jornada = a && b ? { inicio: a.inicio, fim: b.fim } : (a ?? b);
          }
          // O outro turno da unidade: base para deduzir uma troca só neste dia (ver inferirTurno).
          const outro = String(c.turno) === "dia" ? "noite" : "dia";
          const jAlt = sit === "trabalha" ? jor(outro) : null;
          escala.set(String(d.data), { situacao: sit, jornada, alternativa: jAlt ? { turno: outro, jornada: jAlt } : null });
          statusEscala = String((d.escalas_mensais as unknown as { status: string }).status);
        }
      }
    }
  }

  // Alterações do mês (para o cartão ponto): batida lançada à mão (I) ou desconsiderada (D), com o motivo informado no Secullum.
  const alteracoes = lista(dados.fonte)
    .filter((r) => Number(valorDoCampo(r, "FuncionarioId")) === f.id)
    .flatMap((r) => {
      const tipo = Number(valorDoCampo(r, "Tipo"));
      const dia = texto(valorDoCampo(r, "Data")).slice(0, 10);
      if ((tipo !== 1 && tipo !== 3) || dia < primeiro || dia > ultimo) return [];
      return [{ dia, hora: texto(valorDoCampo(r, "Hora")).slice(0, 5), tipo: tipo === 1 ? ("I" as const) : ("D" as const), motivo: texto(valorDoCampo(r, "Motivo")).trim() }];
    });

  const calc = "r" in dados.calculo && dados.calculo.r ? parseCalcular(dados.calculo.r) : null;
  const { dias, resumo } = montarMes({
    mes, hoje, agoraMin, registros, agrupadas, escala,
    horario: (d) => (horario ? jornadaDoHorario(horario, d) : { jornada: null, folga: false, texto: null }),
    oficial: calc?.porDia ?? null,
  });

  return {
    funcionario: { id: f.id, nome: f.nome, empresa: f.empresaNome, lojaChave, loja: nomeLoja(lojaChave), cpfMascarado: mascararCpf(f.cpf) ?? "—", admissao: f.admissao, demissao: f.demissao, ativo: f.ativo },
    colaborador,
    mes,
    escala: { existe: escala !== null, status: statusEscala },
    oficial: calc ? { colunas: calc.colunas, totais: calc.totais } : null,
    avisoOficial: "erro" in dados.calculo ? dados.calculo.erro : null,
    dias,
    resumo,
    atencao: pontosDeAtencao(dias, resumo, escala !== null),
    alteracoes,
    atualizadoEm: new Date().toISOString(),
  };
}

/**
 * Cabeçalho do Cartão Ponto (empresa, função, CPF completo...). O CPF completo só sai aqui, para o admin, na hora de imprimir:
 * nunca é guardado nem registrado em log. Só funcionários das empresas incluídas no projeto.
 */
export async function cabecalhoDoCartao(db: SupabaseClient, funcionarioId: number): Promise<CabecalhoCartao> {
  const { contexto, empresasApi } = await comCache("contexto", 10 * 60000, () => carregarContexto(db));
  const { sessao, empresas } = contexto;
  const [funcsBrutos, horariosBrutos] = await Promise.all([comCache("funcionarios", 10 * 60000, () => sessao.obter("Funcionarios")), comCache("horarios", 10 * 60000, () => sessao.obter("Horarios"))]);
  const funcionario = lista(funcsBrutos).find((x) => Number(valorDoCampo(x, "Id")) === funcionarioId);
  const empresaId = Number(valorDoCampo(funcionario, "EmpresaId"));
  if (!funcionario || !empresas.some((e) => e.empresaId === empresaId)) throw new ErroMes("Funcionário não encontrado nas empresas do projeto.");
  const empresa = empresasApi.find((e) => Number(valorDoCampo(e, "Id")) === empresaId);
  const horario = lista(horariosBrutos).find((h) => Number(valorDoCampo(h, "Id")) === Number(valorDoCampo(funcionario, "HorarioId")));
  return montarCabecalho({ funcionario, empresa, horario });
}

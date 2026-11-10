// Diagnóstico da conexão com o Secullum. Devolve ESTRUTURA e CONTAGENS, nunca dados pessoais:
// sem nomes de funcionários, CPF, PIS, e-mail, telefone nem horários de batidas.
// (Exceção consciente, só para o admin: nome e CNPJ das EMPRESAS, necessários para ligar cada unidade a uma empresa.)

import {
  SessaoSecullum,
  VARIAVEL_BANCO,
  camposDe,
  candidatosDoCabecalhoBanco,
  listarBancos,
  obterToken,
  valorDoCampo,
  ErroSecullum,
  type BancoSecullum,
  type CampoVisto,
  type Dependencias,
} from "@/lib/integracoes/secullum";

export type Etapa = { nome: string; ok: boolean; tempoMs: number; mensagem: string; detalhes?: Record<string, unknown> };

export type Diagnostico = {
  etapas: Etapa[];
  bancos: BancoSecullum[];
  bancoUsado: string | null; // qual cabeçalho funcionou (o valor do banco não é segredo, mas só o tipo é mostrado)
  empresas: { id: number | null; nome: string; documento: string; funcionariosAtivos: number; funcionariosDesligados: number }[];
  funcionariosSemEmpresaVisivel: number; // devem ser 0: funcionários de empresas que a conta não enxerga
};

const HORA = /^\d{1,2}[:.]\d{2}$/;

/** Só para campos de horário (Entrada1, Saida2...): textos que NÃO são hora (ex.: FOLGA, FALTA). Sem outros campos. */
export function textosEspeciaisDeBatidas(lista: unknown): string[] {
  if (!Array.isArray(lista)) return [];
  const vistos = new Set<string>();
  for (const item of lista.slice(0, 500)) {
    if (!item || typeof item !== "object") continue;
    for (const [k, v] of Object.entries(item as Record<string, unknown>)) {
      if (!/^(entrada|saida)\d/i.test(k) || typeof v !== "string") continue;
      const t = v.trim();
      if (t !== "" && !HORA.test(t) && vistos.size < 12) vistos.add(t.slice(0, 20));
    }
  }
  return [...vistos];
}

const contar = (valores: unknown[]) => {
  const m: Record<string, number> = {};
  for (const v of valores) m[String(v)] = (m[String(v)] ?? 0) + 1;
  return m;
};

const lista = (x: unknown) => (Array.isArray(x) ? x : []);

export async function diagnosticar(hoje: string, ontem: string, dependencias: Partial<Dependencias> = {}): Promise<Diagnostico> {
  const etapas: Etapa[] = [];
  const saida: Diagnostico = { etapas, bancos: [], bancoUsado: null, empresas: [], funcionariosSemEmpresaVisivel: 0 };

  async function etapa<T>(nome: string, f: () => Promise<{ valor: T; mensagem: string; detalhes?: Record<string, unknown> }>): Promise<T | null> {
    const t0 = Date.now();
    try {
      const r = await f();
      etapas.push({ nome, ok: true, tempoMs: Date.now() - t0, mensagem: r.mensagem, detalhes: r.detalhes });
      return r.valor;
    } catch (e) {
      const msg = e instanceof ErroSecullum ? e.message : "Erro inesperado.";
      etapas.push({ nome, ok: false, tempoMs: Date.now() - t0, mensagem: msg });
      return null;
    }
  }

  const token = await etapa("Login (token)", async () => ({ valor: await obterToken(dependencias), mensagem: "Token recebido." }));
  if (!token) return saida;

  const bancos = await etapa("Lista de bancos", async () => {
    const b = await listarBancos(token, dependencias);
    return { valor: b, mensagem: `${b.length} banco(s) disponível(is) para esta conta.` };
  });
  if (!bancos || bancos.length === 0) return saida;
  saida.bancos = bancos;

  const env = dependencias.env ?? process.env;
  const escolhido = env[VARIAVEL_BANCO]?.trim();
  const banco = escolhido ? bancos.find((b) => String(b.id) === escolhido || b.identificador === escolhido) : bancos.length === 1 ? bancos[0] : undefined;
  if (!banco) {
    etapas.push({ nome: "Escolha do banco", ok: false, tempoMs: 0, mensagem: `A conta enxerga ${bancos.length} bancos. Informe qual usar na variável ${VARIAVEL_BANCO}.` });
    return saida;
  }

  // O Swagger e o manual divergem sobre o cabeçalho do banco: testa as duas formas com uma consulta leve.
  let sessao: SessaoSecullum | null = null;
  for (const [i, cab] of candidatosDoCabecalhoBanco(banco).entries()) {
    const tentativa = new SessaoSecullum(cab, dependencias);
    const ok = await etapa(`Banco selecionado (forma ${i + 1})`, async () => {
      const dep = await tentativa.obter("Departamentos");
      return { valor: true, mensagem: `Aceito. ${lista(dep).length} departamento(s).`, detalhes: { forma: i === 0 ? "id numérico" : "identificador sem símbolos" } };
    });
    if (ok) {
      sessao = tentativa;
      saida.bancoUsado = i === 0 ? "id" : "identificador";
      break;
    }
  }
  if (!sessao) return saida;
  const s = sessao;

  const empresasBrutas = await etapa("Empresas", async () => {
    const e = lista(await s.obter("Empresas"));
    return { valor: e, mensagem: `${e.length} empresa(s) visível(is) para esta conta.`, detalhes: { campos: camposDe(e).map((c) => c.campo) } };
  });

  const funcionarios = await etapa("Funcionários", async () => {
    const f = lista(await s.obter("Funcionarios"));
    return { valor: f, mensagem: `${f.length} funcionário(s) devolvido(s).`, detalhes: { campos: camposDe(f) as CampoVisto[] } };
  });

  // Ativos e desligados por empresa (só contagens). O funcionário aponta para a empresa por EmpresaId; Demissao vazia = ativo.
  const resumoPorEmpresa = new Map<string, { ativos: number; desligados: number }>();
  const idsVisiveis = new Set((empresasBrutas ?? []).map((e) => String(valorDoCampo(e, "Id"))));
  let semEmpresaVisivel = 0;
  for (const f of funcionarios ?? []) {
    const empresaId = String(valorDoCampo(f, "EmpresaId") ?? "");
    if (!idsVisiveis.has(empresaId)) {
      semEmpresaVisivel += 1;
      continue;
    }
    const r = resumoPorEmpresa.get(empresaId) ?? { ativos: 0, desligados: 0 };
    if (valorDoCampo(f, "Demissao")) r.desligados += 1;
    else r.ativos += 1;
    resumoPorEmpresa.set(empresaId, r);
  }
  saida.funcionariosSemEmpresaVisivel = semEmpresaVisivel;
  saida.empresas = (empresasBrutas ?? []).map((e) => {
    const id = valorDoCampo(e, "Id");
    const r = resumoPorEmpresa.get(String(id)) ?? { ativos: 0, desligados: 0 };
    return {
      id: typeof id === "number" ? id : null,
      nome: String(valorDoCampo(e, "Nome") ?? "").trim(),
      documento: String(valorDoCampo(e, "Documento") ?? ""),
      funcionariosAtivos: r.ativos,
      funcionariosDesligados: r.desligados,
    };
  });

  // Consulta de cálculos oficiais (POST que só lê): confirma que a conta pode consultar e mostra os NOMES das colunas.
  // Nenhum valor do cálculo sai daqui. Usa uma chamada das 100 por hora que o Secullum permite por banco.
  await etapa("Cálculos oficiais (consulta de um dia)", async () => {
    const alvo = (funcionarios ?? []).find((f) => !valorDoCampo(f, "Demissao") && String(valorDoCampo(f, "Cpf") ?? "").replace(/\D/g, "").length === 11 && idsVisiveis.has(String(valorDoCampo(f, "EmpresaId"))));
    if (!alvo) throw new ErroSecullum("REQUISICAO_INVALIDA", "Não encontrei um funcionário ativo com CPF para testar.");
    const r = (await s.chamar("POST", "Calcular", {}, { FuncionarioCpf: String(valorDoCampo(alvo, "Cpf")), DataInicial: ontem, DataFinal: ontem })) as unknown;
    const colunas = lista(valorDoCampo(r, "Colunas")).map((c) => String(c));
    const linhas = lista(valorDoCampo(r, "Linhas"));
    return { valor: true, mensagem: `Funciona: ${colunas.length} coluna(s) e ${linhas.length} linha(s) para o dia.`, detalhes: { colunas } };
  });

  await etapa("Horários", async () => {
    const h = lista(await s.obter("Horarios"));
    const dias = h.flatMap((x) => lista(valorDoCampo(x, "Dias")));
    return { valor: h, mensagem: `${h.length} horário(s) cadastrado(s).`, detalhes: { campos: camposDe(h).map((c) => c.campo), camposDoDia: camposDe(dias).map((c) => c.campo) } };
  });

  await etapa("Funções, justificativas e equipamentos", async () => {
    const [fu, ju, eq] = await Promise.all([s.obter("Funcoes"), s.obter("Justificativas"), s.obter("Equipamentos")]);
    return {
      valor: true,
      mensagem: `${lista(fu).length} função(ões), ${lista(ju).length} justificativa(s), ${lista(eq).length} equipamento(s).`,
      detalhes: { camposEquipamento: camposDe(eq).map((c) => c.campo), camposJustificativa: camposDe(ju).map((c) => c.campo) },
    };
  });

  await etapa("Afastamentos (últimos 30 dias)", async () => {
    const inicio = new Date(Date.parse(`${hoje}T00:00:00Z`) - 30 * 86400000).toISOString().slice(0, 10);
    const a = lista(await s.obter("FuncionariosAfastamentos", { dataInicio: inicio, dataFim: hoje }));
    return { valor: a, mensagem: `${a.length} afastamento(s) no período.`, detalhes: { campos: camposDe(a).map((c) => c.campo) } };
  });

  await etapa("Batidas de ontem (formato agrupado)", async () => {
    const b = lista(await s.obter("Batidas", { dataInicio: ontem, dataFim: ontem }));
    return { valor: b, mensagem: `${b.length} linha(s) devolvida(s).`, detalhes: { campos: camposDe(b), textosEspeciaisNosHorarios: textosEspeciaisDeBatidas(b) } };
  });

  const fonte = await etapa("Fonte de dados de ontem (batida a batida)", async () => {
    const f = lista(await s.obter("FonteDados", { dataInicio: ontem, dataFim: ontem }));
    return {
      valor: f,
      mensagem: `${f.length} registro(s) de batida.`,
      detalhes: {
        campos: camposDe(f),
        porTipo: contar(f.map((x) => valorDoCampo(x, "Tipo"))),
        porOrigem: contar(f.map((x) => valorDoCampo(x, "Origem"))),
        porEquipamento: contar(f.map((x) => valorDoCampo(x, "EquipamentoId"))),
      },
    };
  });

  if (fonte && fonte.length > 0) {
    const ids = fonte.map((x) => Number(valorDoCampo(x, "Id"))).filter((n) => Number.isFinite(n));
    if (ids.length > 0) {
      const maior = Math.max(...ids);
      await etapa("Leitura incremental (a partir de um ID)", async () => {
        const r = lista(await s.obter("FonteDados/APartirDoId", { fonteDadosId: maior }));
        return { valor: r, mensagem: `Funciona: ${r.length} registro(s) com ID maior ou igual ao último de ontem.` };
      });
    }
  }

  return saida;
}

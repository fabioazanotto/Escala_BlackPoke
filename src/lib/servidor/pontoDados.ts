// Leitura (somente leitura) dos dados do Secullum já traduzidos para o formato interno do BlackPoke. Só no servidor.
// Funcionários de empresas fora do projeto são descartados aqui mesmo, antes de qualquer uso.

import type { SupabaseClient } from "@supabase/supabase-js";
import { SessaoSecullum, valorDoCampo } from "@/lib/integracoes/secullum";
import type { EmpresaConfigurada, FuncionarioSecullum } from "@/lib/ponto/conferencia";

const lista = (x: unknown) => (Array.isArray(x) ? x : []);
const texto = (x: unknown) => (typeof x === "string" ? x : "");
const dia = (x: unknown) => (typeof x === "string" && x.length >= 10 ? x.slice(0, 10) : null);

export type ContextoPonto = { bancoId: string; sessao: SessaoSecullum; empresas: EmpresaConfigurada[] };

export class ErroConfiguracaoPonto extends Error {}

/** Banco ativo e empresas incluídas (tabelas ponto_bancos e ponto_empresas), ligadas às empresas reais do Secullum pelo CNPJ. */
export async function carregarContexto(db: SupabaseClient): Promise<{ contexto: ContextoPonto; empresasApi: unknown[] }> {
  const { data: bancos } = await db.from("ponto_bancos").select("id, secullum_id").eq("ativo", true);
  if (!bancos || bancos.length !== 1) throw new ErroConfiguracaoPonto("Configure exatamente um banco ativo do Secullum (tabela ponto_bancos).");
  const { data: cfg } = await db.from("ponto_empresas").select("documento, incluida, unidade_id, loja_chave, unidades(nome)").eq("banco_id", bancos[0].id).eq("incluida", true);
  if (!cfg || cfg.length === 0) throw new ErroConfiguracaoPonto("Nenhuma empresa incluída em ponto_empresas.");

  const sessao = new SessaoSecullum(String(bancos[0].secullum_id));
  const empresasApi = lista(await sessao.obter("Empresas"));
  const unidadePorDoc = new Map(cfg.map((c) => [String(c.documento), { unidadeId: (c.unidade_id as string | null) ?? null, unidadeNome: ((c.unidades as unknown as { nome?: string } | null)?.nome as string | undefined) ?? null, lojaChave: (c.loja_chave as string | null) ?? null }]));
  const empresas: EmpresaConfigurada[] = [];
  for (const e of empresasApi) {
    const u = unidadePorDoc.get(texto(valorDoCampo(e, "Documento")));
    const id = valorDoCampo(e, "Id");
    if (u && typeof id === "number") empresas.push({ empresaId: id, nome: texto(valorDoCampo(e, "Nome")).trim(), ...u });
  }
  return { contexto: { bancoId: bancos[0].id as string, sessao, empresas }, empresasApi };
}

export function traduzirFuncionarios(brutos: unknown[], empresas: EmpresaConfigurada[]): { funcionarios: FuncionarioSecullum[]; usoPorHorario: Map<number, number>; comHorarioAlternativo: number } {
  const empresaPorId = new Map(empresas.map((e) => [e.empresaId, e]));
  const funcionarios: FuncionarioSecullum[] = [];
  const usoPorHorario = new Map<number, number>();
  let comHorarioAlternativo = 0;
  for (const f of brutos) {
    const empresaId = valorDoCampo(f, "EmpresaId");
    const empresa = typeof empresaId === "number" ? empresaPorId.get(empresaId) : undefined;
    if (!empresa || typeof empresaId !== "number") continue;
    const demissao = dia(valorDoCampo(f, "Demissao"));
    const horarioId = valorDoCampo(f, "HorarioId");
    funcionarios.push({
      id: Number(valorDoCampo(f, "Id")),
      nome: texto(valorDoCampo(f, "Nome")).trim(),
      cpf: texto(valorDoCampo(f, "Cpf")),
      empresaId,
      empresaNome: empresa.nome,
      ativo: !demissao,
      admissao: dia(valorDoCampo(f, "Admissao")),
      demissao,
      horarioId: typeof horarioId === "number" ? horarioId : null,
      departamento: texto(valorDoCampo(valorDoCampo(f, "Departamento"), "Descricao")).trim(),
      funcao: texto(valorDoCampo(valorDoCampo(f, "Funcao"), "Descricao")).trim(),
    });
    if (!demissao) {
      if (typeof horarioId === "number") usoPorHorario.set(horarioId, (usoPorHorario.get(horarioId) ?? 0) + 1);
      if (["HorarioAlternativo2Id", "HorarioAlternativo3Id", "HorarioAlternativo4Id"].some((k) => valorDoCampo(f, k) != null)) comHorarioAlternativo += 1;
    }
  }
  return { funcionarios, usoPorHorario, comHorarioAlternativo };
}

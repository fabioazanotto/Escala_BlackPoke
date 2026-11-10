import { ErroSecullum, SessaoSecullum, valorDoCampo } from "@/lib/integracoes/secullum";
import { conferirFuncionarios, type ColaboradorBlackPoke, type EmpresaConfigurada, type FuncionarioSecullum } from "@/lib/ponto/conferencia";
import { resumirHorarios } from "@/lib/ponto/horarios";
import { chamadorDaRequisicao, clienteDoChamador } from "@/lib/servidor/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const semCache = { "Cache-Control": "no-store" };
const lista = (x: unknown) => (Array.isArray(x) ? x : []);
const texto = (x: unknown) => (typeof x === "string" ? x : "");
const dia = (x: unknown) => (typeof x === "string" && x.length >= 10 ? x.slice(0, 10) : null);

/**
 * Compara os funcionários do Secullum com os colaboradores do BlackPoke. SOMENTE LEITURA: não grava nada em lugar nenhum.
 * Só o admin. A resposta traz nomes e CPF mascarado; por isso só vai para a tela de quem tem permissão e não é registrada em log.
 */
export async function GET(request: Request) {
  const chamador = await chamadorDaRequisicao(request);
  if (!chamador) return Response.json({ erro: "Não autenticado." }, { status: 401, headers: semCache });
  if (chamador.perfil !== "admin") return Response.json({ erro: "Sem permissão." }, { status: 403, headers: semCache });
  const db = clienteDoChamador(request);
  if (!db) return Response.json({ erro: "Sessão inválida." }, { status: 401, headers: semCache });

  try {
    // Configuração: banco e empresas incluídas no projeto (as demais são descartadas).
    const { data: bancos } = await db.from("ponto_bancos").select("id, secullum_id").eq("ativo", true);
    if (!bancos || bancos.length !== 1) return Response.json({ erro: "Configure exatamente um banco ativo do Secullum (tabela ponto_bancos)." }, { status: 409, headers: semCache });
    const { data: cfg } = await db.from("ponto_empresas").select("documento, nome, incluida, unidade_id, unidades(nome)").eq("banco_id", bancos[0].id).eq("incluida", true);
    if (!cfg || cfg.length === 0) return Response.json({ erro: "Nenhuma empresa incluída em ponto_empresas." }, { status: 409, headers: semCache });

    const sessao = new SessaoSecullum(String(bancos[0].secullum_id));
    const [empresasApi, funcionariosApi, horariosApi] = await Promise.all([sessao.obter("Empresas"), sessao.obter("Funcionarios"), sessao.obter("Horarios")]);

    // Empresas do Secullum que estão incluídas (pelo CNPJ), com a unidade do app.
    const unidadePorDoc = new Map(
      cfg.map((c) => [String(c.documento), { unidadeId: (c.unidade_id as string | null) ?? null, unidadeNome: ((c.unidades as unknown as { nome?: string } | null)?.nome as string | undefined) ?? null }]),
    );
    const empresas: EmpresaConfigurada[] = [];
    for (const e of lista(empresasApi)) {
      const doc = texto(valorDoCampo(e, "Documento"));
      const id = valorDoCampo(e, "Id");
      const u = unidadePorDoc.get(doc);
      if (u && typeof id === "number") empresas.push({ empresaId: id, nome: texto(valorDoCampo(e, "Nome")).trim(), unidadeId: u.unidadeId, unidadeNome: u.unidadeNome });
    }
    const empresaPorId = new Map(empresas.map((e) => [e.empresaId, e]));

    // Tradução para o formato interno; funcionários de empresas fora do projeto são descartados aqui mesmo.
    const secullum: FuncionarioSecullum[] = [];
    const usoPorHorario = new Map<number, number>();
    for (const f of lista(funcionariosApi)) {
      const empresaId = valorDoCampo(f, "EmpresaId");
      const empresa = typeof empresaId === "number" ? empresaPorId.get(empresaId) : undefined;
      if (!empresa || typeof empresaId !== "number") continue;
      const demissao = dia(valorDoCampo(f, "Demissao"));
      const horarioId = valorDoCampo(f, "HorarioId");
      secullum.push({
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
      if (!demissao && typeof horarioId === "number") usoPorHorario.set(horarioId, (usoPorHorario.get(horarioId) ?? 0) + 1);
    }

    // Colaboradores do BlackPoke (as regras de acesso do banco valem: é o usuário logado que lê).
    const { data: colabs, error } = await db.from("colaboradores").select("id, nome, cpf, unidade_id, ativo, data_admissao, data_desligamento, unidades(nome)");
    if (error) throw new Error(error.message);
    const blackpoke: ColaboradorBlackPoke[] = (colabs ?? []).map((c) => ({
      id: c.id as string,
      nome: String(c.nome ?? "").trim(),
      cpf: (c.cpf as string | null) ?? null,
      unidadeId: c.unidade_id as string,
      unidadeNome: ((c.unidades as unknown as { nome?: string } | null)?.nome as string | undefined) ?? "",
      ativo: Boolean(c.ativo),
      admissao: (c.data_admissao as string | null) ?? null,
      desligamento: (c.data_desligamento as string | null) ?? null,
    }));

    const conferencia = conferirFuncionarios(secullum, blackpoke, empresas);
    const horarios = resumirHorarios(lista(horariosApi), usoPorHorario);
    const alternativos = lista(funcionariosApi).filter((f) => empresaPorId.has(Number(valorDoCampo(f, "EmpresaId"))) && !valorDoCampo(f, "Demissao") && ["HorarioAlternativo2Id", "HorarioAlternativo3Id", "HorarioAlternativo4Id"].some((k) => valorDoCampo(f, k) != null)).length;

    return Response.json({ conferencia, horarios: { ...horarios, funcionariosComHorarioAlternativo: alternativos }, verificadoEm: new Date().toISOString() }, { headers: semCache });
  } catch (e) {
    const mensagem = e instanceof ErroSecullum ? e.message : e instanceof Error ? e.message : "Erro inesperado.";
    return Response.json({ erro: mensagem }, { status: 502, headers: semCache });
  }
}

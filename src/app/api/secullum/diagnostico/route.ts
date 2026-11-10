import { chamadorDaRequisicao } from "@/lib/servidor/admin";
import { diagnosticar } from "@/lib/ponto/diagnostico";
import { hojeNoBrasil, somarDiasData } from "@/lib/vendas/datas";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const semCache = { "Cache-Control": "no-store" };

/**
 * Testa o login e a leitura do Secullum. Só o admin pode chamar.
 * Devolve estrutura e contagens (nunca nomes de funcionários, CPF, PIS nem horários de batidas),
 * além de nome e CNPJ das empresas para ligar cada unidade a uma empresa.
 */
export async function GET(request: Request) {
  const chamador = await chamadorDaRequisicao(request);
  if (!chamador) return Response.json({ erro: "Não autenticado." }, { status: 401, headers: semCache });
  if (chamador.perfil !== "admin") return Response.json({ erro: "Sem permissão." }, { status: 403, headers: semCache });

  const hoje = hojeNoBrasil();
  const resultado = await diagnosticar(hoje, somarDiasData(hoje, -1));
  return Response.json({ ...resultado, verificadoEm: new Date().toISOString() }, { headers: semCache });
}

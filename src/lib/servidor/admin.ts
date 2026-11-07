// Verificação de quem está chamando uma rota do servidor. Roda só no servidor.

import { createClient } from "@supabase/supabase-js";
import type { PerfilAcesso } from "@/lib/tipos";

export type Chamador = { usuarioId: string; perfil: PerfilAcesso } | null;

/** Confere o token de sessão do Supabase enviado no cabeçalho e devolve o perfil ativo, ou null. */
export async function chamadorDaRequisicao(request: Request): Promise<Chamador> {
  const cab = request.headers.get("authorization") ?? "";
  const jwt = cab.toLowerCase().startsWith("bearer ") ? cab.slice(7).trim() : "";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!jwt || !url || !chave) return null;

  const db = createClient(url, chave, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: usuario, error } = await db.auth.getUser(jwt);
  if (error || !usuario.user) return null;
  // A leitura passa pelas regras de acesso do banco: cada pessoa só enxerga o próprio perfil.
  const { data: perfil } = await db.from("perfis").select("perfil, ativo").eq("id", usuario.user.id).maybeSingle();
  if (!perfil || !perfil.ativo) return null;
  return { usuarioId: usuario.user.id, perfil: perfil.perfil as PerfilAcesso };
}

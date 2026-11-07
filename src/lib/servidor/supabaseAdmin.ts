// Cliente do Supabase com a chave de serviço. Roda SÓ no servidor: ignora as regras de acesso do banco.
// A chave vem da variável SUPABASE_SERVICE_ROLE_KEY (Vercel, marcada como Secret). Nunca no código.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function supabaseAdmin(env: Record<string, string | undefined> = process.env): SupabaseClient | null {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !chave) return null;
  return createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });
}

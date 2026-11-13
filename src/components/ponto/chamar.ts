import { supabase } from "@/lib/supabase";

/** GET autenticado nas rotas /api/ponto (admin). */
export async function chamar<T>(caminho: string): Promise<T> {
  const { data } = await supabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sessão expirada. Entre de novo.");
  const r = await fetch(caminho, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  const json = (await r.json().catch(() => ({}))) as T & { erro?: string };
  if (!r.ok) throw new Error(r.status === 504 ? "O servidor demorou demais (504). Tente de novo." : (json.erro ?? `Falha ${r.status}`));
  return json;
}

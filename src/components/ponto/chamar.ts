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

/** POST autenticado em /api/ponto (admin). Devolve o JSON; erro vira exceção com a mensagem do servidor. */
export async function enviar<T>(caminho: string, corpo: unknown): Promise<T> {
  const { data } = await supabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sessão expirada. Entre de novo.");
  const r = await fetch(caminho, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(corpo), cache: "no-store" });
  const json = (await r.json().catch(() => ({}))) as T & { erro?: string };
  if (!r.ok) throw new Error(r.status === 504 ? "O servidor demorou demais (504). Confira no Secullum antes de repetir." : (json.erro ?? `Falha ${r.status}`));
  return json;
}

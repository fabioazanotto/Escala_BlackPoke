import type { Perfil } from "@/lib/tipos";

type ComPerfil = Pick<Perfil, "perfil">;

export const ROTULO_PERFIL = { admin: "Admin", rh: "RH", gerencia: "Gerência" } as const;

export const ehAdmin = (p: ComPerfil) => p.perfil === "admin";

/** RH e admin têm o mesmo poder sobre colaboradores, escalas e regras. */
export const ehRH = (p: ComPerfil) => p.perfil === "rh" || p.perfil === "admin";

/**
 * "Creator" é o dono do sistema: um marcador em `app_metadata` do usuário (só o servidor/SQL consegue gravar;
 * o próprio usuário não consegue se promover). Libera telas em construção e nenhuma permissão de dados:
 * qualquer rota que devolva dados do creator precisa conferir o marcador também no servidor.
 */
export function ehCreator(usuario: { app_metadata?: Record<string, unknown> | null } | null | undefined): boolean {
  return usuario?.app_metadata?.creator === true;
}

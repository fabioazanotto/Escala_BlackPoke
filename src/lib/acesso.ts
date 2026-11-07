import type { Perfil } from "@/lib/tipos";

type ComPerfil = Pick<Perfil, "perfil">;

export const ROTULO_PERFIL = { admin: "Admin", rh: "RH", gerencia: "Gerência" } as const;

export const ehAdmin = (p: ComPerfil) => p.perfil === "admin";

/** RH e admin têm o mesmo poder sobre colaboradores, escalas e regras. */
export const ehRH = (p: ComPerfil) => p.perfil === "rh" || p.perfil === "admin";

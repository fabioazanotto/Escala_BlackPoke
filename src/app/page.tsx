"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSessao } from "@/components/Sessao";
import { destinoInicial } from "@/config/menu";

/** A raiz só leva cada perfil para a sua primeira tela. */
export default function Inicio() {
  const { perfil } = useSessao();
  const router = useRouter();
  useEffect(() => {
    router.replace(destinoInicial(perfil.perfil));
  }, [perfil.perfil, router]);
  return <p className="text-neutral-600">Carregando…</p>;
}

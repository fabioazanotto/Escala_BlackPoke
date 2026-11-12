"use client";

import { CabecalhoPagina } from "@/components/CabecalhoPagina";
import { useSessao } from "@/components/Sessao";
import { TrocarSenha } from "@/components/TrocarSenha";
import { ROTULO_PERFIL } from "@/lib/acesso";

export default function MinhaConta() {
  const { perfil } = useSessao();
  return (
    <div>
      <CabecalhoPagina titulo="Minha conta" descricao={`${perfil.nome} · ${ROTULO_PERFIL[perfil.perfil]}`} />
      <TrocarSenha />
    </div>
  );
}

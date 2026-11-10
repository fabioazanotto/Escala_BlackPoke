"use client";

import { CabecalhoPagina } from "@/components/CabecalhoPagina";
import { useSessao } from "@/components/Sessao";
import { VisaoAoVivo } from "@/components/ponto/PainelAoVivo";
import { ehAdmin } from "@/lib/acesso";

export default function Ponto() {
  const { perfil } = useSessao();
  return (
    <div>
      <CabecalhoPagina titulo="Ponto" descricao="Quem está trabalhando, em intervalo, atrasado ou ausente, por loja. Dados do Secullum, só leitura." />
      {!ehAdmin(perfil) ? (
        <section className="cartao max-w-3xl">
          <p className="text-neutral-700">A visão do ponto está em preparação e, por enquanto, só administradores têm acesso.</p>
        </section>
      ) : (
        <VisaoAoVivo />
      )}
    </div>
  );
}

"use client";

import { CabecalhoPagina } from "@/components/CabecalhoPagina";

export default function Vendas() {
  return (
    <div>
      <CabecalhoPagina titulo="Vendas" descricao="Vendas das lojas, vindas do Xmenu, em um só lugar." />
      <section className="cartao max-w-2xl space-y-3">
        <h2 className="text-lg font-semibold">Em construção</h2>
        <p className="text-neutral-700">
          Esta área é restrita a administradores. As próximas etapas trazem a integração com o Xmenu, o banco
          de vendas e esta tela, com filtros de lojas, período e canal (iFood, Xmenu e balcão).
        </p>
      </section>
    </div>
  );
}

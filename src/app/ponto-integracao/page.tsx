"use client";

import { CabecalhoPagina } from "@/components/CabecalhoPagina";
import { useSessao } from "@/components/Sessao";
import { AtualizarNomes } from "@/components/ponto/AtualizarNomes";
import { ConexaoSecullum } from "@/components/ponto/ConexaoSecullum";
import { ConferenciaFuncionarios } from "@/components/ponto/ConferenciaFuncionarios";
import { SincronizacaoPonto } from "@/components/ponto/SincronizacaoPonto";
import { ehAdmin } from "@/lib/acesso";

export default function IntegracaoDoPonto() {
  const { perfil } = useSessao();
  return (
    <div>
      <CabecalhoPagina titulo="Integração do ponto" descricao="Sincronização das batidas, conferência de funcionários e conexão com o Secullum." />
      {!ehAdmin(perfil) ? (
        <section className="cartao max-w-3xl">
          <p className="text-neutral-700">Esta área é restrita a administradores.</p>
        </section>
      ) : (
        <div className="space-y-4">
          <SincronizacaoPonto />
          <ConferenciaFuncionarios />
          <AtualizarNomes />
          <ConexaoSecullum />
        </div>
      )}
    </div>
  );
}

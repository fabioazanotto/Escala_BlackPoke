"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CabecalhoPagina } from "@/components/CabecalhoPagina";
import { useSessao } from "@/components/Sessao";
import { MesDoColaboradorTela } from "@/components/ponto/MesDoColaborador";
import { ehAdmin } from "@/lib/acesso";

function Conteudo() {
  const p = useSearchParams();
  const f = Number(p.get("f"));
  const mes = p.get("mes");
  return <MesDoColaboradorTela inicialFuncionario={Number.isInteger(f) && f > 0 ? f : null} inicialMes={mes && /^\d{4}-\d{2}$/.test(mes) ? mes : null} />;
}

export default function PontoPorColaborador() {
  const { perfil } = useSessao();
  return (
    <div>
      <CabecalhoPagina titulo="Ponto por colaborador" descricao="O mês de um colaborador: batidas, faltas, atrasos e batidas faltando. Dados do Secullum, só leitura." />
      {!ehAdmin(perfil) ? (
        <section className="cartao max-w-3xl">
          <p className="text-neutral-700">Esta tela está em preparação e, por enquanto, só administradores têm acesso.</p>
        </section>
      ) : (
        <Suspense fallback={<p className="text-neutral-600">Carregando…</p>}>
          <Conteudo />
        </Suspense>
      )}
    </div>
  );
}

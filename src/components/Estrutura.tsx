"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { identidade } from "@/config/identidade";
import { abaAtiva, abasConfiguracoes, destinoInicial, destinos, podeAcessar, rotasLargas, trilhas } from "@/config/menu";
import { ROTULO_PERFIL } from "@/lib/acesso";
import { Icone } from "@/components/Icones";
import { AlertaRecordes } from "@/components/AlertaRecordes";
import { useSessao } from "@/components/Sessao";

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] ?? "") + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase() || "?";
}

function Marca() {
  return (
    <div className="flex items-center gap-2.5 px-4">
      {identidade.logo ? (
        <Image src={identidade.logo} alt="" width={32} height={32} className="h-8 w-8 rounded-lg object-contain" />
      ) : (
        <span
          aria-hidden="true"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold text-white"
          style={{ background: "var(--cor-principal)" }}
        >
          {identidade.nome.slice(0, 1)}
        </span>
      )}
      <span className="truncate text-base font-semibold">{identidade.nome}</span>
    </div>
  );
}

function BarraLateral({ aoNavegar }: { aoNavegar?: () => void }) {
  const caminho = usePathname();
  const { perfil, creator, sair } = useSessao();
  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex h-16 items-center border-b border-neutral-200">
        <Marca />
      </div>
      <nav aria-label="Navegação principal" className="flex-1 space-y-1 overflow-y-auto p-3">
        {destinos.filter((d) => d.perfis.includes(perfil.perfil)).map((d) => {
          const ativo = d.rotas.some((r) => caminho === r || caminho.startsWith(r + "/"));
          return (
            <div key={d.href}>
              <Link
                href={d.href}
                onClick={aoNavegar}
                aria-current={ativo && !d.subitens ? "page" : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${
                  ativo ? "bg-neutral-100 font-semibold text-neutral-900" : "text-neutral-700 hover:bg-neutral-50"
                }`}
                style={ativo ? { boxShadow: "inset 3px 0 0 var(--cor-destaque)" } : undefined}
              >
                <Icone nome={d.icone} />
                {d.rotulo}
              </Link>
              {ativo && d.subitens && (
                <ul className="mb-1 mt-1 space-y-0.5 border-l border-neutral-200 pl-3 ml-5">
                  {d.subitens.map((i) => {
                    const sub = i.exato ? caminho === i.href : abaAtiva(i.href, caminho);
                    return (
                      <li key={i.href}>
                        <Link
                          href={i.href}
                          onClick={aoNavegar}
                          aria-current={sub ? "page" : undefined}
                          className={`block rounded-md px-3 py-1.5 text-sm ${sub ? "bg-neutral-100 font-semibold text-neutral-900" : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"}`}
                        >
                          {i.rotulo}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </nav>
      <div className="border-t border-neutral-200 p-3">
        <div className="flex items-center gap-3 px-1 pb-3">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-sm font-semibold"
          >
            {iniciais(perfil.nome)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{perfil.nome}</p>
            <p className="text-xs text-neutral-600">{ROTULO_PERFIL[perfil.perfil]}{creator && " · Creator"}</p>
          </div>
        </div>
        <Link href="/minha-conta" onClick={aoNavegar} className="mb-2 block rounded-lg px-3 py-2 text-center text-sm text-neutral-700 hover:bg-neutral-50">
          Alterar minha senha
        </Link>
        <button className="botao-secundario w-full" onClick={sair}>
          Sair
        </button>
      </div>
    </div>
  );
}

/** Estrutura de todas as telas: sidebar à esquerda, barra superior e área útil. */
export function Estrutura({ children }: { children: React.ReactNode }) {
  const caminho = usePathname();
  const router = useRouter();
  const { perfil } = useSessao();
  const [gaveta, setGaveta] = useState(false);
  const [busca, setBusca] = useState("");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGaveta(false);
  }, [caminho]);

  useEffect(() => {
    if (!gaveta) return;
    const fechar = (e: KeyboardEvent) => e.key === "Escape" && setGaveta(false);
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [gaveta]);

  function pesquisar(e: React.FormEvent) {
    e.preventDefault();
    const termo = busca.trim();
    if (!termo) return;
    if (caminho === "/colaboradores") {
      window.dispatchEvent(new CustomEvent("busca-colaborador", { detail: termo }));
    } else {
      router.push(`/colaboradores?busca=${encodeURIComponent(termo)}`);
    }
  }

  const trilha = trilhas[caminho] ?? [];
  const larga = rotasLargas.includes(caminho);
  const abas = abasConfiguracoes.some((a) => abaAtiva(a.href, caminho)) ? { lista: abasConfiguracoes.filter((a) => !a.somenteAdmin || perfil.perfil === "admin"), rotulo: "Configurações" } : null;
  const liberado = podeAcessar(perfil.perfil, caminho);

  return (
    <div className="min-h-screen lg:pl-[208px]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[208px] border-r border-neutral-200 lg:block">
        <BarraLateral />
      </aside>

      {gaveta && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button aria-label="Fechar menu" className="absolute inset-0 bg-black/40" onClick={() => setGaveta(false)} />
          <aside className="absolute inset-y-0 left-0 w-[240px] border-r border-neutral-200 shadow-xl">
            <BarraLateral aoNavegar={() => setGaveta(false)} />
          </aside>
        </div>
      )}

      <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-neutral-200 bg-white px-4 lg:px-7">
        <button
          aria-label="Abrir menu"
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-neutral-300 lg:hidden"
          onClick={() => setGaveta(true)}
        >
          <Icone nome="menu" />
        </button>
        <nav aria-label="Caminho" className="hidden min-w-0 items-center gap-2 text-sm sm:flex">
          {trilha.map((t, i) => (
            <span key={t} className="flex items-center gap-2">
              {i > 0 && <span className="text-neutral-400">/</span>}
              <span className={i === trilha.length - 1 ? "font-semibold" : "text-neutral-600"}>{t}</span>
            </span>
          ))}
        </nav>
        <form role="search" onSubmit={pesquisar} className="relative ml-auto w-full max-w-sm">
          <Icone nome="busca" tamanho={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input
            type="search"
            aria-label="Pesquisar colaborador"
            placeholder="Pesquisar colaborador"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="h-10 w-full rounded-lg border border-neutral-300 bg-neutral-50 pl-10 pr-3 text-sm outline-none focus:border-neutral-500 focus:bg-white"
          />
        </form>
        <div className="hidden items-center gap-2 md:flex">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-200 text-sm font-semibold"
          >
            {iniciais(perfil.nome)}
          </span>
          <span className="max-w-32 truncate text-sm font-medium">{perfil.nome}</span>
        </div>
      </header>

      {perfil.perfil === "admin" && <AlertaRecordes />}

      <main className="p-4 lg:p-7">
        {liberado && abas && (
          <nav aria-label={abas.rotulo} className="mb-5 flex gap-1 overflow-x-auto border-b border-neutral-200">
            {abas.lista.map((a) => {
              const ativa = abaAtiva(a.href, caminho);
              return (
                <Link
                  key={a.href}
                  href={a.href}
                  aria-current={ativa ? "page" : undefined}
                  className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm ${
                    ativa ? "border-neutral-900 font-semibold" : "border-transparent text-neutral-600 hover:text-neutral-900"
                  }`}
                >
                  {a.rotulo}
                </Link>
              );
            })}
          </nav>
        )}
        {liberado ? (
          <div className={larga ? "" : "max-w-4xl"}>{children}</div>
        ) : (
          <div className="cartao max-w-xl space-y-3">
            <h1 className="text-xl font-semibold">Sem acesso a esta área</h1>
            <p className="text-neutral-700">O seu perfil ({ROTULO_PERFIL[perfil.perfil]}) não tem permissão para abrir esta tela.</p>
            <Link href={destinoInicial(perfil.perfil)} className="botao">Voltar ao início</Link>
          </div>
        )}
      </main>
    </div>
  );
}

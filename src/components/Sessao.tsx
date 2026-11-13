"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, variaveisConfiguradas } from "@/lib/supabase";
import { identidade } from "@/config/identidade";
import { TrocarSenha } from "@/components/TrocarSenha";
import { ehCreator } from "@/lib/acesso";
import type { Perfil } from "@/lib/tipos";

type Contexto = { perfil: Perfil; creator: boolean; sair: () => Promise<void> };

const SessaoContexto = createContext<Contexto | null>(null);

/** Dados de quem está logado (só existe dentro das telas protegidas). */
export function useSessao(): Contexto {
  const ctx = useContext(SessaoContexto);
  if (!ctx) throw new Error("useSessao usado fora da Sessao");
  return ctx;
}

function traduzirErro(mensagem: string): string {
  if (/invalid login credentials/i.test(mensagem)) return "E-mail ou senha incorretos.";
  if (/email not confirmed/i.test(mensagem)) return "Este e-mail ainda não foi confirmado. Fale com o RH.";
  return "Não foi possível entrar. Tente novamente.";
}

function TelaLogin() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [verSenha, setVerSenha] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setEntrando(true);
    setErro(null);
    const { error } = await supabase().auth.signInWithPassword({
      email: email.trim(),
      password: senha,
    });
    if (error) setErro(traduzirErro(error.message));
    setEntrando(false);
  }

  return (
    <main className="mx-auto w-full max-w-sm flex-1 px-4 py-10">
      <h1 className="mb-6 text-center text-3xl font-bold">{identidade.nome}</h1>
      <form onSubmit={entrar} className="cartao space-y-3">
        <h2 className="text-lg font-semibold">Entrar</h2>
        <label className="block">
          <span className="mb-1 block font-medium">E-mail</span>
          <input
            className="campo"
            type="email"
            inputMode="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label className="block">
          <span className="mb-1 block font-medium">Senha</span>
          <input
            className="campo"
            type={verSenha ? "text" : "password"}
            autoComplete="current-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            required
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-neutral-700">
          <input type="checkbox" className="h-5 w-5" checked={verSenha} onChange={(e) => setVerSenha(e.target.checked)} /> mostrar a senha
        </label>
        {erro && <p className="rounded-xl bg-red-50 p-3 text-red-700">{erro}</p>}
        <button type="submit" className="botao w-full" disabled={entrando}>
          {entrando ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}

/** Só mostra as telas para quem está logado e tem perfil ativo de RH ou gerência. */
export function Sessao({ children }: { children: React.ReactNode }) {
  const [sessao, setSessao] = useState<Session | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [carregandoSessao, setCarregandoSessao] = useState(true);
  const [carregandoPerfil, setCarregandoPerfil] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const configurado = variaveisConfiguradas();

  useEffect(() => {
    if (!configurado) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCarregandoSessao(false);
      return;
    }
    const db = supabase();
    db.auth.getSession().then(({ data }) => {
      setSessao(data.session);
      setCarregandoSessao(false);
    });
    const { data } = db.auth.onAuthStateChange((_evento, nova) => setSessao(nova));
    return () => data.subscription.unsubscribe();
  }, [configurado]);

  const usuarioId = sessao?.user.id ?? null;

  useEffect(() => {
    if (!usuarioId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPerfil(null);
      return;
    }
    let cancelado = false;
    setCarregandoPerfil(true);
    supabase()
      .from("perfis")
      .select("id, nome, perfil, ativo")
      .eq("id", usuarioId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelado) return;
        setErro(error ? error.message : null);
        setPerfil((data as Perfil | null) ?? null);
        setCarregandoPerfil(false);
      });
    return () => {
      cancelado = true;
    };
  }, [usuarioId]);

  async function sair() {
    await supabase().auth.signOut();
  }

  if (!configurado) {
    return (
      <main className="mx-auto w-full max-w-sm flex-1 px-4 py-10">
        <p className="rounded-xl bg-red-50 p-3 text-red-700">
          As variáveis do Supabase não foram configuradas na Vercel.
        </p>
      </main>
    );
  }
  if (carregandoSessao || (sessao && carregandoPerfil)) {
    return <p className="p-6 text-center text-neutral-600">Carregando…</p>;
  }
  if (!sessao) return <TelaLogin />;

  if (!perfil || !perfil.ativo) {
    return (
      <main className="mx-auto w-full max-w-sm flex-1 space-y-4 px-4 py-10">
        <p className="cartao">
          Seu usuário não tem acesso ao sistema. Fale com o RH para liberar.
          {erro && <span className="mt-2 block text-sm text-neutral-500">{erro}</span>}
        </p>
        <button className="botao-secundario w-full" onClick={sair}>
          Sair
        </button>
      </main>
    );
  }

  // Primeiro acesso (ou senha redefinida pelo admin): só segue depois de definir uma senha própria.
  if (sessao.user.user_metadata?.trocar_senha === true) {
    return (
      <main className="mx-auto w-full max-w-sm flex-1 space-y-4 px-4 py-10">
        <h1 className="text-center text-3xl font-bold">{identidade.nome}</h1>
        <TrocarSenha obrigatorio aoSair={sair} />
      </main>
    );
  }

  return <SessaoContexto.Provider value={{ perfil, creator: perfil.perfil === "admin" && ehCreator(sessao.user), sair }}>{children}</SessaoContexto.Provider>;
}

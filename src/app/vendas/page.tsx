"use client";

import { useState } from "react";
import { CabecalhoPagina } from "@/components/CabecalhoPagina";
import { Icone } from "@/components/Icones";
import { SincronizacaoVendas } from "@/components/vendas/SincronizacaoVendas";
import { supabase } from "@/lib/supabase";

type Teste = { nome: string; ok: boolean; status?: number; tempoMs: number; mensagem: string };
type Loja = { chave: string; nome: string; storeId: string; tokenConfigurado: boolean; testes: Teste[] };
type Resposta = { lojas: Loja[]; verificadoEm: string };

export default function Vendas() {
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resposta, setResposta] = useState<Resposta | null>(null);

  async function testar() {
    setCarregando(true);
    setErro(null);
    try {
      const { data } = await supabase().auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Sessão expirada. Entre de novo.");
      const r = await fetch("/api/xmenu/diagnostico", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      if (!r.ok) {
        const corpo = (await r.json().catch(() => ({}))) as { erro?: string };
        throw new Error(corpo.erro ?? `Falha ${r.status}`);
      }
      setResposta((await r.json()) as Resposta);
    } catch (e) {
      setResposta(null);
      setErro((e as Error).message);
    }
    setCarregando(false);
  }

  return (
    <div>
      <CabecalhoPagina titulo="Vendas" descricao="Vendas das lojas, vindas do Xmenu, em um só lugar." />

      <SincronizacaoVendas />

      <section className="cartao mb-4 max-w-3xl space-y-3">
        <h2 className="text-lg font-semibold">Conexão com o Xmenu</h2>
        <p className="text-neutral-700">
          Confere se o app consegue falar com cada loja do Xmenu. O teste só pergunta se o Xmenu respondeu: não mostra o
          token e não traz nenhum dado de venda.
        </p>
        <button className="botao" onClick={testar} disabled={carregando}>
          {carregando ? "Testando…" : "Testar conexão"}
        </button>
        {erro && <p className="rounded-xl bg-red-50 p-3 text-red-700">{erro}</p>}

        {resposta && (
          <ul className="space-y-3">
            {resposta.lojas.map((l) => {
              const tudoCerto = l.tokenConfigurado && l.testes.every((t) => t.ok);
              return (
                <li key={l.chave} className="rounded-xl border border-neutral-200 p-3">
                  <p className="flex items-center gap-2 font-semibold">
                    <Icone nome={tudoCerto ? "ok" : "alerta"} tamanho={18} className={tudoCerto ? "text-green-700" : "text-red-700"} />
                    {l.nome} <span className="text-sm font-normal text-neutral-500">(loja {l.storeId})</span>
                  </p>
                  <ul className="mt-2 space-y-1 text-sm">
                    {l.testes.map((t) => (
                      <li key={t.nome} className="flex flex-wrap items-center gap-x-2">
                        <span className={t.ok ? "text-green-800" : "text-red-700"}>{t.ok ? "Respondeu" : "Falhou"}</span>
                        <span className="font-medium">{t.nome}</span>
                        <span className="text-neutral-600">
                          {t.ok ? `em ${t.tempoMs} ms` : t.mensagem}
                          {!t.ok && t.status ? ` (código ${t.status})` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
            <li className="text-sm text-neutral-500">Verificado em {new Date(resposta.verificadoEm).toLocaleString("pt-BR")}.</li>
          </ul>
        )}
      </section>

      <section className="cartao max-w-3xl space-y-2">
        <h2 className="text-lg font-semibold">Em construção</h2>
        <p className="text-neutral-700">
          Esta área é restrita a administradores. As próximas etapas trazem o banco de vendas e esta tela, com filtros de
          lojas, período e canal (iFood, Xmenu e balcão).
        </p>
      </section>
    </div>
  );
}

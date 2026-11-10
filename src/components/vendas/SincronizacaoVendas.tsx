"use client";

import { useCallback, useEffect, useState } from "react";
import { HISTORICO_DESDE } from "@/config/vendas";
import { supabase } from "@/lib/supabase";

type ResultadoLoja = { chave: string; nome: string; status: "ok" | "erro" | "sem_token"; diasGravados: number; mensagem?: string };
type Situacao = { ultima: string | null; lojas: { chave: string; nome: string; historico_desde: string | null }[] };

const dataBR = (d: string) => d.split("-").reverse().join("/");

async function chamar(corpo: object): Promise<ResultadoLoja[]> {
  const { data } = await supabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sessão expirada. Entre de novo.");
  const r = await fetch("/api/vendas/sincronizar", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
    cache: "no-store",
  });
  const json = (await r.json().catch(() => ({}))) as { erro?: string; lojas?: ResultadoLoja[] };
  if (!r.ok) {
    if (r.status === 504) throw new Error("O servidor demorou demais para responder (504). Tente de novo.");
    throw new Error(json.erro ?? `Falha ${r.status}`);
  }
  return json.lojas ?? [];
}

export function SincronizacaoVendas() {
  const [ocupado, setOcupado] = useState<"agora" | "historico" | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoLoja[] | null>(null);
  const [situacao, setSituacao] = useState<Situacao | null>(null);

  const ler = useCallback(async (): Promise<Situacao> => {
    const db = supabase();
    const [{ data: ultima }, { data: lojas }] = await Promise.all([
      db.from("sincronizacoes").select("concluido_em").eq("status", "ok").order("concluido_em", { ascending: false }).limit(1).maybeSingle(),
      db.from("lojas_xmenu").select("chave, nome, historico_desde").eq("ativa", true).order("nome"),
    ]);
    return {
      ultima: (ultima?.concluido_em as string | undefined) ?? null,
      lojas: (lojas as Situacao["lojas"] | null) ?? [],
    };
  }, []);

  useEffect(() => {
    let ativo = true;
    void ler().then((s) => ativo && setSituacao(s));
    return () => {
      ativo = false;
    };
  }, [ler]);

  async function executar(tipo: "agora" | "historico") {
    setOcupado(tipo);
    setErro(null);
    setResultado(null);
    try {
      setResultado(await chamar(tipo === "agora" ? {} : { historico: true }));
    } catch (e) {
      setErro((e as Error).message);
    }
    setSituacao(await ler());
    setOcupado(null);
  }

  const completas = situacao?.lojas.filter((l) => l.historico_desde && l.historico_desde <= HISTORICO_DESDE) ?? [];
  const tudoCompleto = !!situacao && situacao.lojas.length > 0 && completas.length === situacao.lojas.length;

  return (
    <section className="cartao mb-4 max-w-3xl space-y-3">
      <h2 className="text-lg font-semibold">Atualização das vendas</h2>
      <p className="text-neutral-700">
        {situacao?.ultima ? `Última atualização: ${new Date(situacao.ultima).toLocaleString("pt-BR")}.` : "Ainda não há vendas carregadas."}{" "}
        O app guarda só os totais por loja, turno e canal, sem dados de clientes. As vendas novas chegam sozinhas, em segundo plano.
      </p>

      {situacao && situacao.lojas.length > 0 && (
        <div className="rounded-xl border border-neutral-200 p-3">
          <p className="font-medium">
            Histórico desde {dataBR(HISTORICO_DESDE)}: {tudoCompleto ? "completo em todas as lojas" : "sendo carregado aos poucos, sozinho"}
          </p>
          <ul className="mt-1 space-y-0.5 text-sm text-neutral-700">
            {situacao.lojas.map((l) => (
              <li key={l.chave}>
                {l.nome}:{" "}
                {!l.historico_desde
                  ? "ainda não começou"
                  : l.historico_desde <= HISTORICO_DESDE
                    ? "completo"
                    : `carregado de ${dataBR(l.historico_desde)} até hoje`}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <button className="botao" onClick={() => executar("agora")} disabled={ocupado !== null}>
          {ocupado === "agora" ? "Atualizando…" : "Atualizar agora"}
        </button>
        {!tudoCompleto && (
          <button className="botao-secundario" onClick={() => executar("historico")} disabled={ocupado !== null}>
            {ocupado === "historico" ? "Buscando histórico…" : "Adiantar histórico agora"}
          </button>
        )}
      </div>
      {erro && <p className="rounded-xl bg-red-50 p-3 text-red-700">{erro}</p>}
      {resultado && (
        <ul className="space-y-1 text-sm">
          {resultado.map((l) => (
            <li key={l.chave} className={l.status === "ok" ? "text-green-800" : "text-red-700"}>
              <span className="font-medium">{l.nome}:</span>{" "}
              {l.status === "ok" ? `${l.diasGravados} dia(s) gravado(s)` : (l.mensagem ?? "falhou")}
              {l.status === "erro" && l.diasGravados > 0 ? ` (${l.diasGravados} dia(s) já gravado(s))` : ""}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { hojeNoBrasil, somarDiasData } from "@/lib/vendas/datas";

type ResultadoLoja = { chave: string; nome: string; status: "ok" | "erro" | "sem_token"; diasGravados: number; mensagem?: string };
type Ultima = { concluido_em: string; status: string };

const DIAS_HISTORICO = 90;
const DIAS_POR_PEDIDO = 10; // cada pedido ao servidor tem limite de 60 s

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
  if (!r.ok) throw new Error(json.erro ?? `Falha ${r.status}`);
  return json.lojas ?? [];
}

export function SincronizacaoVendas() {
  const [ocupado, setOcupado] = useState(false);
  const [progresso, setProgresso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoLoja[] | null>(null);
  const [ultima, setUltima] = useState<Ultima | null>(null);

  const lerUltima = useCallback(async () => {
    const { data } = await supabase()
      .from("sincronizacoes")
      .select("concluido_em, status")
      .eq("status", "ok")
      .order("concluido_em", { ascending: false })
      .limit(1)
      .maybeSingle();
    return (data as Ultima | null) ?? null;
  }, []);

  useEffect(() => {
    let ativo = true;
    void lerUltima().then((u) => ativo && setUltima(u));
    return () => {
      ativo = false;
    };
  }, [lerUltima]);

  async function executar(trabalho: () => Promise<ResultadoLoja[]>) {
    setOcupado(true);
    setErro(null);
    setResultado(null);
    try {
      setResultado(await trabalho());
    } catch (e) {
      setErro((e as Error).message);
    }
    setProgresso(null);
    setOcupado(false);
    setUltima(await lerUltima());
  }

  const atualizarAgora = () => executar(() => chamar({}));

  const carregarHistorico = () =>
    executar(async () => {
      const hoje = hojeNoBrasil();
      const inicio = somarDiasData(hoje, -(DIAS_HISTORICO - 1));
      const total = new Map<string, ResultadoLoja>();
      for (let de = inicio; de <= hoje; de = somarDiasData(de, DIAS_POR_PEDIDO)) {
        const ate = somarDiasData(de, DIAS_POR_PEDIDO - 1) > hoje ? hoje : somarDiasData(de, DIAS_POR_PEDIDO - 1);
        setProgresso(`Buscando de ${de.split("-").reverse().join("/")} a ${ate.split("-").reverse().join("/")}…`);
        for (const l of await chamar({ dataDe: de, dataAte: ate })) {
          const antes = total.get(l.chave);
          total.set(l.chave, {
            ...l,
            diasGravados: (antes?.diasGravados ?? 0) + l.diasGravados,
            status: antes?.status === "erro" ? "erro" : l.status,
            mensagem: antes?.mensagem ?? l.mensagem,
          });
        }
      }
      return [...total.values()];
    });

  return (
    <section className="cartao mb-4 max-w-3xl space-y-3">
      <h2 className="text-lg font-semibold">Atualização das vendas</h2>
      <p className="text-neutral-700">
        {ultima
          ? `Última atualização: ${new Date(ultima.concluido_em).toLocaleString("pt-BR")}.`
          : "Ainda não há vendas carregadas."}{" "}
        O app guarda só os totais por loja, turno e canal, sem dados de clientes.
      </p>
      <div className="flex flex-wrap gap-3">
        <button className="botao" onClick={atualizarAgora} disabled={ocupado}>
          {ocupado && !progresso ? "Atualizando…" : "Atualizar agora"}
        </button>
        <button className="botao-secundario" onClick={carregarHistorico} disabled={ocupado}>
          Carregar últimos {DIAS_HISTORICO} dias
        </button>
      </div>
      {progresso && <p className="text-sm text-neutral-600">{progresso}</p>}
      {erro && <p className="rounded-xl bg-red-50 p-3 text-red-700">{erro}</p>}
      {resultado && (
        <ul className="space-y-1 text-sm">
          {resultado.map((l) => (
            <li key={l.chave} className={l.status === "ok" ? "text-green-800" : "text-red-700"}>
              <span className="font-medium">{l.nome}:</span>{" "}
              {l.status === "ok" ? `${l.diasGravados} dia(s) atualizado(s)` : l.mensagem ?? "falhou"}
              {l.status === "erro" && l.diasGravados > 0 ? ` (${l.diasGravados} dia(s) já gravado(s))` : ""}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

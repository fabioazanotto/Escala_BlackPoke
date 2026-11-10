"use client";

import { useCallback, useEffect, useState } from "react";
import { LOJAS_XMENU } from "@/config/lojas";
import { supabase } from "@/lib/supabase";
import { hojeNoBrasil, somarDiasData } from "@/lib/vendas/datas";

type ResultadoLoja = { chave: string; nome: string; status: "ok" | "erro" | "sem_token"; diasGravados: number; mensagem?: string };
type Ultima = { concluido_em: string; status: string };

const DIAS_HISTORICO = 90;
const DIAS_POR_PEDIDO = 4; // cada pedido ao servidor tem limite de 60 s: blocos pequenos, uma loja por vez

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
    if (r.status === 504) throw new Error("O servidor demorou demais para responder (504).");
    throw new Error(json.erro ?? `Falha ${r.status}`);
  }
  return json.lojas ?? [];
}

/** Tenta de novo uma vez: o que já foi gravado não se perde, pois cada dia é regravado por inteiro. */
async function chamarComRetentativa(corpo: object): Promise<ResultadoLoja[]> {
  try {
    return await chamar(corpo);
  } catch {
    return chamar(corpo);
  }
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
      const blocos: { de: string; ate: string }[] = [];
      for (let de = inicio; de <= hoje; de = somarDiasData(de, DIAS_POR_PEDIDO)) {
        const fim = somarDiasData(de, DIAS_POR_PEDIDO - 1);
        blocos.push({ de, ate: fim > hoje ? hoje : fim });
      }
      const feitos = new Map<string, number>(); // blocos concluídos por loja
      const mostrar = () =>
        setProgresso(
          LOJAS_XMENU.map((l) => `${l.nome.replace("BlackPoke ", "")} ${Math.round(((feitos.get(l.chave) ?? 0) / blocos.length) * 100)}%`).join(" · "),
        );
      mostrar();

      // Lojas em paralelo (cada uma com seu próprio limite de tempo); blocos em sequência dentro de cada loja.
      return Promise.all(
        LOJAS_XMENU.map(async (loja): Promise<ResultadoLoja> => {
          let dias = 0;
          for (const b of blocos) {
            try {
              const [r] = await chamarComRetentativa({ dataDe: b.de, dataAte: b.ate, lojas: [loja.chave] });
              if (r.status !== "ok") return { ...r, diasGravados: dias + r.diasGravados };
              dias += r.diasGravados;
            } catch (e) {
              return {
                chave: loja.chave,
                nome: loja.nome,
                status: "erro",
                diasGravados: dias,
                mensagem: `${(e as Error).message} Parou em ${b.de.split("-").reverse().join("/")}.`,
              };
            }
            feitos.set(loja.chave, (feitos.get(loja.chave) ?? 0) + 1);
            mostrar();
          }
          return { chave: loja.chave, nome: loja.nome, status: "ok", diasGravados: dias };
        }),
      );
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

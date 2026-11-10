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

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
const TENTATIVAS_POR_BLOCO = 4;
const ESPERA_ENTRE_TENTATIVAS_MS = 20000;

/**
 * Pede um bloco de uma loja e, se o Xmenu mandar esperar (ou o servidor demorar), aguarda e tenta de novo.
 * Repetir é seguro: cada dia é regravado por inteiro.
 */
async function blocoComRetentativa(corpo: object, aoEsperar: () => void): Promise<ResultadoLoja> {
  let ultimo: ResultadoLoja | Error | null = null;
  for (let t = 1; t <= TENTATIVAS_POR_BLOCO; t++) {
    try {
      const [r] = await chamar(corpo);
      if (r.status !== "erro") return r;
      ultimo = r;
    } catch (e) {
      ultimo = e as Error;
    }
    if (t < TENTATIVAS_POR_BLOCO) {
      aoEsperar();
      await dormir(ESPERA_ENTRE_TENTATIVAS_MS);
    }
  }
  if (ultimo instanceof Error) throw ultimo;
  return ultimo as ResultadoLoja;
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
      let feitos = 0;
      const total = blocos.length * LOJAS_XMENU.length;
      const mostrar = (loja: string, aviso = "") =>
        setProgresso(`${Math.round((feitos / total) * 100)}% · ${loja}${aviso}`);

      // Uma loja por vez, bloco por bloco: o Xmenu limita as chamadas e não gostou do modo paralelo.
      const resultados: ResultadoLoja[] = [];
      for (const loja of LOJAS_XMENU) {
        let dias = 0;
        let blocosFeitos = 0;
        let falha: ResultadoLoja | null = null;
        mostrar(loja.nome);
        for (const b of blocos) {
          try {
            const r = await blocoComRetentativa({ dataDe: b.de, dataAte: b.ate, lojas: [loja.chave] }, () =>
              mostrar(loja.nome, " — o Xmenu pediu uma pausa, aguardando 20 s…"),
            );
            if (r.status !== "ok") {
              falha = { ...r, diasGravados: dias + r.diasGravados, mensagem: `${r.mensagem ?? "Falhou."} Parou em ${b.de.split("-").reverse().join("/")}.` };
              break;
            }
            dias += r.diasGravados;
          } catch (e) {
            falha = { chave: loja.chave, nome: loja.nome, status: "erro", diasGravados: dias, mensagem: `${(e as Error).message} Parou em ${b.de.split("-").reverse().join("/")}.` };
            break;
          }
          feitos += 1;
          blocosFeitos += 1;
          mostrar(loja.nome);
        }
        // Se a loja parou no meio, os blocos que faltam contam como passados para a porcentagem não travar.
        if (falha) feitos += blocos.length - blocosFeitos;
        resultados.push(falha ?? { chave: loja.chave, nome: loja.nome, status: "ok", diasGravados: dias });
      }
      return resultados;
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

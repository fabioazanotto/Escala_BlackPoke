"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Modo = "inicial" | "incremental" | "reprocesso";
type Rodada = { id: string; tipo: Modo; origem: string; status: "rodando" | "ok" | "erro"; lidas: number; descartadas: number; novas: number; alteradas: number; removidas: number; mensagem: string | null; iniciado_em: string; concluido_em: string | null };
type Resultado = { tipo: Modo; status: "ok" | "erro" | "ocupado"; lidas: number; descartadas: number; novas: number; alteradas: number; removidas: number; mensagem?: string };

const ROTULO: Record<Modo, string> = { inicial: "Carga inicial", incremental: "Leitura incremental", reprocesso: "Reprocesso dos últimos dias" };
const MINUTOS_DESATUALIZADO = 30;

export function SincronizacaoPonto() {
  const [rodadas, setRodadas] = useState<Rodada[] | null>(null);
  const [ocupado, setOcupado] = useState<Modo | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [agora, setAgora] = useState(0); // hora em que a lista foi lida (evita chamar Date.now() durante a renderização)

  const ler = useCallback(async () => {
    const { data } = await supabase().from("ponto_sincronizacoes").select("id, tipo, origem, status, lidas, descartadas, novas, alteradas, removidas, mensagem, iniciado_em, concluido_em").order("iniciado_em", { ascending: false }).limit(8);
    return (data as Rodada[] | null) ?? [];
  }, []);

  useEffect(() => {
    let ativo = true;
    void ler().then((r) => {
      if (!ativo) return;
      setRodadas(r);
      setAgora(Date.now());
    });
    return () => {
      ativo = false;
    };
  }, [ler]);

  async function executar(modo: Modo) {
    if (modo === "inicial" && !window.confirm("Rodar a carga inicial dos últimos 90 dias? Pode levar alguns segundos e não apaga nada.")) return;
    setOcupado(modo);
    setErro(null);
    setResultado(null);
    try {
      const { data } = await supabase().auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Sessão expirada. Entre de novo.");
      const r = await fetch("/api/ponto/sincronizar", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ modo }), cache: "no-store" });
      const json = (await r.json().catch(() => ({}))) as { erro?: string; resultado?: Resultado };
      if (json.resultado) setResultado(json.resultado);
      if (!r.ok && !json.resultado) throw new Error(r.status === 504 ? "O servidor demorou demais (504). Tente de novo." : (json.erro ?? `Falha ${r.status}`));
    } catch (e) {
      setErro((e as Error).message);
    }
    setRodadas(await ler());
    setAgora(Date.now());
    setOcupado(null);
  }

  const ultimaOk = rodadas?.find((r) => r.status === "ok" && r.tipo !== "reprocesso") ?? null;
  const minutos = ultimaOk?.concluido_em && agora ? Math.round((agora - new Date(ultimaOk.concluido_em).getTime()) / 60000) : null;
  const desatualizado = minutos === null || minutos > MINUTOS_DESATUALIZADO;

  return (
    <section className="cartao max-w-5xl space-y-3">
      <h2 className="text-lg font-semibold">Sincronização das batidas</h2>
      <p className="text-neutral-700">
        Traz as batidas do Secullum (só leitura) das empresas do projeto e guarda no BlackPoke, com histórico se algo mudar lá. Não guarda CPF nem PIS. Depois da carga inicial, o servidor atualiza sozinho.
      </p>
      {rodadas && (
        <p className={`rounded-xl p-3 text-sm ${desatualizado ? "bg-amber-50 text-amber-900" : "bg-green-50 text-green-900"}`}>
          {ultimaOk?.concluido_em
            ? `Última leitura com sucesso: ${new Date(ultimaOk.concluido_em).toLocaleString("pt-BR")} (${minutos} min atrás).${desatualizado ? " Os dados podem estar desatualizados. Falta de dados NÃO significa falta do colaborador." : ""}`
            : "Ainda não há batidas guardadas. Rode a carga inicial."}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button className="botao" onClick={() => executar("inicial")} disabled={ocupado !== null}>
          {ocupado === "inicial" ? "Carregando…" : "Carga inicial (90 dias)"}
        </button>
        <button className="botao-secundario" onClick={() => executar("incremental")} disabled={ocupado !== null}>
          {ocupado === "incremental" ? "Atualizando…" : "Atualizar agora"}
        </button>
        <button className="botao-secundario" onClick={() => executar("reprocesso")} disabled={ocupado !== null}>
          {ocupado === "reprocesso" ? "Reprocessando…" : "Reprocessar últimos 3 dias"}
        </button>
      </div>
      {erro && <p className="rounded-xl bg-red-50 p-3 text-red-700">{erro}</p>}
      {resultado && (
        <p className={`rounded-xl p-3 text-sm ${resultado.status === "ok" ? "bg-green-50 text-green-900" : "bg-red-50 text-red-700"}`}>
          {ROTULO[resultado.tipo]}: {resultado.status === "ok" ? "concluída" : resultado.status === "ocupado" ? "já havia uma em andamento" : "com erro"}. Lidas {resultado.lidas}, novas {resultado.novas}, alteradas {resultado.alteradas}, removidas {resultado.removidas}, de fora do projeto {resultado.descartadas}.
          {resultado.mensagem ? ` ${resultado.mensagem}` : ""}
        </p>
      )}
      {rodadas && rodadas.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs text-neutral-500">
              <tr>
                <th className="py-1 pr-3 font-medium">Quando</th>
                <th className="py-1 pr-3 font-medium">Tipo</th>
                <th className="py-1 pr-3 font-medium">Situação</th>
                <th className="py-1 pr-3 text-right font-medium">Lidas</th>
                <th className="py-1 pr-3 text-right font-medium">Novas</th>
                <th className="py-1 pr-3 text-right font-medium">Alteradas</th>
                <th className="py-1 text-right font-medium">Removidas</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {rodadas.map((r) => (
                <tr key={r.id} className="border-t border-neutral-100 align-top">
                  <td className="py-1.5 pr-3">{new Date(r.iniciado_em).toLocaleString("pt-BR")}</td>
                  <td className="py-1.5 pr-3">
                    {ROTULO[r.tipo]} <span className="text-xs text-neutral-500">({r.origem})</span>
                  </td>
                  <td className={`py-1.5 pr-3 ${r.status === "erro" ? "text-red-700" : ""}`}>
                    {r.status === "ok" ? "OK" : r.status === "rodando" ? "Rodando…" : "Erro"}
                    {r.mensagem && <span className="block text-xs">{r.mensagem}</span>}
                  </td>
                  <td className="py-1.5 pr-3 text-right">{r.lidas}</td>
                  <td className="py-1.5 pr-3 text-right">{r.novas}</td>
                  <td className="py-1.5 pr-3 text-right">{r.alteradas}</td>
                  <td className="py-1.5 text-right">{r.removidas}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

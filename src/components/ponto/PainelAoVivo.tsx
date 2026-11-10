"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ATUALIZAR_A_CADA_S, INTERVALO_ALERTA_MIN } from "@/config/ponto";
import type { Avaliacao, Contagem } from "@/lib/ponto/aoVivo";
import type { LojaAoVivo, PainelAoVivo, PessoaAoVivo } from "@/lib/ponto/aoVivoTipos";
import { supabase } from "@/lib/supabase";

type Visao = "ponto" | "escala";

const duracao = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}` : `${min} min`);
const dataBR = (d: string) => d.split("-").reverse().join("/");

// ---------------------------------------------------------------- selos (sempre com texto, nunca só cor)

type Selo = { texto: string; classe: string; marca: string };

function seloPonto(a: Avaliacao): Selo {
  switch (a.situacao) {
    case "trabalhando": return { texto: "Trabalhando", classe: "bg-green-100 text-green-900", marca: "●" };
    case "intervalo": return { texto: "Em intervalo", classe: a.alertaIntervalo ? "bg-amber-100 text-amber-900" : "bg-sky-100 text-sky-900", marca: "◐" };
    case "encerrou": return { texto: "Encerrou", classe: "bg-neutral-100 text-neutral-700", marca: "✓" };
    case "justificado": return { texto: a.motivo ? `Justificado: ${a.motivo}` : "Justificado", classe: "bg-violet-100 text-violet-900", marca: "✎" };
    case "folga": return { texto: "Folga", classe: "bg-neutral-100 text-neutral-700", marca: "–" };
    default: return { texto: "Sem batida", classe: "bg-neutral-100 text-neutral-600", marca: "○" };
  }
}

function seloEscala(a: Avaliacao, foraDaEscala: boolean): Selo {
  if (foraDaEscala) return { texto: "Fora da escala", classe: "bg-amber-100 text-amber-900", marca: "!" };
  const atrasou = a.atrasoMin !== null;
  switch (a.situacao) {
    case "trabalhando":
    case "intervalo":
    case "encerrou":
      return atrasou ? { texto: "Atrasado", classe: "bg-amber-100 text-amber-900", marca: "▲" } : { texto: "Presente", classe: "bg-green-100 text-green-900", marca: "●" };
    case "aguardando": return { texto: "Aguardando", classe: "bg-neutral-100 text-neutral-700", marca: "○" };
    case "atrasado_sem_registro": return { texto: "Atrasado", classe: "bg-amber-100 text-amber-900", marca: "▲" };
    case "ausente": return { texto: "Ausente", classe: "bg-red-100 text-red-900", marca: "✕" };
    case "falta": return { texto: "Falta", classe: "bg-red-100 text-red-900", marca: "✕" };
    case "justificado": return { texto: a.motivo ? `Justificado: ${a.motivo}` : "Justificado", classe: "bg-violet-100 text-violet-900", marca: "✎" };
    case "folga": return { texto: "Folga", classe: "bg-neutral-100 text-neutral-700", marca: "–" };
    case "sem_registro_desatualizado": return { texto: "Sem registro (dados podem estar desatualizados)", classe: "bg-neutral-100 text-neutral-700", marca: "?" };
    default: return { texto: "Sem batida", classe: "bg-neutral-100 text-neutral-600", marca: "○" };
  }
}

/** Na visão da escala, o andamento (trabalhando, em intervalo, encerrou) vem num segundo selo ao lado de "Presente"/"Atrasado". */
function seloAndamento(a: Avaliacao): Selo | null {
  return a.situacao === "trabalhando" || a.situacao === "intervalo" || a.situacao === "encerrou" ? seloPonto(a) : null;
}

/** Detalhes em texto: o que o selo não diz. */
function detalhes(a: Avaliacao, visao: Visao): string[] {
  const d: string[] = [];
  if (a.situacao === "intervalo" && a.minutosNoIntervalo !== null) d.push(`Em intervalo há ${duracao(a.minutosNoIntervalo)}${a.alertaIntervalo ? ` ⚠ passou de ${INTERVALO_ALERTA_MIN} min` : ""}`);
  if (visao === "escala" && a.atrasoMin !== null) d.push(`Chegou ${a.atrasoMin} min depois do previsto`);
  if (a.minutosSemRegistro !== null) d.push(a.situacao === "ausente" ? `Sem registro há ${a.minutosSemRegistro} min do horário previsto` : `Sem registro há ${a.minutosSemRegistro} min`);
  if (a.situacao === "falta") d.push("Turno terminou sem nenhuma batida");
  if (a.intervaloCurtoMin !== null) d.push(`Intervalo de ${a.intervaloCurtoMin} min (menos de ${INTERVALO_ALERTA_MIN} min)`);
  if (a.semRetorno) d.push("Saiu e não voltou");
  if (a.semSaida) d.push("Sem saída depois do horário previsto");
  return d;
}

function Contadores({ c, visao }: { c: Contagem; visao: Visao }) {
  const itens: [string, number][] =
    visao === "ponto"
      ? [["Trabalhando", c.trabalhando], ["Em intervalo", c.intervalo], ["Encerraram", c.encerraram], ["Sem batida", c.aguardando], ["Folga/justificado", c.folgaOuJustificado]]
      : [["Trabalhando", c.trabalhando], ["Em intervalo", c.intervalo], ["Atrasados", c.atrasados], ["Ausentes/falta", c.ausentes], ["Encerraram", c.encerraram], ["Folga/justificado", c.folgaOuJustificado]];
  return (
    <ul className="flex flex-wrap gap-2 text-sm">
      {itens.map(([rotulo, n]) => (
        <li key={rotulo} className={`rounded-full border px-3 py-1 tabular-nums ${n > 0 && (rotulo === "Ausentes/falta" ? "border-red-300 bg-red-50" : rotulo === "Atrasados" ? "border-amber-300 bg-amber-50" : "border-neutral-300")} ${n === 0 ? "border-neutral-200 text-neutral-500" : ""}`}>
          {rotulo} <strong>{n}</strong>
        </li>
      ))}
    </ul>
  );
}

function Chip({ selo }: { selo: Selo }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${selo.classe}`}>
      <span aria-hidden>{selo.marca}</span>
      {selo.texto}
    </span>
  );
}

function Situacao({ p, visao }: { p: PessoaAoVivo; visao: Visao }) {
  const selo = visao === "escala" ? seloEscala(p.avaliacao, p.foraDaEscala) : seloPonto(p.avaliacao);
  const andamento = visao === "escala" && !p.foraDaEscala ? seloAndamento(p.avaliacao) : null;
  const extra = detalhes(p.avaliacao, visao);
  return (
    <>
      <span className="inline-flex flex-wrap gap-1">
        <Chip selo={selo} />
        {andamento && <Chip selo={andamento} />}
      </span>
      {extra.map((t) => (
        <p key={t} className={`mt-0.5 text-xs ${t.includes("⚠") ? "font-medium text-amber-900" : "text-neutral-700"}`}>
          {t}
        </p>
      ))}
    </>
  );
}

const NOMES_BATIDA = ["Entrada", "Saída interv.", "Retorno", "Saída"];

/** No celular: um cartão por pessoa, com a situação logo embaixo do nome (a tabela larga escondia a situação). */
function Cartoes({ pessoas, visao }: { pessoas: PessoaAoVivo[]; visao: Visao }) {
  return (
    <ul className="divide-y divide-neutral-100">
      {pessoas.map((p) => (
        <li key={p.chave} className="py-3">
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-medium">{p.nome}</p>
            <p className="text-xs tabular-nums text-neutral-600">{p.previsto ?? "sem horário previsto"}</p>
          </div>
          <div className="mt-1">
            <Situacao p={p} visao={visao} />
          </div>
          <p className="mt-1.5 text-xs tabular-nums text-neutral-700">
            {p.batidas.length === 0
              ? "Sem batidas"
              : p.batidas.map((b, i) => `${NOMES_BATIDA[i]} ${b.hora}${b.manual ? " (manual)" : ""}`).join(" · ")}
            {p.batidasExtras > 0 && ` · +${p.batidasExtras}`}
          </p>
        </li>
      ))}
    </ul>
  );
}

function Tabela({ pessoas, visao }: { pessoas: PessoaAoVivo[]; visao: Visao }) {
  if (pessoas.length === 0) return <p className="text-sm text-neutral-600">Ninguém nesta lista agora.</p>;
  return (
    <>
      <div className="md:hidden">
        <Cartoes pessoas={pessoas} visao={visao} />
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="text-left text-xs text-neutral-500">
            <tr>
              <th className="py-1 pr-3 font-medium">Colaborador</th>
              <th className="py-1 pr-3 font-medium">Previsto</th>
              <th className="py-1 pr-2 font-medium">Entrada</th>
              <th className="py-1 pr-2 font-medium">Saída interv.</th>
              <th className="py-1 pr-2 font-medium">Retorno</th>
              <th className="py-1 pr-3 font-medium">Saída</th>
              <th className="py-1 font-medium">Situação</th>
            </tr>
          </thead>
          <tbody>
            {pessoas.map((p) => (
              <tr key={p.chave} className="border-t border-neutral-100 align-top">
                <td className="py-2 pr-3 font-medium">{p.nome}</td>
                <td className="py-2 pr-3 tabular-nums text-neutral-600">{p.previsto ?? "—"}</td>
                {[0, 1, 2, 3].map((i) => (
                  <td key={i} className="py-2 pr-2 tabular-nums">
                    {p.batidas[i] ? (
                      <>
                        {p.batidas[i].hora}
                        {p.batidas[i].manual && <span className="ml-1 text-xs text-neutral-500" title="Batida incluída manualmente">manual</span>}
                      </>
                    ) : (
                      <span className="text-neutral-300">—</span>
                    )}
                    {i === 3 && p.batidasExtras > 0 && <span className="ml-1 text-xs text-neutral-500">+{p.batidasExtras}</span>}
                  </td>
                ))}
                <td className="py-2">
                  <Situacao p={p} visao={visao} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function CartaoLoja({ loja, visao }: { loja: LojaAoVivo; visao: Visao }) {
  const dados = visao === "ponto" ? loja.ponto : loja.escala;
  return (
    <section className="cartao space-y-3">
      <h2 className="text-lg font-semibold">{loja.nome}</h2>
      <Contadores c={dados.contagem} visao={visao} />
      <Tabela pessoas={dados.pessoas} visao={visao} />
      {visao === "escala" && loja.escala.foraDaEscala.length > 0 && (
        <details className="rounded-xl border border-amber-200 bg-amber-50" open>
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-amber-900">Bateram ponto fora da escala de hoje ({loja.escala.foraDaEscala.length})</summary>
          <div className="px-3 pb-3">
            <Tabela pessoas={loja.escala.foraDaEscala} visao="ponto" />
          </div>
        </details>
      )}
    </section>
  );
}

export function VisaoAoVivo() {
  const [visao, setVisao] = useState<Visao>("escala");
  const [painel, setPainel] = useState<PainelAoVivo | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [lido, setLido] = useState<string | null>(null);
  const emAndamento = useRef(false);

  const atualizar = useCallback(async () => {
    if (emAndamento.current) return;
    emAndamento.current = true;
    setCarregando(true);
    try {
      const { data } = await supabase().auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Sessão expirada. Entre de novo.");
      const r = await fetch("/api/ponto/ao-vivo", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const json = (await r.json().catch(() => ({}))) as PainelAoVivo & { erro?: string };
      if (!r.ok) throw new Error(r.status === 504 ? "O servidor demorou demais (504)." : (json.erro ?? `Falha ${r.status}`));
      setPainel(json);
      setLido(new Date().toLocaleTimeString("pt-BR"));
      setErro(null);
    } catch (e) {
      // Mantém o último painel na tela: falha de comunicação nunca vira "ausência" de ninguém.
      setErro((e as Error).message);
    }
    setCarregando(false);
    emAndamento.current = false;
  }, []);

  useEffect(() => {
    // Primeira leitura e depois a cada minuto, só com a aba visível.
    const primeira = setTimeout(() => void atualizar(), 0);
    const intervalo = setInterval(() => {
      if (document.visibilityState === "visible") void atualizar();
    }, ATUALIZAR_A_CADA_S * 1000);
    return () => {
      clearTimeout(primeira);
      clearInterval(intervalo);
    };
  }, [atualizar]);

  const emRascunho = painel?.escalaStatus.filter((s) => s.status !== "publicada").map((s) => s.unidade) ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" className="inline-flex rounded-lg border border-neutral-300 bg-white p-1">
          {(["escala", "ponto"] as Visao[]).map((v) => (
            <button key={v} role="tab" aria-selected={visao === v} onClick={() => setVisao(v)} className={`rounded-md px-4 py-2 text-sm font-semibold ${visao === v ? "bg-neutral-900 text-white" : "text-neutral-700 hover:bg-neutral-50"}`}>
              {v === "escala" ? "Escala de hoje" : "Ponto (todos)"}
            </button>
          ))}
        </div>
        <button className="botao-secundario !py-2" onClick={() => void atualizar()} disabled={carregando}>
          {carregando ? "Atualizando…" : "Atualizar"}
        </button>
        {painel && (
          <p className="text-sm text-neutral-600">
            Dia de trabalho {dataBR(painel.diaDeTrabalho)} · agora {painel.horaAgora} · atualizado às {lido}. Situação pelas batidas recebidas até agora.
          </p>
        )}
      </div>

      {erro && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          Não consegui atualizar agora ({erro}). {painel ? `Mostrando os dados de ${lido}. ` : ""}Falta de dados não significa falta do colaborador.
        </p>
      )}
      {visao === "escala" && emRascunho.length > 0 && <p className="rounded-xl border border-neutral-200 bg-white p-3 text-sm text-neutral-700">Escala de hoje ainda em rascunho ({emRascunho.join(", ")}): serve para testar.</p>}
      {!painel && !erro && <p className="text-neutral-600">Carregando…</p>}

      {painel && (
        <div className="space-y-4">
          {painel.lojas.map((l) => (
            <CartaoLoja key={l.chave} loja={l} visao={visao} />
          ))}
          {visao === "escala" && painel.semVinculo.length > 0 && (
            <section className="cartao space-y-2">
              <h2 className="text-lg font-semibold">Escalados sem vínculo com o Secullum ({painel.semVinculo.length})</h2>
              <p className="text-sm text-neutral-600">Não dá para saber se chegaram. Faça o vínculo em RH &gt; Integração do ponto &gt; Conferir funcionários.</p>
              <ul className="text-sm">
                {painel.semVinculo.map((p) => (
                  <li key={p.chave} className="border-t border-neutral-100 py-1.5">
                    <span className="font-medium">{p.nome}</span> <span className="text-neutral-600">· {p.unidade} · previsto {p.previsto ?? "—"}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

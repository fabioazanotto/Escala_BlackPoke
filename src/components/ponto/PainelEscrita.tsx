"use client";

import { useEffect, useState } from "react";
import { enviar } from "@/components/ponto/chamar";
import type { Justificativa } from "@/lib/ponto/escrita";
import type { Previa, ResultadoEscrita } from "@/lib/servidor/pontoEscrita";

export type ConfigEscrita =
  | { tipo: "justificar"; funcionarioId: number; nome: string; dia: string }
  | { tipo: "remover_justificativa"; funcionarioId: number; nome: string; dia: string }
  | { tipo: "afastamento"; funcionarioId: number; nome: string }
  | { tipo: "remover_afastamento"; funcionarioId: number; nome: string; inicio: string; fim: string };

type Resp = { modoTeste: boolean; justificativas?: Justificativa[]; previa?: Previa; resultado?: ResultadoEscrita };

const dataBR = (d: string) => d.split("-").reverse().join("/");
const TITULO: Record<ConfigEscrita["tipo"], string> = {
  justificar: "Justificar falta no Secullum",
  remover_justificativa: "Remover justificativa no Secullum",
  afastamento: "Lançar afastamento no Secullum",
  remover_afastamento: "Apagar afastamento no Secullum",
};

/** Janela de escrita no Secullum: formulário → prévia do que vai mudar → confirmação → resultado conferido. Só o creator vê. */
export function PainelEscrita({ config, onFechar, onConcluido }: { config: ConfigEscrita; onFechar: () => void; onConcluido: () => void }) {
  const [justificativas, setJustificativas] = useState<Justificativa[] | null>(null);
  const [justificativa, setJustificativa] = useState("");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [motivo, setMotivo] = useState("");
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [resultado, setResultado] = useState<ResultadoEscrita | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [modoTeste, setModoTeste] = useState(true);

  const precisaJustificativa = config.tipo === "justificar" || config.tipo === "afastamento";

  useEffect(() => {
    if (!precisaJustificativa) return;
    let ativo = true;
    enviar<Resp>("/api/ponto/escrita", { acao: "opcoes" })
      .then((r) => {
        if (!ativo) return;
        setJustificativas(r.justificativas ?? []);
        setModoTeste(r.modoTeste);
      })
      .catch((e) => ativo && setErro((e as Error).message));
    return () => {
      ativo = false;
    };
  }, [precisaJustificativa]);

  function corpo(confirmar: boolean) {
    const base = { funcionario: config.funcionarioId, confirmar };
    switch (config.tipo) {
      case "justificar": return { acao: "justificar", ...base, dia: config.dia, justificativa };
      case "remover_justificativa": return { acao: "remover_justificativa", ...base, dia: config.dia };
      case "afastamento": return { acao: "afastamento", ...base, inicio, fim, justificativa, motivo };
      case "remover_afastamento": return { acao: "remover_afastamento", ...base, inicio: config.inicio, fim: config.fim };
    }
  }

  async function pedir(confirmar: boolean) {
    setOcupado(true);
    setErro(null);
    try {
      const r = await enviar<Resp>("/api/ponto/escrita", corpo(confirmar));
      setModoTeste(r.modoTeste);
      if (r.previa) setPrevia(r.previa);
      if (r.resultado) {
        setResultado(r.resultado);
        onConcluido();
      }
    } catch (e) {
      setErro((e as Error).message);
    }
    setOcupado(false);
  }

  const formPronto =
    config.tipo === "justificar" ? justificativa !== "" : config.tipo === "afastamento" ? justificativa !== "" && inicio !== "" && fim !== "" : true;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="titulo-escrita" className="nao-imprimir fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button aria-label="Fechar" className="absolute inset-0 bg-black/50" onClick={onFechar} />
      <div className="relative max-h-[92vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
        <div>
          <h2 id="titulo-escrita" className="text-lg font-semibold">
            {TITULO[config.tipo]}
          </h2>
          <p className="text-sm text-neutral-600">
            {config.nome}
            {"dia" in config ? ` · ${dataBR(config.dia)}` : ""}
            {"inicio" in config ? ` · ${dataBR(config.inicio)} a ${dataBR(config.fim)}` : ""}
          </p>
          {modoTeste && <p className="mt-1 inline-block rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">Modo teste: só vale para o funcionário “Teste”</p>}
        </div>

        {!resultado && !previa && (
          <div className="space-y-3">
            {precisaJustificativa && (
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Justificativa</span>
                <select className="campo" value={justificativa} onChange={(e) => setJustificativa(e.target.value)} disabled={!justificativas}>
                  <option value="">{justificativas ? "Escolha…" : "Carregando…"}</option>
                  {(justificativas ?? []).map((j) => (
                    <option key={j.abreviada} value={j.abreviada}>
                      {j.completa ? `${j.completa} (${j.abreviada})` : j.abreviada}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {config.tipo === "afastamento" && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium">Primeiro dia</span>
                    <input className="campo" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium">Último dia</span>
                    <input className="campo" type="date" min={inicio || undefined} value={fim} onChange={(e) => setFim(e.target.value)} />
                  </label>
                </div>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">Motivo (opcional)</span>
                  <input className="campo" maxLength={100} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
                  <span className="mt-1 block text-xs text-neutral-600">Não escreva diagnóstico nem CID.</span>
                </label>
              </>
            )}
            {(config.tipo === "remover_justificativa" || config.tipo === "remover_afastamento") && <p className="text-sm text-neutral-700">O app vai conferir no Secullum o que existe antes de mostrar o que será removido.</p>}
          </div>
        )}

        {previa && !resultado && (
          <div className="space-y-2 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
            <p className="font-semibold">O que vai mudar no Secullum</p>
            <ul className="space-y-0.5 text-sm">
              {previa.linhas.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            {previa.avisos.map((a) => (
              <p key={a} className="rounded-lg bg-amber-50 p-2 text-sm text-amber-900">
                {a}
              </p>
            ))}
            <p className="text-xs text-neutral-600">O Secullum registra a alteração no log dele, e o BlackPoke guarda uma auditoria (sem CPF).</p>
          </div>
        )}

        {resultado && (
          <p className={`rounded-xl p-3 text-sm ${resultado.avisos.length ? "bg-amber-50 text-amber-900" : "bg-green-50 text-green-900"}`}>
            {resultado.mensagem}
            {resultado.avisos.map((a) => (
              <span key={a} className="block">
                {a}
              </span>
            ))}
          </p>
        )}
        {erro && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{erro}</p>}

        <div className="flex flex-wrap gap-2">
          {resultado ? (
            <button type="button" className="botao w-full" onClick={onFechar}>
              Fechar
            </button>
          ) : previa ? (
            <>
              <button type="button" className="botao" disabled={ocupado} onClick={() => void pedir(true)}>
                {ocupado ? "Gravando…" : "Confirmar e gravar no Secullum"}
              </button>
              <button type="button" className="botao-secundario" disabled={ocupado} onClick={() => { setPrevia(null); setErro(null); }}>
                Voltar
              </button>
            </>
          ) : (
            <>
              <button type="button" className="botao" disabled={ocupado || !formPronto} onClick={() => void pedir(false)}>
                {ocupado ? "Conferindo…" : "Ver o que vai mudar"}
              </button>
              <button type="button" className="botao-secundario" onClick={onFechar}>
                Cancelar
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

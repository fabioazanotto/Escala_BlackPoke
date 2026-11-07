"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icone } from "@/components/Icones";
import { DIAS_SEMANA, dataBR, paraData } from "@/lib/datas";
import { compararImpacto } from "@/lib/escala/impacto";
import { avaliarEscala } from "@/lib/escala/motor";
import type { Celulas, EntradaMotor, ResultadoMotor, Situacao } from "@/lib/escala/tipos";
import { CELULA, SITUACOES_EDITAVEIS } from "./rotulos";

export type PedidoEdicao = { colaboradorId: string; data: string };

export function DialogoEdicao({
  pedido,
  entrada,
  celulas,
  resultado,
  travados,
  nomes,
  funcaoNome,
  podeEditar,
  aoSalvar,
  aoFechar,
}: {
  pedido: PedidoEdicao;
  entrada: EntradaMotor;
  celulas: Celulas;
  resultado: ResultadoMotor;
  travados: Set<string>;
  nomes: Map<string, string>;
  funcaoNome: (id: string) => string;
  podeEditar: boolean;
  aoSalvar: (nova: Situacao, motivo: string, travar: boolean) => Promise<void>;
  aoFechar: () => void;
}) {
  const atual: Situacao = resultado.celulas[pedido.colaboradorId]?.[pedido.data] ?? "trabalha";
  const travadaAntes = travados.has(`${pedido.colaboradorId}|${pedido.data}`);
  const [nova, setNova] = useState<Situacao>(atual);
  const [motivo, setMotivo] = useState("");
  const [travar, setTravar] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const primeiro = useRef<HTMLInputElement>(null);

  const editavel = podeEditar && SITUACOES_EDITAVEIS.includes(atual);

  useEffect(() => {
    primeiro.current?.focus();
    const fechar = (e: KeyboardEvent) => e.key === "Escape" && aoFechar();
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [aoFechar]);

  const impacto = useMemo(() => {
    if (nova === atual) return null;
    const hipotetica: Celulas = { ...celulas, [pedido.colaboradorId]: { ...celulas[pedido.colaboradorId], [pedido.data]: nova } };
    return compararImpacto(resultado, avaliarEscala(entrada, hipotetica));
  }, [nova, atual, celulas, entrada, resultado, pedido]);

  const mudou = nova !== atual || travar !== travadaAntes;

  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      await aoSalvar(nova, motivo.trim(), travar);
    } catch (ex) {
      setErro((ex as { message?: string }).message ?? String(ex));
      setSalvando(false);
    }
  }

  const dow = paraData(pedido.data).getDay();
  const colab = entrada.colaboradores.find((c) => c.id === pedido.colaboradorId);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={aoFechar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Alterar a escala"
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-md sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{nomes.get(pedido.colaboradorId)}</h2>
            <p className="text-sm text-neutral-600">
              {colab ? funcaoNome(colab.funcaoPrincipalId) + " · " : ""}
              {DIAS_SEMANA[dow]}, {dataBR(pedido.data)}
            </p>
          </div>
          <button aria-label="Fechar" className="rounded-lg p-1.5 hover:bg-neutral-100" onClick={aoFechar}>
            <Icone nome="fechar" />
          </button>
        </div>

        {!editavel ? (
          <div className="space-y-3 text-sm">
            <p className="rounded-xl bg-neutral-100 p-3">
              Situação atual: <strong>{CELULA[atual].nome}</strong>.
              {!podeEditar
                ? " Esta escala não pode ser alterada no estado atual."
                : atual === "fora"
                  ? " O colaborador não tem vínculo neste dia (antes da admissão ou depois do desligamento)."
                  : " Férias, afastamentos e indisponibilidades são lançados na tela Ausências, para não haver duas fontes da mesma informação."}
            </p>
            {podeEditar && atual !== "fora" && (
              <Link href="/ausencias" className="botao-secundario w-full">Ir para Ausências</Link>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm font-medium">Situação neste dia</legend>
              {SITUACOES_EDITAVEIS.map((s, i) => (
                <label
                  key={s}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 ${nova === s ? "border-neutral-900 bg-neutral-50 font-semibold" : "border-neutral-300"}`}
                >
                  <input ref={i === 0 ? primeiro : undefined} type="radio" name="situacao" className="h-4 w-4" checked={nova === s} onChange={() => setNova(s)} />
                  <span className={`inline-flex h-6 min-w-6 items-center justify-center rounded px-1 text-xs ${CELULA[s].classe} ${s === "trabalha" ? "border border-neutral-300" : ""}`}>{CELULA[s].letra || "·"}</span>
                  {CELULA[s].nome}
                  {s === atual && <span className="ml-auto text-xs font-normal text-neutral-500">atual</span>}
                </label>
              ))}
            </fieldset>

            {impacto && (
              <div className="space-y-1.5 text-sm" aria-live="polite">
                {impacto.piora.map((m) => (
                  <p key={`${m.depois.data}${m.depois.turno}${m.depois.funcaoId}`} className="flex items-start gap-2 rounded-lg bg-red-50 p-2.5 text-red-800">
                    <Icone nome="alerta" tamanho={16} className="mt-0.5 shrink-0" />
                    <span>
                      {m.depois.estado === "deficit" ? "Deixa em déficit" : "Reduz a cobertura de"} {funcaoNome(m.depois.funcaoId)} ({m.depois.turno === "dia" ? "dia" : "noite"}, {dataBR(m.depois.data).slice(0, 5)}): {m.depois.presentes} de {m.depois.ideal}.
                    </span>
                  </p>
                ))}
                {impacto.novosConflitos.map((c, i) => (
                  <p key={i} className="flex items-start gap-2 rounded-lg bg-red-50 p-2.5 text-red-800">
                    <Icone nome="alerta" tamanho={16} className="mt-0.5 shrink-0" />
                    <span>Conflito trabalhista: {c.mensagem}</span>
                  </p>
                ))}
                {impacto.melhora.map((m) => (
                  <p key={`m${m.depois.data}${m.depois.turno}${m.depois.funcaoId}`} className="flex items-start gap-2 rounded-lg bg-green-50 p-2.5 text-green-900">
                    <Icone nome="ok" tamanho={16} className="mt-0.5 shrink-0" />
                    <span>Melhora a cobertura de {funcaoNome(m.depois.funcaoId)} ({m.depois.turno === "dia" ? "dia" : "noite"}): {m.depois.presentes} de {m.depois.ideal}.</span>
                  </p>
                ))}
                {impacto.piora.length === 0 && impacto.novosConflitos.length === 0 && impacto.melhora.length === 0 && (
                  <p className="rounded-lg bg-neutral-100 p-2.5 text-neutral-700">Esta troca não muda a cobertura nem gera conflito.</p>
                )}
                {(impacto.piora.length > 0 || impacto.novosConflitos.length > 0) && (
                  <p className="text-xs text-neutral-600">Você pode salvar mesmo assim: a decisão é da gerência.</p>
                )}
              </div>
            )}

            <label className="block">
              <span className="mb-1 block text-sm font-medium">Motivo (opcional)</span>
              <input className="campo" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: troca combinada com a equipe" />
            </label>
            <label className="flex items-center gap-3 text-sm">
              <input type="checkbox" className="h-5 w-5" checked={travar} onChange={(e) => setTravar(e.target.checked)} />
              <span>
                Manter travada <span className="text-neutral-600">(“Gerar novamente” não desfaz)</span>
              </span>
            </label>
            {erro && <p className="rounded-lg bg-red-50 p-2.5 text-sm text-red-700">{erro}</p>}
            <div className="flex gap-2">
              <button className="botao flex-1" disabled={!mudou || salvando} onClick={salvar}>
                {salvando ? "Salvando…" : "Salvar alteração"}
              </button>
              <button className="botao-secundario flex-1" onClick={aoFechar}>Cancelar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

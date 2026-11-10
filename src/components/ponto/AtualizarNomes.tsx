"use client";

import { useState } from "react";
import type { PropostaNome } from "@/lib/ponto/nomes";
import { supabase } from "@/lib/supabase";

async function enviar<T>(corpo: object): Promise<T> {
  const { data } = await supabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sessão expirada. Entre de novo.");
  const r = await fetch("/api/ponto/nomes", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(corpo), cache: "no-store" });
  const json = (await r.json().catch(() => ({}))) as T & { erro?: string };
  if (!r.ok) throw new Error(r.status === 504 ? "O servidor demorou demais (504). Tente de novo." : (json.erro ?? `Falha ${r.status}`));
  return json;
}

/** Copia o nome completo e a empresa do Secullum para os colaboradores vinculados, depois de mostrar o que vai mudar. */
export function AtualizarNomes() {
  const [propostas, setPropostas] = useState<PropostaNome[] | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [ocupado, setOcupado] = useState<"ver" | "aplicar" | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<string | null>(null);

  async function ver() {
    setOcupado("ver");
    setErro(null);
    setFeito(null);
    try {
      const r = await enviar<{ propostas: PropostaNome[] }>({ modo: "ver" });
      setPropostas(r.propostas);
      setMarcados(new Set(r.propostas.filter((p) => p.muda).map((p) => p.colaboradorId)));
    } catch (e) {
      setPropostas(null);
      setErro((e as Error).message);
    }
    setOcupado(null);
  }

  async function aplicar() {
    if (marcados.size === 0) return;
    if (!window.confirm(`Atualizar o nome completo e a empresa de ${marcados.size} colaborador(es)? O nome curto da escala não muda.`)) return;
    setOcupado("aplicar");
    setErro(null);
    try {
      const r = await enviar<{ atualizados: number }>({ modo: "aplicar", ids: [...marcados] });
      setFeito(`${r.atualizados} colaborador(es) atualizado(s).`);
      await ver();
      setFeito(`${r.atualizados} colaborador(es) atualizado(s).`);
    } catch (e) {
      setErro((e as Error).message);
    }
    setOcupado(null);
  }

  const mudam = propostas?.filter((p) => p.muda) ?? [];

  return (
    <section className="cartao max-w-5xl space-y-3">
      <h2 className="text-lg font-semibold">Nome completo e empresa pelo Secullum</h2>
      <p className="text-neutral-700">
        Para os colaboradores já vinculados, copia o <strong>nome completo</strong> e a <strong>empresa</strong> do Secullum para o cadastro do BlackPoke. Antes de gravar, mostra o que vai mudar. O nome curto usado na escala <strong>não é alterado</strong> e o CPF não é copiado.
      </p>
      <button className="botao" onClick={ver} disabled={ocupado !== null}>
        {ocupado === "ver" ? "Consultando o Secullum…" : "Ver o que vai mudar"}
      </button>
      {erro && <p className="rounded-xl bg-red-50 p-3 text-red-700">{erro}</p>}
      {feito && <p className="rounded-xl bg-green-50 p-3 text-green-900">{feito}</p>}

      {propostas && (
        <div className="space-y-3">
          <p className="text-sm text-neutral-600">
            {propostas.length} colaborador(es) vinculado(s): {mudam.length} com alteração, {propostas.length - mudam.length} já estão iguais.
          </p>
          {mudam.length > 0 && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="text-left text-xs text-neutral-500">
                    <tr>
                      <th className="w-8 py-1 font-medium" />
                      <th className="py-1 pr-3 font-medium">Nome na escala</th>
                      <th className="py-1 pr-3 font-medium">Nome completo (Secullum)</th>
                      <th className="py-1 font-medium">Empresa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mudam.map((p) => (
                      <tr key={p.colaboradorId} className="border-t border-neutral-100 align-top">
                        <td className="py-2">
                          <input
                            type="checkbox"
                            aria-label={`Atualizar ${p.nomeCurto}`}
                            checked={marcados.has(p.colaboradorId)}
                            onChange={(e) => setMarcados((s) => { const n = new Set(s); if (e.target.checked) n.add(p.colaboradorId); else n.delete(p.colaboradorId); return n; })}
                          />
                        </td>
                        <td className="py-2 pr-3 font-medium">{p.nomeCurto}</td>
                        <td className="py-2 pr-3">
                          {p.nomeCompletoAtual && p.nomeCompletoAtual !== p.nomeCompletoNovo && <span className="mr-1 text-neutral-400 line-through">{p.nomeCompletoAtual}</span>}
                          {p.nomeCompletoNovo}
                        </td>
                        <td className="py-2">
                          {p.empresaAtual && p.empresaAtual !== p.empresaNova && <span className="mr-1 text-neutral-400 line-through">{p.empresaAtual}</span>}
                          {p.empresaNova}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button className="botao" onClick={aplicar} disabled={ocupado !== null || marcados.size === 0}>
                {ocupado === "aplicar" ? "Gravando…" : `Atualizar ${marcados.size} colaborador(es)`}
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}

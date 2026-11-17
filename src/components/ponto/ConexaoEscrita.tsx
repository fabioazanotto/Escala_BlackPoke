"use client";

import { useState } from "react";
import { enviar } from "@/components/ponto/chamar";
import type { DiagnosticoEscrita } from "@/lib/servidor/pontoEscrita";

/** Testa a conta de ESCRITA do Secullum só com leitura: quem ela é para o Secullum e o que enxerga. Não grava nada. */
export function ConexaoEscrita() {
  const [d, setD] = useState<DiagnosticoEscrita | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function testar() {
    setOcupado(true);
    setErro(null);
    try {
      const r = await enviar<{ diagnostico?: DiagnosticoEscrita }>("/api/ponto/escrita", { acao: "diagnostico_escrita" });
      setD(r.diagnostico ?? null);
    } catch (e) {
      setD(null);
      setErro((e as Error).message);
    }
    setOcupado(false);
  }

  return (
    <section className="cartao space-y-3">
      <h2 className="text-lg font-semibold">Conexão de escrita (só você)</h2>
      <p className="text-sm text-neutral-700">
        Testa a conta usada para escrever no Secullum, <strong>só lendo</strong>: mostra quem ela é para o Secullum e o que ela enxerga. Não grava nada.
      </p>
      <button type="button" className="botao" disabled={ocupado} onClick={() => void testar()}>
        {ocupado ? "Testando…" : "Testar conexão de escrita"}
      </button>
      {erro && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{erro}</p>}
      {d && (
        <ul className="space-y-1 text-sm">
          <li>
            Conta autenticada: <strong>{d.conta ? `${d.conta.nome || "(sem nome)"} · ${d.conta.email}` : "não consegui identificar"}</strong>
          </li>
          <li>
            Empresas que ela enxerga ({d.empresasVisiveis.length}): {d.empresasVisiveis.join(", ") || "nenhuma"}
          </li>
          <li className={d.empresasDoProjetoQueNaoEnxerga.length ? "font-medium text-red-700" : ""}>
            Empresas do projeto que ela NÃO enxerga: {d.empresasDoProjetoQueNaoEnxerga.join(", ") || "nenhuma"}
          </li>
          <li>Funcionários que ela enxerga: {d.funcionarios}</li>
          <li className={d.testeVisivel ? "" : "font-medium text-red-700"}>Funcionário “Teste” visível para ela: {d.testeVisivel ? "sim" : "não"}</li>
          <li>Justificativas que ela enxerga: {d.justificativas}</li>
        </ul>
      )}
    </section>
  );
}

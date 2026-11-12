"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { carregarLojas, carregarRecordes, carregarVistos, marcarVistos } from "@/lib/vendas/carregar";
import { agruparAlertas, descreverAlerta, type AlertaLoja } from "@/lib/vendas/recordes";

/** Pop-up "Batemos recorde!" quando o admin entra e há recorde novo que ele ainda não viu. Aparece uma vez por recorde. */
export function AlertaRecordes() {
  const [alertas, setAlertas] = useState<AlertaLoja[]>([]);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const [rs, lojas, vistos] = await Promise.all([carregarRecordes(), carregarLojas(), carregarVistos("popup")]);
        const a = agruparAlertas(rs, lojas.map((l) => ({ id: l.id, nome: l.nome, alertarRecordes: l.alertarRecordes })), vistos);
        if (ativo) setAlertas(a);
      } catch {
        /* sem as tabelas ou sem permissão: sem pop-up */
      }
    })();
    return () => {
      ativo = false;
    };
  }, []);

  async function fechar() {
    const ids = alertas.flatMap((a) => a.ids);
    setAlertas([]);
    await marcarVistos(ids, "popup");
  }

  if (alertas.length === 0) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="titulo-recorde">
      <button aria-label="Fechar" className="absolute inset-0 bg-black/50" onClick={() => void fechar()} />
      <div className="relative w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-2xl">
        <p className="text-center text-5xl" aria-hidden>
          🎉🏆
        </p>
        <h2 id="titulo-recorde" className="text-center text-2xl font-bold">
          Batemos recorde!
        </h2>
        <ul className="space-y-3">
          {alertas.map((a) => {
            const d = descreverAlerta(a);
            return (
              <li key={a.lojaId} className="rounded-xl border border-green-300 bg-green-50 p-3 text-green-950">
                <p className="font-semibold">{d.titulo}</p>
                {d.detalhes.map((t) => (
                  <p key={t} className="text-sm">
                    {t}
                  </p>
                ))}
              </li>
            );
          })}
        </ul>
        <div className="flex gap-2">
          <Link href="/vendas" onClick={() => void fechar()} className="botao flex-1">
            Ver vendas
          </Link>
          <button className="botao-secundario flex-1" onClick={() => void fechar()}>
            Entendi
          </button>
        </div>
      </div>
    </div>
  );
}

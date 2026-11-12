"use client";

import { useCallback, useEffect, useState } from "react";
import { carregarLojas, carregarRecordes, carregarVistos, marcarVistos } from "@/lib/vendas/carregar";
import { agruparAlertas, descreverAlerta, type AlertaLoja } from "@/lib/vendas/recordes";

/** Faixa verde no topo de Vendas: quem bateu recorde e em quê. Fica até o admin dispensar (cada admin dispensa a sua). */
export function FaixaRecordes() {
  const [alertas, setAlertas] = useState<AlertaLoja[]>([]);

  const ler = useCallback(async () => {
    try {
      const [rs, lojas, vistos] = await Promise.all([carregarRecordes(), carregarLojas(), carregarVistos("faixa")]);
      return agruparAlertas(rs, lojas.map((l) => ({ id: l.id, nome: l.nome, alertarRecordes: l.alertarRecordes })), vistos);
    } catch {
      return [] as AlertaLoja[]; // sem as tabelas ou sem permissão: simplesmente não mostra a faixa
    }
  }, []);

  useEffect(() => {
    let ativo = true;
    void ler().then((a) => ativo && setAlertas(a));
    return () => {
      ativo = false;
    };
  }, [ler]);

  async function dispensar(a: AlertaLoja) {
    setAlertas((atual) => atual.filter((x) => x.lojaId !== a.lojaId));
    await marcarVistos(a.ids, "faixa");
  }

  if (alertas.length === 0) return null;
  return (
    <div className="mb-4 space-y-2" role="status">
      {alertas.map((a) => {
        const d = descreverAlerta(a);
        return (
          <div key={a.lojaId} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-green-300 bg-green-50 p-3 text-green-950">
            <div>
              <p className="font-semibold">🏆 {d.titulo}</p>
              <ul className="mt-0.5 text-sm">
                {d.detalhes.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
            <button className="botao-secundario !py-2" onClick={() => void dispensar(a)}>
              Dispensar
            </button>
          </div>
        );
      })}
    </div>
  );
}

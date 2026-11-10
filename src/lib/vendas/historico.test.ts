import { describe, expect, it } from "vitest";
import type { VendaResumida } from "@/lib/tipos";
import { completarHistorico, type AmbienteHistorico } from "./historico";

const venda: VendaResumida = {
  lojaChave: "pg", saleId: 1, saleGuid: "g", dataCaixa: "2026-11-01", periodo: "noite", canal: "balcao",
  entrega: false, retirada: false, cancelada: false, bruto: 10, desconto: 0, descontoFuncionarios: 0, taxaEntrega: 0, liquido: 10,
};

function montar(marcos: Record<string, string | null> = {}, extra: Partial<AmbienteHistorico> = {}) {
  const dias: string[] = [];
  const m = { pg: null, santos: null, miyagi: null, abc: null, ...marcos } as Record<string, string | null>;
  const amb: AmbienteHistorico = {
    hoje: () => "2026-11-10",
    tokenConfigurado: () => true,
    buscarVendas: async () => [venda],
    gravarDia: async (l, dia) => void dias.push(`${l.chave}:${dia}`),
    registrar: async () => undefined,
    lerMarco: async (l) => m[l.chave] ?? null,
    gravarMarco: async (l, dia) => void (m[l.chave] = dia),
    ...extra,
  };
  return { amb, dias, m };
}

describe("completarHistorico", () => {
  it("sem marco, começa antes dos 3 dias da atualização automática e volta N dias", async () => {
    const { amb, dias, m } = montar();
    const r = await completarHistorico(amb, { desde: "2026-01-01", diasPorRodada: 4, lojas: ["pg"] });
    expect(dias).toEqual(["pg:2026-11-07", "pg:2026-11-06", "pg:2026-11-05", "pg:2026-11-04"]);
    expect(m.pg).toBe("2026-11-04");
    expect(r[0]).toMatchObject({ status: "ok", diasGravados: 4, marco: "2026-11-04", completo: false });
  });

  it("a rodada seguinte continua de onde parou", async () => {
    const { amb, dias } = montar({ pg: "2026-11-04" });
    await completarHistorico(amb, { desde: "2026-01-01", diasPorRodada: 2, lojas: ["pg"] });
    expect(dias).toEqual(["pg:2026-11-03", "pg:2026-11-02"]);
  });

  it("para na data desejada e marca como completo", async () => {
    const { amb, dias } = montar({ pg: "2026-01-03" });
    const r = await completarHistorico(amb, { desde: "2026-01-01", diasPorRodada: 4, lojas: ["pg"] });
    expect(dias).toEqual(["pg:2026-01-02", "pg:2026-01-01"]);
    expect(r[0].completo).toBe(true);
    // e na rodada seguinte não faz mais nada
    const outra = montar({ pg: "2026-01-01" });
    const r2 = await completarHistorico(outra.amb, { desde: "2026-01-01", diasPorRodada: 4, lojas: ["pg"] });
    expect(outra.dias).toHaveLength(0);
    expect(r2[0]).toMatchObject({ completo: true, diasGravados: 0 });
  });

  it("em caso de erro o marco fica no último dia gravado, sem buraco", async () => {
    let n = 0;
    const { amb, m } = montar({}, { buscarVendas: async () => { if (++n === 3) throw new Error("limite de chamadas"); return [venda]; } });
    const r = await completarHistorico(amb, { desde: "2026-01-01", diasPorRodada: 4, lojas: ["pg"] });
    expect(m.pg).toBe("2026-11-06"); // gravou 07 e 06; o 05 falhou
    expect(r[0]).toMatchObject({ status: "erro", diasGravados: 2, completo: false });
    expect(r[0].mensagem).toContain("limite");
  });

  it("uma loja com erro não impede as próximas", async () => {
    const { amb } = montar({}, { buscarVendas: async (l) => { if (l.chave === "pg") throw new Error("falhou"); return [venda]; } });
    const r = await completarHistorico(amb, { desde: "2026-01-01", diasPorRodada: 2 });
    expect(r.find((x) => x.chave === "pg")?.status).toBe("erro");
    expect(r.filter((x) => x.status === "ok")).toHaveLength(3);
  });

  it("loja sem token é pulada", async () => {
    const { amb } = montar({}, { tokenConfigurado: (l) => l.chave !== "abc" });
    const r = await completarHistorico(amb, { desde: "2026-01-01", diasPorRodada: 1 });
    expect(r.find((x) => x.chave === "abc")?.status).toBe("sem_token");
  });
});

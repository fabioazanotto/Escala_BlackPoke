import { describe, expect, it, vi } from "vitest";
import type { VendaResumida } from "@/lib/tipos";
import { intervaloDoPedido, sincronizarVendas, type Ambiente } from "./sincronizar";

const venda = (o: Partial<VendaResumida> = {}): VendaResumida => ({
  lojaChave: "pg", saleId: 1, saleGuid: "g", dataCaixa: "2026-11-05", periodo: "noite", canal: "balcao",
  entrega: false, retirada: false, cancelada: false, bruto: 100, desconto: 0, descontoFuncionarios: 0, taxaEntrega: 0, liquido: 100, ...o,
});

function ambiente(extra: Partial<Ambiente> = {}) {
  const gravados: { loja: string; dia: string; linhas: number }[] = [];
  const registros: { loja: string; status: string; dias: number; mensagem?: string }[] = [];
  const amb: Ambiente = {
    hoje: () => "2026-11-07",
    tokenConfigurado: () => true,
    buscarVendas: async () => [venda()],
    gravarDia: async (l, dia, linhas) => void gravados.push({ loja: l.chave, dia, linhas: linhas.length }),
    registrar: async (l, p) => void registros.push({ loja: l.chave, status: p.status, dias: p.dias, mensagem: p.mensagem }),
    ...extra,
  };
  return { amb, gravados, registros };
}

describe("intervaloDoPedido", () => {
  it("sem datas: hoje e os 2 dias anteriores", () => {
    expect(intervaloDoPedido({ origem: "automatica" }, "2026-11-07")).toEqual({ de: "2026-11-05", ate: "2026-11-07" });
  });
  it("recusa datas ruins, futuras ou períodos enormes", () => {
    expect(() => intervaloDoPedido({ origem: "manual", dataDe: "xx" }, "2026-11-07")).toThrow();
    expect(() => intervaloDoPedido({ origem: "manual", dataDe: "2026-11-08", dataAte: "2026-11-09" }, "2026-11-07")).toThrow(/futuras/);
    expect(() => intervaloDoPedido({ origem: "manual", dataDe: "2026-11-07", dataAte: "2026-11-01" }, "2026-11-07")).toThrow();
    expect(() => intervaloDoPedido({ origem: "manual", dataDe: "2025-01-01" }, "2026-11-07")).toThrow(/grande demais/);
  });
  it("aceita 90 dias", () => {
    expect(intervaloDoPedido({ origem: "historico", dataDe: "2026-08-10" }, "2026-11-07")).toEqual({ de: "2026-08-10", ate: "2026-11-07" });
  });
});

describe("sincronizarVendas", () => {
  it("grava cada dia de cada loja e registra o resultado", async () => {
    const { amb, gravados, registros } = ambiente();
    const r = await sincronizarVendas({ origem: "automatica" }, amb);
    expect(r).toHaveLength(4);
    expect(r.every((x) => x.status === "ok" && x.diasGravados === 3)).toBe(true);
    expect(gravados).toHaveLength(12);
    expect(registros.every((x) => x.status === "ok")).toBe(true);
  });

  it("uma loja com erro não derruba as outras", async () => {
    const { amb, registros } = ambiente({
      buscarVendas: async (l) => {
        if (l.chave === "santos") throw new Error("Xmenu fora do ar");
        return [venda()];
      },
    });
    const r = await sincronizarVendas({ origem: "manual" }, amb);
    const santos = r.find((x) => x.chave === "santos")!;
    expect(santos.status).toBe("erro");
    expect(santos.mensagem).toContain("fora do ar");
    expect(r.filter((x) => x.status === "ok")).toHaveLength(3);
    expect(registros.find((x) => x.loja === "santos")?.status).toBe("erro");
  });

  it("loja sem token é pulada sem chamar o Xmenu", async () => {
    const buscar = vi.fn(async () => [venda()]);
    const { amb } = ambiente({ tokenConfigurado: (l) => l.chave !== "abc", buscarVendas: buscar });
    const r = await sincronizarVendas({ origem: "automatica" }, amb);
    expect(r.find((x) => x.chave === "abc")?.status).toBe("sem_token");
    expect(buscar).toHaveBeenCalledTimes(9);
  });

  it("filtra por lojas pedidas", async () => {
    const { amb } = ambiente();
    const r = await sincronizarVendas({ origem: "manual", lojas: ["pg"] }, amb);
    expect(r.map((x) => x.chave)).toEqual(["pg"]);
  });

  it("falha na gravação conta só os dias já gravados", async () => {
    let n = 0;
    const { amb } = ambiente({ gravarDia: async () => { if (++n === 2) throw new Error("banco caiu"); } });
    const r = await sincronizarVendas({ origem: "manual", lojas: ["pg"] }, amb);
    expect(r[0]).toMatchObject({ status: "erro", diasGravados: 1 });
  });
});

import { describe, expect, it, vi } from "vitest";
import type { MarcacaoNormalizada } from "./marcacoes";
import { sincronizarPonto, type AmbienteSync } from "./sincronizacao";

const bruto = (id: number, funcionario = 10, data = "2026-11-09") => ({ Id: id, Data: data, Hora: "09:00", FuncionarioId: funcionario, Tipo: 0, Origem: 4, EquipamentoId: 2 });

function montar(extra: Partial<AmbienteSync> = {}) {
  const gravados: { qtd: number; janela?: { de: string; ate: string } }[] = [];
  let cursor: number | null = null;
  const concluidos: { status: string; mensagem?: string }[] = [];
  const amb: AmbienteSync = {
    hoje: () => "2026-11-10",
    funcionariosIncluidos: async () => new Map([[10, 3]]),
    lerPorPeriodo: async () => [bruto(1), bruto(2), bruto(3, 99)],
    lerAPartirDoId: async () => [],
    gravar: async (m: MarcacaoNormalizada[], janela) => {
      gravados.push({ qtd: m.length, janela });
      return { novas: m.length, alteradas: 0, iguais: 0, removidas: 0 };
    },
    lerCursor: async () => cursor,
    gravarCursor: async (id) => void (cursor = id),
    iniciar: async () => ({ id: "r1" }),
    concluir: async (_r, d) => void concluidos.push({ status: d.status, mensagem: d.mensagem }),
    ...extra,
  };
  return { amb, gravados, concluidos, cursor: () => cursor };
}

describe("carga inicial", () => {
  it("lê 90 dias em janelas de 7, grava só quem é do projeto e guarda o cursor", async () => {
    const lerPorPeriodo = vi.fn(async () => [bruto(5), bruto(8), bruto(9, 99)]);
    const { amb, gravados, cursor } = montar({ lerPorPeriodo });
    const r = await sincronizarPonto("inicial", amb);
    expect(lerPorPeriodo).toHaveBeenCalledTimes(13); // 90 dias / 7
    expect(lerPorPeriodo.mock.calls[0]).toEqual(["2026-08-13", "2026-08-19"]);
    expect(lerPorPeriodo.mock.calls.at(-1)).toEqual(["2026-11-05", "2026-11-10"]);
    expect(gravados.every((g) => g.qtd === 2 && !g.janela)).toBe(true);
    expect(r).toMatchObject({ status: "ok", lidas: 39, descartadas: 13, novas: 26 });
    expect(cursor()).toBe(9);
  });
});

describe("leitura incremental", () => {
  it("sem carga inicial: erro claro e nada gravado", async () => {
    const { amb, gravados, concluidos } = montar();
    const r = await sincronizarPonto("incremental", amb);
    expect(r.status).toBe("erro");
    expect(r.mensagem).toContain("carga inicial");
    expect(gravados).toHaveLength(0);
    expect(concluidos[0].status).toBe("erro");
  });

  it("lê a partir do cursor + 1, grava e avança o cursor", async () => {
    const lerAPartirDoId = vi.fn<(id: number) => Promise<unknown[]>>(async () => [bruto(101), bruto(102), bruto(103, 99)]);
    const { amb, cursor } = montar({ lerAPartirDoId, lerCursor: async () => 100 });
    let guardado = 0;
    amb.gravarCursor = async (id) => void (guardado = id);
    const r = await sincronizarPonto("incremental", amb);
    expect(lerAPartirDoId).toHaveBeenCalledWith(101);
    expect(r).toMatchObject({ status: "ok", lidas: 3, descartadas: 1, novas: 2 });
    expect(guardado).toBe(103);
    expect(cursor()).toBeNull();
  });

  it("nada novo: não mexe no cursor", async () => {
    const gc = vi.fn();
    const { amb } = montar({ lerAPartirDoId: async () => [], lerCursor: async () => 100, gravarCursor: gc });
    const r = await sincronizarPonto("incremental", amb);
    expect(r).toMatchObject({ status: "ok", lidas: 0 });
    expect(gc).not.toHaveBeenCalled();
  });

  it("pagina quando a página vem cheia (5.000)", async () => {
    const pagina = Array.from({ length: 5000 }, (_, i) => bruto(200 + i));
    let chamadas = 0;
    const lerAPartirDoId = vi.fn<(id: number) => Promise<unknown[]>>(async () => (++chamadas === 1 ? pagina : [bruto(5200)]));
    const { amb } = montar({ lerAPartirDoId, lerCursor: async () => 199 });
    const r = await sincronizarPonto("incremental", amb);
    expect(lerAPartirDoId.mock.calls.map((c) => c[0])).toEqual([200, 5200]);
    expect(r.lidas).toBe(5001);
  });
});

describe("reprocesso dos últimos dias", () => {
  it("relê 3 dias, aplica remoções na janela e NÃO mexe no cursor", async () => {
    const gc = vi.fn();
    const { amb, gravados } = montar({ gravarCursor: gc, lerCursor: async () => 50 });
    const r = await sincronizarPonto("reprocesso", amb);
    expect(gravados[0].janela).toEqual({ de: "2026-11-08", ate: "2026-11-10" });
    expect(r.status).toBe("ok");
    expect(gc).not.toHaveBeenCalled();
  });

  it("resposta vazia do Secullum não marca nada como removido", async () => {
    const { amb, gravados } = montar({ lerPorPeriodo: async () => [] });
    const r = await sincronizarPonto("reprocesso", amb);
    expect(gravados).toHaveLength(0);
    expect(r.mensagem).toContain("nenhuma remoção");
  });
});

describe("trava e falhas", () => {
  it("duas rodadas ao mesmo tempo: a segunda recebe 'ocupado' e não lê nada", async () => {
    const lerPorPeriodo = vi.fn(async () => []);
    const { amb } = montar({ iniciar: async () => null, lerPorPeriodo });
    const r = await sincronizarPonto("inicial", amb);
    expect(r.status).toBe("ocupado");
    expect(lerPorPeriodo).not.toHaveBeenCalled();
  });

  it("Secullum fora do ar: registra erro, não grava cursor e devolve a mensagem", async () => {
    const gc = vi.fn();
    const { amb, concluidos } = montar({ lerAPartirDoId: async () => { throw new Error("O Secullum demorou demais para responder."); }, lerCursor: async () => 10, gravarCursor: gc });
    const r = await sincronizarPonto("incremental", amb);
    expect(r.status).toBe("erro");
    expect(concluidos[0]).toMatchObject({ status: "erro" });
    expect(gc).not.toHaveBeenCalled();
  });

  it("conta sem funcionários do projeto: para antes de gravar", async () => {
    const { amb, gravados } = montar({ funcionariosIncluidos: async () => new Map() });
    const r = await sincronizarPonto("inicial", amb);
    expect(r.status).toBe("erro");
    expect(gravados).toHaveLength(0);
  });
});

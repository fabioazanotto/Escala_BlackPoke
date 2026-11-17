import { beforeEach, describe, expect, it } from "vitest";
import { comCache, esquecerCadastros, limparCachePorPrefixo, reiniciarCache } from "./cacheCurto";

describe("cache curto", () => {
  beforeEach(() => reiniciarCache());
  it("guarda o valor e só chama a função uma vez", async () => {
    let n = 0;
    const f = async () => ++n;
    expect(await comCache("funcionarios", 60000, f)).toBe(1);
    expect(await comCache("funcionarios", 60000, f)).toBe(1);
  });
  it("esquecerCadastros apaga funcionários, horários e o que foi calculado com eles, mas não o resto", async () => {
    let n = 0;
    const f = async () => ++n;
    for (const k of ["funcionarios", "horarios", "mes:7:2026-11:2026-11-17", "contexto"]) await comCache(k, 60000, f);
    esquecerCadastros();
    expect(await comCache("funcionarios", 60000, f)).toBe(5);
    expect(await comCache("horarios", 60000, f)).toBe(6);
    expect(await comCache("mes:7:2026-11:2026-11-17", 60000, f)).toBe(7);
    expect(await comCache("contexto", 60000, f)).toBe(4); // continua guardado
  });
  it("limpa por prefixo", async () => {
    let n = 0;
    await comCache("a:1", 60000, async () => ++n);
    limparCachePorPrefixo("a:");
    expect(await comCache("a:1", 60000, async () => ++n)).toBe(2);
  });
});

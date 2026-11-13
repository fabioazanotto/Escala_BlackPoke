import { describe, expect, it } from "vitest";
import { ehCreator } from "./acesso";

describe("ehCreator", () => {
  it("só vale com o marcador verdadeiro em app_metadata", () => {
    expect(ehCreator({ app_metadata: { creator: true } })).toBe(true);
  });
  it("não vale sem marcador, com valor diferente de true ou sem usuário", () => {
    expect(ehCreator({ app_metadata: {} })).toBe(false);
    expect(ehCreator({ app_metadata: { creator: "true" } })).toBe(false);
    expect(ehCreator({ app_metadata: null })).toBe(false);
    expect(ehCreator({})).toBe(false);
    expect(ehCreator(null)).toBe(false);
    expect(ehCreator(undefined)).toBe(false);
  });
});

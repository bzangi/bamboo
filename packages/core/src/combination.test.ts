import { describe, expect, it } from "vitest";
import { type AlvoCombinacao, combinar } from "./combination.js";
import { type FoodMacros } from "./nutrition.js";

// basis = carb. origem: 100g com 25 carb/100g → baseTotal = 25g de carb.
const origemMacros: FoodMacros = {
  carbPer100g: 25,
  proteinPer100g: 0,
  fatPer100g: 0,
  kcalPer100g: 100,
};

const alvo = (
  groupId: string,
  carbPer100g: number,
  measures: { label: string; grams: number }[] = [],
): AlvoCombinacao => ({
  groupId,
  macros: { carbPer100g, proteinPer100g: 0, fatPer100g: 0, kcalPer100g: 0 },
  measures,
});

const baseDe = (carbPer100g: number, gramas: number): number =>
  (carbPer100g / 100) * gramas;

describe("combinar (1→2)", () => {
  it("split 50/50 preserva o nutriente-base (soma das partes = origem)", () => {
    const r = combinar({
      basis: "carb",
      origem: { groupId: "g", macros: origemMacros, gramas: 100 },
      alvos: [alvo("g", 50), alvo("g", 10)],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("esperava ok");
    const [p0, p1] = r.value.partes;
    expect(p0.gramas).toBeCloseTo(25, 6); // 12.5 carb / 0.5
    expect(p1.gramas).toBeCloseTo(125, 6); // 12.5 carb / 0.1
    expect(p0.fracao).toBeCloseTo(0.5, 6);
    const somaBase = baseDe(50, p0.gramas) + baseDe(10, p1.gramas);
    expect(somaBase).toBeCloseTo(25, 6); // = baseTotal da origem
  });

  it("split 70/30 recalcula preservando a base total", () => {
    const r = combinar({
      basis: "carb",
      origem: { groupId: "g", macros: origemMacros, gramas: 100 },
      alvos: [alvo("g", 50), alvo("g", 10)],
      split: 0.7,
    });
    if (!r.ok) throw new Error("esperava ok");
    const [p0, p1] = r.value.partes;
    expect(p0.gramas).toBeCloseTo(35, 6); // 17.5 / 0.5
    expect(p1.gramas).toBeCloseTo(75, 6); // 7.5 / 0.1
    const somaBase = baseDe(50, p0.gramas) + baseDe(10, p1.gramas);
    expect(somaBase).toBeCloseTo(25, 6);
  });

  it("medida caseira mais próxima quando há; null quando não há", () => {
    const r = combinar({
      basis: "carb",
      origem: { groupId: "g", macros: origemMacros, gramas: 100 },
      alvos: [alvo("g", 50, [{ label: "colher", grams: 12 }]), alvo("g", 10)],
    });
    if (!r.ok) throw new Error("esperava ok");
    expect(r.value.partes[0].medidaCaseira?.label).toBe("colher");
    expect(r.value.partes[1].medidaCaseira).toBeNull();
  });

  it("alvo de outro grupo → err(fora-do-grupo)", () => {
    const r = combinar({
      basis: "carb",
      origem: { groupId: "g", macros: origemMacros, gramas: 100 },
      alvos: [alvo("OUTRO", 50), alvo("g", 10)],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("fora-do-grupo");
  });

  it("alvo com nutriente-base zero → err(alvo-sem-nutriente-base)", () => {
    const r = combinar({
      basis: "carb",
      origem: { groupId: "g", macros: origemMacros, gramas: 100 },
      alvos: [alvo("g", 0), alvo("g", 10)],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("alvo-sem-nutriente-base");
  });

  it("split nas bordas (0) → uma parte zera, sem quebrar", () => {
    const r = combinar({
      basis: "carb",
      origem: { groupId: "g", macros: origemMacros, gramas: 100 },
      alvos: [alvo("g", 50), alvo("g", 10)],
      split: 0,
    });
    if (!r.ok) throw new Error("esperava ok");
    expect(r.value.partes[0].gramas).toBeCloseTo(0, 6);
    expect(r.value.partes[1].gramas).toBeCloseTo(250, 6); // 25 carb / 0.1
  });
});

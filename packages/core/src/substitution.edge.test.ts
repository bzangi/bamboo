// T026 — bordas de substituir() não cobertas por substitution.test.ts:
// empate de arredondamento, clamp n>=1, medida inválida, bases fat/kcal, gramas 0.
import { describe, expect, it } from "vitest";
import {
  type FoodMacros,
  type HouseholdMeasure,
  type SubstitutionInput,
  substituir,
} from "./substitution.js";

function macros(partial: Partial<FoodMacros>): FoodMacros {
  return {
    carbPer100g: 0,
    proteinPer100g: 0,
    fatPer100g: 0,
    kcalPer100g: 0,
    ...partial,
  };
}

// Atalho: origem e alvo no mesmo grupo, base carb, com os valores dados.
function carbInput(
  origemCarb: number,
  gramas: number,
  alvoCarb: number,
  measures: readonly HouseholdMeasure[],
): SubstitutionInput {
  return {
    basis: "carb",
    origem: {
      groupId: "g",
      macros: macros({ carbPer100g: origemCarb }),
      gramas,
    },
    alvo: { groupId: "g", macros: macros({ carbPer100g: alvoCarb }), measures },
  };
}

describe("substituir — bordas e arredondamento (T026)", () => {
  it("empate de distância: mantém a PRIMEIRA medida da lista", () => {
    // gramas alvo = 30. A(20): 2*20=40 (|d|=10). B(40): 1*40=40 (|d|=10). Empate -> A.
    const a: HouseholdMeasure = { label: "medida A", grams: 20 };
    const b: HouseholdMeasure = { label: "medida B", grams: 40 };
    const r = substituir(carbInput(30, 100, 100, [a, b]));

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.gramas).toBeCloseTo(30, 6);
    expect(r.value.medidaCaseira?.label).toBe("medida A");
  });

  it("clamp n>=1: gramas menor que metade da medida ainda retorna a medida (n=1)", () => {
    // gramas alvo = 10; única medida = 80g. round(10/80)=0 -> max(1,0)=1.
    const grande: HouseholdMeasure = { label: "porção grande", grams: 80 };
    const r = substituir(carbInput(10, 100, 100, [grande]));

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.gramas).toBeCloseTo(10, 6);
    expect(r.value.medidaCaseira?.label).toBe("porção grande");
  });

  it("medida inválida (grams <= 0) é ignorada; escolhe a válida", () => {
    const invalida: HouseholdMeasure = { label: "inválida", grams: 0 };
    const colher: HouseholdMeasure = { label: "colher", grams: 25 };
    const r = substituir(carbInput(30, 100, 100, [invalida, colher]));

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.medidaCaseira?.label).toBe("colher");
  });

  it("todas as medidas inválidas (<= 0): medidaCaseira é null", () => {
    const r = substituir(
      carbInput(30, 100, 100, [
        { label: "zero", grams: 0 },
        { label: "negativa", grams: -5 },
      ]),
    );

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.medidaCaseira).toBeNull();
  });

  it("base = kcal: preserva kcal", () => {
    const input: SubstitutionInput = {
      basis: "kcal",
      origem: {
        groupId: "g",
        macros: macros({ kcalPer100g: 200 }),
        gramas: 100,
      },
      alvo: {
        groupId: "g",
        macros: macros({ kcalPer100g: 100 }),
        measures: [],
      },
    };
    const r = substituir(input);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 200 kcal / (100/100) = 200g.
    expect(r.value.gramas).toBeCloseTo(200, 6);
  });

  it("base = fat: preserva gordura", () => {
    const input: SubstitutionInput = {
      basis: "fat",
      origem: { groupId: "g", macros: macros({ fatPer100g: 10 }), gramas: 100 },
      alvo: { groupId: "g", macros: macros({ fatPer100g: 5 }), measures: [] },
    };
    const r = substituir(input);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 10g fat / (5/100) = 200g.
    expect(r.value.gramas).toBeCloseTo(200, 6);
  });

  it("origem com 0g: retorna ok com gramas 0 (sem NaN, sem lançar)", () => {
    const colher: HouseholdMeasure = { label: "colher", grams: 25 };
    const r = substituir(carbInput(28, 0, 20, [colher]));

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.gramas).toBe(0);
    expect(Number.isNaN(r.value.gramas)).toBe(false);
  });
});

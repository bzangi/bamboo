import { describe, expect, it } from "vitest";
import { type FoodMacros, nutrientesDaPorcao } from "./nutrition.js";

const arroz: FoodMacros = {
  carbPer100g: 28,
  proteinPer100g: 2.5,
  fatPer100g: 0.2,
  kcalPer100g: 124,
};

describe("nutrientesDaPorcao", () => {
  it("100g retorna exatamente os valores por 100g", () => {
    const r = nutrientesDaPorcao(arroz, 100);
    expect(r).toEqual({ carb: 28, protein: 2.5, fat: 0.2, kcal: 124 });
  });

  it("regra de três: 150g escala proporcionalmente", () => {
    const r = nutrientesDaPorcao(arroz, 150);
    expect(r.carb).toBeCloseTo(42, 6);
    expect(r.protein).toBeCloseTo(3.75, 6);
    expect(r.fat).toBeCloseTo(0.3, 6);
    expect(r.kcal).toBeCloseTo(186, 6);
  });

  it("0g retorna tudo zero", () => {
    const r = nutrientesDaPorcao(arroz, 0);
    expect(r).toEqual({ carb: 0, protein: 0, fat: 0, kcal: 0 });
  });
});

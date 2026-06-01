import { describe, expect, it } from "vitest";
import {
  type FoodMacros,
  type Nutrientes,
  alvoDoDia,
  avaliarFaixa,
  nutrientesDaPorcao,
  somaNutrientes,
} from "./nutrition.js";

const arroz: FoodMacros = {
  carbPer100g: 28,
  proteinPer100g: 2.5,
  fatPer100g: 0.2,
  kcalPer100g: 124,
};

const frango: FoodMacros = {
  carbPer100g: 0,
  proteinPer100g: 31,
  fatPer100g: 3.6,
  kcalPer100g: 165,
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

describe("somaNutrientes", () => {
  it("soma sobre múltiplos itens", () => {
    const r = somaNutrientes([
      { macros: arroz, gramas: 100 },
      { macros: frango, gramas: 100 },
    ]);
    expect(r.kcal).toBeCloseTo(289, 6);
    expect(r.carb).toBeCloseTo(28, 6);
    expect(r.protein).toBeCloseTo(33.5, 6);
    expect(r.fat).toBeCloseTo(3.8, 6);
  });

  it("lista vazia → zeros", () => {
    expect(somaNutrientes([])).toEqual({
      kcal: 0,
      carb: 0,
      protein: 0,
      fat: 0,
    });
  });
});

describe("alvoDoDia", () => {
  it("soma as opções default de todas as refeições", () => {
    const r = alvoDoDia([
      { itens: [{ macros: arroz, gramas: 100 }] },
      { itens: [{ macros: frango, gramas: 200 }] },
    ]);
    expect(r.kcal).toBeCloseTo(124 + 330, 6);
    expect(r.protein).toBeCloseTo(2.5 + 62, 6);
  });
});

describe("avaliarFaixa", () => {
  const alvo: Nutrientes = { kcal: 2000, carb: 200, protein: 150, fat: 60 };

  it("dentro nos dois sentidos respeitando a tolerância", () => {
    const total: Nutrientes = { kcal: 2100, carb: 190, protein: 150, fat: 60 };
    const r = avaliarFaixa(total, alvo, 10); // ±10%
    expect(r.kcal).toBe("dentro"); // 2100 ≤ 2200
    expect(r.carb).toBe("dentro"); // 190 ≥ 180
  });

  it("exatamente na borda é dentro (≤ margem)", () => {
    const total: Nutrientes = { ...alvo, kcal: 2200 }; // alvo + 10%
    expect(avaliarFaixa(total, alvo, 10).kcal).toBe("dentro");
  });

  it("acima e abaixo da faixa", () => {
    expect(avaliarFaixa({ ...alvo, kcal: 2300 }, alvo, 10).kcal).toBe("acima");
    expect(avaliarFaixa({ ...alvo, carb: 150 }, alvo, 10).carb).toBe("abaixo");
  });

  it("alvo zero com total zero → dentro (sem divisão por zero)", () => {
    const zero: Nutrientes = { kcal: 0, carb: 0, protein: 0, fat: 0 };
    const r = avaliarFaixa(zero, zero, 10);
    expect(r).toEqual({
      kcal: "dentro",
      carb: "dentro",
      protein: "dentro",
      fat: "dentro",
    });
  });
});

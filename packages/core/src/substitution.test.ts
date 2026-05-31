import { describe, expect, it } from "vitest";
import {
  type FoodMacros,
  type HouseholdMeasure,
  type SubstitutionInput,
  substituir,
} from "./substitution.js";

// Helper: monta FoodMacros só com o que importa para cada caso.
function macros(partial: Partial<FoodMacros>): FoodMacros {
  return {
    carbPer100g: 0,
    proteinPer100g: 0,
    fatPer100g: 0,
    kcalPer100g: 0,
    ...partial,
  };
}

describe("substituir", () => {
  it("troca normal: retorna ok com gramas > 0", () => {
    // Arroz (28g carb/100g, 100g) -> batata (20g carb/100g). Base = carb.
    const input: SubstitutionInput = {
      basis: "carb",
      origem: {
        groupId: "carbo",
        macros: macros({ carbPer100g: 28 }),
        gramas: 100,
      },
      alvo: {
        groupId: "carbo",
        macros: macros({ carbPer100g: 20 }),
        measures: [],
      },
    };

    const r = substituir(input);

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.gramas).toBeGreaterThan(0);
    }
  });

  it("preserva o nutriente-base dentro de <= 2% (gramas exato, pré-arredondamento)", () => {
    const origemCarbPer100g = 28;
    const alvoCarbPer100g = 20;
    const gramasOrigem = 100;

    const input: SubstitutionInput = {
      basis: "carb",
      origem: {
        groupId: "carbo",
        macros: macros({ carbPer100g: origemCarbPer100g }),
        gramas: gramasOrigem,
      },
      alvo: {
        groupId: "carbo",
        macros: macros({ carbPer100g: alvoCarbPer100g }),
        measures: [],
      },
    };

    const r = substituir(input);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const nutBaseOrigem = (origemCarbPer100g / 100) * gramasOrigem;
    const nutBaseAlvo = (alvoCarbPer100g / 100) * r.value.gramas;
    const desvioRelativo =
      Math.abs(nutBaseAlvo - nutBaseOrigem) / nutBaseOrigem;

    expect(desvioRelativo).toBeLessThanOrEqual(0.02);
    // Valor exato esperado: 28g carb / (20/100) = 140g.
    expect(r.value.gramas).toBeCloseTo(140, 6);
  });

  it("usa a base de equivalência indicada (protein), não carb", () => {
    const input: SubstitutionInput = {
      basis: "protein",
      origem: {
        groupId: "prot",
        macros: macros({ proteinPer100g: 26, carbPer100g: 0 }),
        gramas: 100,
      },
      alvo: {
        groupId: "prot",
        macros: macros({ proteinPer100g: 13, carbPer100g: 999 }),
        measures: [],
      },
    };

    const r = substituir(input);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 26g prot / (13/100) = 200g.
    expect(r.value.gramas).toBeCloseTo(200, 6);
  });

  it("arredondamento: escolhe a medida caseira mais próxima (múltiplo inteiro)", () => {
    const colher: HouseholdMeasure = { label: "colher de sopa", grams: 25 };
    const concha: HouseholdMeasure = { label: "concha", grams: 80 };

    const input: SubstitutionInput = {
      basis: "carb",
      origem: {
        groupId: "carbo",
        macros: macros({ carbPer100g: 28 }),
        gramas: 100,
      },
      alvo: {
        groupId: "carbo",
        macros: macros({ carbPer100g: 20 }), // -> 140g exato
        measures: [colher, concha],
      },
    };

    const r = substituir(input);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    // gramas = 140. concha: 2*80=160 (|d|=20). colher: 6*25=150 (|d|=10), 5*25=125 (|d|=15).
    // Melhor múltiplo: 6 colheres (150) com erro 10 < 20 da concha. Escolhe colher.
    expect(r.value.medidaCaseira).not.toBeNull();
    expect(r.value.medidaCaseira?.label).toBe("colher de sopa");
  });

  it("medida única: retorna-a mesmo que distante", () => {
    const concha: HouseholdMeasure = { label: "concha", grams: 80 };

    const input: SubstitutionInput = {
      basis: "carb",
      origem: {
        groupId: "carbo",
        macros: macros({ carbPer100g: 28 }),
        gramas: 100,
      },
      alvo: {
        groupId: "carbo",
        macros: macros({ carbPer100g: 20 }),
        measures: [concha],
      },
    };

    const r = substituir(input);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.medidaCaseira?.label).toBe("concha");
  });

  it("sem medidas caseiras: medidaCaseira é null", () => {
    const input: SubstitutionInput = {
      basis: "carb",
      origem: {
        groupId: "carbo",
        macros: macros({ carbPer100g: 28 }),
        gramas: 100,
      },
      alvo: {
        groupId: "carbo",
        macros: macros({ carbPer100g: 20 }),
        measures: [],
      },
    };

    const r = substituir(input);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.medidaCaseira).toBeNull();
  });

  it("alvo com nutriente-base zero: err nutriente-base-zero (não lança)", () => {
    const input: SubstitutionInput = {
      basis: "carb",
      origem: {
        groupId: "carbo",
        macros: macros({ carbPer100g: 28 }),
        gramas: 100,
      },
      alvo: {
        groupId: "carbo",
        macros: macros({ carbPer100g: 0 }),
        measures: [],
      },
    };

    const r = substituir(input);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe("nutriente-base-zero");
  });

  it("alvo com nutriente-base negativo: err nutriente-base-zero", () => {
    const input: SubstitutionInput = {
      basis: "carb",
      origem: {
        groupId: "carbo",
        macros: macros({ carbPer100g: 28 }),
        gramas: 100,
      },
      alvo: {
        groupId: "carbo",
        macros: macros({ carbPer100g: -5 }),
        measures: [],
      },
    };

    const r = substituir(input);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe("nutriente-base-zero");
  });

  it("alvo de outro groupId: err fora-do-grupo (não lança)", () => {
    const input: SubstitutionInput = {
      basis: "carb",
      origem: {
        groupId: "carbo",
        macros: macros({ carbPer100g: 28 }),
        gramas: 100,
      },
      alvo: {
        groupId: "proteina",
        macros: macros({ carbPer100g: 20 }),
        measures: [],
      },
    };

    const r = substituir(input);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe("fora-do-grupo");
  });

  it("guarda de grupo tem prioridade sobre base zero", () => {
    const input: SubstitutionInput = {
      basis: "carb",
      origem: {
        groupId: "carbo",
        macros: macros({ carbPer100g: 28 }),
        gramas: 100,
      },
      alvo: {
        groupId: "proteina",
        macros: macros({ carbPer100g: 0 }),
        measures: [],
      },
    };

    const r = substituir(input);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe("fora-do-grupo");
  });
});

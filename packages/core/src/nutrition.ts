// Cálculo nutricional por porção — função pura (regra de três sobre os valores
// por 100g). Apoia o gate de exposição (mostrar kcal/macros da porção).

export interface FoodMacros {
  readonly carbPer100g: number;
  readonly proteinPer100g: number;
  readonly fatPer100g: number;
  readonly kcalPer100g: number;
}

export interface NutrientesPorcao {
  readonly kcal: number;
  readonly carb: number;
  readonly protein: number;
  readonly fat: number;
}

/**
 * Dado os macros por 100g e a quantidade em gramas, devolve os nutrientes
 * daquela porção (regra de três). Pura, sem I/O, sem throw.
 */
export function nutrientesDaPorcao(
  macros: FoodMacros,
  gramas: number,
): NutrientesPorcao {
  const fator = gramas / 100;
  return {
    kcal: macros.kcalPer100g * fator,
    carb: macros.carbPer100g * fator,
    protein: macros.proteinPer100g * fator,
    fat: macros.fatPer100g * fator,
  };
}

/* ============================================================
 * Agregação nutricional do dia (Fase 2 — alimenta o motor de
 * rebalanceamento). Tudo puro. Ver contracts/core-parametros.md.
 * ============================================================ */

// Vetor de nutrientes AGREGADO (do dia, de um conjunto de itens). Mesma forma
// de NutrientesPorcao, mas semanticamente é a soma de várias porções.
export interface Nutrientes {
  readonly kcal: number;
  readonly carb: number;
  readonly protein: number;
  readonly fat: number;
}

export interface ItemNutricional {
  readonly macros: FoodMacros;
  readonly gramas: number;
}

const ZERO: Nutrientes = { kcal: 0, carb: 0, protein: 0, fat: 0 };

/** Σ nutrientesDaPorcao sobre os itens. Pura. Lista vazia → zeros. */
export function somaNutrientes(
  itens: ReadonlyArray<ItemNutricional>,
): Nutrientes {
  return itens.reduce<Nutrientes>((acc, { macros, gramas }) => {
    const n = nutrientesDaPorcao(macros, gramas);
    return {
      kcal: acc.kcal + n.kcal,
      carb: acc.carb + n.carb,
      protein: acc.protein + n.protein,
      fat: acc.fat + n.fat,
    };
  }, ZERO);
}

/**
 * Alvo do dia = soma das opções DEFAULT de todas as refeições do tipo-de-dia
 * (FR-001). O "dia planejado" é o alvo.
 */
export function alvoDoDia(
  refeicoesDefault: ReadonlyArray<{
    readonly itens: ReadonlyArray<ItemNutricional>;
  }>,
): Nutrientes {
  return somaNutrientes(refeicoesDefault.flatMap((r) => r.itens));
}

export type StatusNutriente = "dentro" | "acima" | "abaixo";

/**
 * Avalia, por nutriente, se `total` está dentro de `alvo ± toleranciaPct%`
 * (FR-002/FR-003 — faixa, não teto; desvio pra baixo conta igual ao pra cima).
 * Borda (`≤ margem`) é "dentro". Alvo 0 → margem 0 (total 0 → "dentro").
 */
export function avaliarFaixa(
  total: Nutrientes,
  alvo: Nutrientes,
  toleranciaPct: number,
): Record<keyof Nutrientes, StatusNutriente> {
  const status = (t: number, a: number): StatusNutriente => {
    const margem = Math.abs(a) * (toleranciaPct / 100);
    if (t > a + margem) return "acima";
    if (t < a - margem) return "abaixo";
    return "dentro";
  };
  return {
    kcal: status(total.kcal, alvo.kcal),
    carb: status(total.carb, alvo.carb),
    protein: status(total.protein, alvo.protein),
    fat: status(total.fat, alvo.fat),
  };
}

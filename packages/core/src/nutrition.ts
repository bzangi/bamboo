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

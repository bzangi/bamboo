// substituir() — a função-coração da tese. Troca um item por um alimento-alvo
// do mesmo grupo, preservando o nutriente-base do grupo, e devolve a medida
// caseira mais próxima. TS puro: sem I/O, sem throw, sem mutação. Decisões D1,
// D2, D6 e D8 da research.

import { type FoodMacros } from "./nutrition.js";
import { type Result, err, ok } from "./result.js";

// Re-exporta FoodMacros: o contrato (core-substituir.md) declara-o como parte
// da superfície de substitution.ts. A definição canônica vive em nutrition.ts.
export type { FoodMacros };

export type EquivalenceBasis = "carb" | "protein" | "fat" | "kcal";

export interface HouseholdMeasure {
  readonly label: string;
  readonly grams: number;
}

export interface SubstitutionInput {
  readonly basis: EquivalenceBasis; // nutriente-base do grupo
  readonly origem: {
    readonly groupId: string;
    readonly macros: FoodMacros;
    readonly gramas: number; // quantidade atual do item
  };
  readonly alvo: {
    readonly groupId: string;
    readonly macros: FoodMacros;
    readonly measures: readonly HouseholdMeasure[]; // pode ser vazio
  };
}

export interface SubstitutionResult {
  readonly gramas: number; // quantidade equivalente (exata, pré-arredondamento)
  readonly medidaCaseira: HouseholdMeasure | null; // mais próxima, ou null
}

export type SubstitutionError =
  | { readonly kind: "fora-do-grupo" }
  | { readonly kind: "nutriente-base-zero" };

/** Valor do nutriente-base (por 100g) de um alimento, conforme a base do grupo.
 * Exportado para reuso pela combinação (Fase 2). */
export function basisPer100g(
  macros: FoodMacros,
  basis: EquivalenceBasis,
): number {
  switch (basis) {
    case "carb":
      return macros.carbPer100g;
    case "protein":
      return macros.proteinPer100g;
    case "fat":
      return macros.fatPer100g;
    case "kcal":
      return macros.kcalPer100g;
  }
}

/**
 * Escolhe a medida cujo múltiplo inteiro (n >= 1) minimiza |gramas - n*grams|.
 * Empate -> mantém a primeira encontrada. measures vazio -> null.
 */
export function medidaMaisProxima(
  gramas: number,
  measures: readonly HouseholdMeasure[],
): HouseholdMeasure | null {
  let melhor: HouseholdMeasure | null = null;
  let menorDistancia = Number.POSITIVE_INFINITY;

  for (const measure of measures) {
    if (measure.grams <= 0) continue; // medida inválida não compete
    const n = Math.max(1, Math.round(gramas / measure.grams));
    const distancia = Math.abs(gramas - n * measure.grams);
    if (distancia < menorDistancia) {
      menorDistancia = distancia;
      melhor = measure;
    }
  }

  return melhor;
}

/**
 * Troca um item por um alimento-alvo do mesmo grupo, preservando o
 * nutriente-base. Retorna Result; nunca lança.
 *
 * Semântica (contract core-substituir.md):
 *  1. alvo.groupId !== origem.groupId -> err(fora-do-grupo).
 *  2. basisPer100g(alvo) <= 0 -> err(nutriente-base-zero).
 *  3. nutBase = (basisPer100g(origem)/100) * origem.gramas.
 *  4. gramas = nutBase / (basisPer100g(alvo)/100).
 *  5. medidaCaseira = medida do alvo que minimiza a distância (ou null).
 */
export function substituir(
  input: SubstitutionInput,
): Result<SubstitutionResult, SubstitutionError> {
  const { basis, origem, alvo } = input;

  if (alvo.groupId !== origem.groupId) {
    return err({ kind: "fora-do-grupo" });
  }

  const baseAlvo = basisPer100g(alvo.macros, basis);
  if (baseAlvo <= 0) {
    return err({ kind: "nutriente-base-zero" });
  }

  const baseOrigem = basisPer100g(origem.macros, basis);
  const nutBase = (baseOrigem / 100) * origem.gramas;
  const gramas = nutBase / (baseAlvo / 100);

  const medidaCaseira = medidaMaisProxima(gramas, alvo.measures);

  return ok({ gramas, medidaCaseira });
}

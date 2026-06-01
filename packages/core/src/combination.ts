// combination.ts — combinação 1→2 (Fase 2 / US2). Prima de substituir():
// troca um item por DOIS alvos do mesmo grupo, dividindo o nutriente-base por
// um split (default 50/50, ajustável) e preservando-o. Reusa basisPer100g e
// medidaMaisProxima. TS puro, sem I/O, sem throw, retorna Result. Decisão D7.

import { type FoodMacros } from "./nutrition.js";
import {
  type EquivalenceBasis,
  type HouseholdMeasure,
  basisPer100g,
  medidaMaisProxima,
} from "./substitution.js";
import { type Result, err, ok } from "./result.js";

export interface AlvoCombinacao {
  readonly groupId: string;
  readonly macros: FoodMacros;
  readonly measures: readonly HouseholdMeasure[];
}

export interface CombinacaoInput {
  readonly basis: EquivalenceBasis; // nutriente-base do grupo
  readonly origem: {
    readonly groupId: string;
    readonly macros: FoodMacros;
    readonly gramas: number;
  };
  readonly alvos: readonly [AlvoCombinacao, AlvoCombinacao]; // exatamente 2 (FR-013)
  readonly split?: number; // fração [0..1] do nutriente-base pro 1º alvo; default 0.5
}

export interface ParteCombinacao {
  readonly gramas: number; // exato, pré-arredondamento
  readonly medidaCaseira: HouseholdMeasure | null;
  readonly fracao: number; // fração do nutriente-base aplicada
}

export interface CombinacaoResult {
  readonly partes: readonly [ParteCombinacao, ParteCombinacao];
}

export type CombinacaoError =
  | { readonly kind: "fora-do-grupo" } // algum alvo de outro grupo (FR-014)
  | { readonly kind: "alvo-sem-nutriente-base" }; // basisPer100g ≤ 0 (FR-017)

const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v));

/**
 * Divide o nutriente-base do item em dois alvos do MESMO grupo, preservando-o.
 * split (default 0.5) é a fração pro 1º alvo. Nunca lança.
 */
export function combinar(
  input: CombinacaoInput,
): Result<CombinacaoResult, CombinacaoError> {
  const { basis, origem, alvos } = input;
  const split = clamp(input.split ?? 0.5, 0, 1);
  const [a0, a1] = alvos;

  if (a0.groupId !== origem.groupId || a1.groupId !== origem.groupId) {
    return err({ kind: "fora-do-grupo" });
  }

  const base0 = basisPer100g(a0.macros, basis);
  const base1 = basisPer100g(a1.macros, basis);
  if (base0 <= 0 || base1 <= 0) {
    return err({ kind: "alvo-sem-nutriente-base" });
  }

  // Nutriente-base total a preservar (do item original).
  const baseTotal = (basisPer100g(origem.macros, basis) / 100) * origem.gramas;
  const frac0 = split;
  const frac1 = 1 - split;
  const gramas0 = (baseTotal * frac0) / (base0 / 100);
  const gramas1 = (baseTotal * frac1) / (base1 / 100);

  return ok({
    partes: [
      {
        gramas: gramas0,
        medidaCaseira: medidaMaisProxima(gramas0, a0.measures),
        fracao: frac0,
      },
      {
        gramas: gramas1,
        medidaCaseira: medidaMaisProxima(gramas1, a1.measures),
        fracao: frac1,
      },
    ],
  });
}

// Mapeamento PURO: CombinacaoResult (núcleo) -> CombineResponse (DTO).
// Reusa nutritionFor (gate de exposição) do today.mapper. Princípio III.
import type { CombinacaoResult } from '@bamboo/core';
import type {
  CombinePartDto,
  CombineResponse,
  ExposureLevel,
} from '@bamboo/types';
import { nutritionFor, type FoodRow } from '../plan/today.mapper';

const round1 = (v: number): number => Math.round(v * 10) / 10;

export function toCombineResponse(input: {
  readonly itemId: string;
  readonly exposure: ExposureLevel;
  readonly result: CombinacaoResult;
  readonly alvos: readonly [FoodRow, FoodRow]; // mesma ordem das partes
}): CombineResponse {
  const partes: CombinePartDto[] = input.result.partes.map((p, i) => {
    const food = input.alvos[i];
    const nutrition = nutritionFor(food, p.gramas, input.exposure);
    return {
      food: { id: food.id, name: food.name },
      gramas: round1(p.gramas),
      medidaCaseira: p.medidaCaseira
        ? { label: p.medidaCaseira.label, grams: p.medidaCaseira.grams }
        : null,
      fracao: p.fracao,
      ...(nutrition ? { nutrition } : {}),
    };
  });
  return { itemId: input.itemId, exposure: input.exposure, partes };
}

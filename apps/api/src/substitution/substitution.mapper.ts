// Mapeamento PURO -> SubstitutionsResponse (Princípio III). Sem I/O, sem throw.
import type {
  EquivalenceBasis,
  ExposureLevel,
  SubstitutionAlternativeDto,
  SubstitutionsResponse,
} from '@bamboo/types';
import { nutritionFor } from '../plan/today.mapper';

export interface CurrentRow {
  readonly foodId: string;
  readonly name: string;
  readonly quantityGrams: number;
  readonly adLibitum: boolean;
}

export interface GroupRow {
  readonly id: string;
  readonly name: string;
  readonly basis: EquivalenceBasis;
}

export interface SubstitutionsInput {
  readonly itemId: string;
  readonly group: GroupRow;
  readonly current: CurrentRow;
  readonly alternatives: readonly SubstitutionAlternativeDto[];
}

const round1 = (v: number): number => Math.round(v * 10) / 10;

/**
 * Arredonda gramas (1 casa) e monta a alternativa, com a nutrição (010) da
 * MESMA porção exibida (gramas já arredondadas — coerência visual) filtrada
 * pelo gate de exposição do paciente dono do item. Função pura.
 */
export function toAlternativeDto(input: {
  readonly foodId: string;
  readonly name: string;
  readonly gramas: number;
  readonly medidaCaseira: {
    readonly label: string;
    readonly grams: number;
  } | null;
  readonly macros: {
    readonly kcalPer100g: number;
    readonly carbPer100g: number;
    readonly proteinPer100g: number;
    readonly fatPer100g: number;
  };
  readonly exposure: ExposureLevel;
  /** 018: origem à vontade ⇒ alternativa à vontade, sem gramas e sem nutrição
   *  (nutrição de 0 g diria "0 kcal", que é resposta errada para salada). */
  readonly adLibitum?: boolean;
}): SubstitutionAlternativeDto {
  const adLibitum = input.adLibitum === true;
  const gramas = adLibitum ? 0 : round1(input.gramas);
  const nutrition = adLibitum
    ? undefined
    : nutritionFor(
        { id: input.foodId, name: input.name, ...input.macros },
        gramas,
        input.exposure,
      );
  return {
    foodId: input.foodId,
    name: input.name,
    gramas,
    adLibitum,
    medidaCaseira: adLibitum
      ? null
      : input.medidaCaseira
        ? { label: input.medidaCaseira.label, grams: input.medidaCaseira.grams }
        : null,
    ...(nutrition ? { nutrition } : {}),
  };
}

/** Monta a SubstitutionsResponse. Função pura. */
export function toSubstitutionsResponse(
  input: SubstitutionsInput,
): SubstitutionsResponse {
  return {
    itemId: input.itemId,
    group: input.group,
    current: input.current,
    alternatives: input.alternatives,
  };
}

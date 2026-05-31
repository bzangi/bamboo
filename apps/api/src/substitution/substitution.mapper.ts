// Mapeamento PURO -> SubstitutionsResponse (Princípio III). Sem I/O, sem throw.
import type {
  EquivalenceBasis,
  SubstitutionAlternativeDto,
  SubstitutionsResponse,
} from '@bamboo/types';

export interface CurrentRow {
  readonly foodId: string;
  readonly name: string;
  readonly quantityGrams: number;
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

/** Arredonda gramas (1 casa) e monta a alternativa. Função pura. */
export function toAlternativeDto(input: {
  readonly foodId: string;
  readonly name: string;
  readonly gramas: number;
  readonly medidaCaseira: {
    readonly label: string;
    readonly grams: number;
  } | null;
}): SubstitutionAlternativeDto {
  return {
    foodId: input.foodId,
    name: input.name,
    gramas: round1(input.gramas),
    medidaCaseira: input.medidaCaseira
      ? { label: input.medidaCaseira.label, grams: input.medidaCaseira.grams }
      : null,
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

// DTOs do contrato GET /meal-items/:id/substitutions (US2 — "substituir num toque").
// Tipos puros compartilhados entre a casca (apps/api) e os clientes.
import type { NutritionDto } from "./nutrition.js";

export type EquivalenceBasis = "carb" | "protein" | "fat" | "kcal";

export interface HouseholdMeasureDto {
  readonly label: string;
  readonly grams: number;
}

export interface SubstitutionGroupDto {
  readonly id: string;
  readonly name: string;
  readonly basis: EquivalenceBasis;
}

export interface CurrentItemDto {
  readonly foodId: string;
  readonly name: string;
  readonly quantityGrams: number;
}

export interface SubstitutionAlternativeDto {
  readonly foodId: string;
  readonly name: string;
  // Quantidade equivalente (preserva o nutriente-base do grupo).
  readonly gramas: number;
  // Medida caseira mais próxima, ou null se o alvo não tiver medida.
  readonly medidaCaseira: HouseholdMeasureDto | null;
  // Nutrição da porção equivalente, filtrada pelo gate de exposição do
  // paciente dono do item (010). Ausente quando exposure = 'hidden'.
  readonly nutrition?: NutritionDto;
}

export interface SubstitutionsResponse {
  readonly itemId: string;
  readonly group: SubstitutionGroupDto;
  readonly current: CurrentItemDto;
  // Lista vazia é resposta válida (200): grupo sem outros alimentos elegíveis.
  readonly alternatives: readonly SubstitutionAlternativeDto[];
}

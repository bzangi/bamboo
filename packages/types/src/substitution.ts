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
  /** 018 — o item de origem é "à vontade": `quantityGrams` é 0 e não é
   *  quantidade prescrita. */
  readonly adLibitum: boolean;
}

export interface SubstitutionAlternativeDto {
  readonly foodId: string;
  readonly name: string;
  // Quantidade equivalente (preserva o nutriente-base do grupo).
  // Quando `adLibitum` é true, vale 0 e NÃO é quantidade: trocar "à vontade" por
  // "à vontade" é 1:1, não tem conta de equivalência (018/FR-005).
  readonly gramas: number;
  readonly adLibitum: boolean;
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

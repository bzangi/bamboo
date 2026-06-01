// DTOs do contrato POST /meal-items/:id/combine (US2 — combinação 1→2).
import type { ExposureLevel, NutritionDto } from "./today.js";
import type { HouseholdMeasureDto } from "./substitution.js";

export interface CombineRequest {
  readonly alvoFoodIds: readonly string[]; // exatamente 2
  readonly split?: number; // [0..1], fração do nutriente-base pro 1º alvo; default 0.5
}

export interface CombinePartDto {
  readonly food: { readonly id: string; readonly name: string };
  readonly gramas: number;
  readonly medidaCaseira: HouseholdMeasureDto | null;
  readonly fracao: number;
  // Nutrição da porção filtrada pela exposição (ausente em hidden).
  readonly nutrition?: NutritionDto;
}

export interface CombineResponse {
  readonly itemId: string;
  readonly exposure: ExposureLevel;
  readonly partes: readonly CombinePartDto[];
}

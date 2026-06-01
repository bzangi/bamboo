// DTOs do contrato POST /patients/:id/rebalance/option-choice (US1 — gatilho P1).
// Tipos puros compartilhados entre a casca e os clientes. Espelha o
// RebalanceOutcome do núcleo (@bamboo/core), filtrado pelo gate de exposição.

import type { ExposureLevel } from "./today.js";
import type { HouseholdMeasureDto } from "./substitution.js";

export interface OptionChoiceRequest {
  readonly triggerMealId: string;
  readonly chosenOptionId: string;
}

export interface ItemAjustadoDto {
  readonly itemId: string;
  readonly food: { readonly id: string; readonly name: string };
  readonly gramasNovo: number;
  readonly medidaCaseira: HouseholdMeasureDto | null;
}

export interface RefeicaoAfetadaDto {
  readonly mealId: string;
  readonly name: string;
  readonly position: number;
  readonly itensAjustados: readonly ItemAjustadoDto[];
}

// Total do dia DEPOIS do rebalanceamento, filtrado pela exposição (ação, não
// número de culpa): ausente em hidden/percent; macros em macros; tudo em full_kcal.
export interface TotalDepoisDto {
  readonly kcal?: number;
  readonly carb?: number;
  readonly protein?: number;
  readonly fat?: number;
}

// Desfecho do motor — união discriminada. recusa-orientada é desfecho VÁLIDO
// (HTTP 200, "nunca barra"), não erro.
export type RebalanceOutcomeDto =
  | { readonly kind: "sem-acao" }
  | {
      readonly kind: "rebalanceado";
      readonly refeicoesAfetadas: readonly RefeicaoAfetadaDto[];
      readonly totalDepois?: TotalDepoisDto;
    }
  | {
      readonly kind: "recusa-orientada";
      readonly motivo: "estoura-piso" | "sem-alavanca";
      readonly mensagem: string;
    };

export interface OptionChoiceResponse {
  readonly patientId: string;
  readonly exposure: ExposureLevel;
  readonly outcome: RebalanceOutcomeDto;
}

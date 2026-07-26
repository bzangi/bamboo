// DTOs do contrato POST /patients/:id/rebalance/option-choice (US1 — gatilho P1).
// Tipos puros compartilhados entre a casca e os clientes. Espelha o
// RebalanceOutcome do núcleo (@bamboo/core), filtrado pelo gate de exposição.

import type { ExposureLevel } from "./today.js";
import type { HouseholdMeasureDto } from "./substitution.js";

export interface OptionChoiceRequest {
  readonly triggerMealId: string;
  readonly chosenOptionId: string;
  /**
   * Override de tipo-de-dia da SESSÃO (opcional), espelhando
   * `RegistroRequest.dayTypeId`. Presente ⇒ o dia que o motor considera é o desse
   * tipo: roster, alavancas e faixa-alvo saem dele. Ausente ⇒ `day_schedule` do
   * weekday — o comportamento de sempre.
   *
   * Existe porque sem ele a prévia era INALCANÇÁVEL sob override: o roster vinha
   * do weekday, e o gatilho — que o app manda do cardápio exibido — caía num 404
   * (KI-005). Opcional de propósito: cliente antigo não quebra.
   */
  readonly dayTypeId?: string;
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

// DTOs do contrato GET /patients/:id/today (US1 — "ver o agora").
// Tipos puros compartilhados entre a casca (apps/api) e os clientes
// (api-client / mobile). Nenhuma dependência de Drizzle/Nest aqui.

import type { HouseholdMeasureDto } from "./substitution.js";

export type ExposureLevel = "hidden" | "percent" | "macros" | "full_kcal";

// Fase 3 (registro pendurado na consulta): estado vigente de uma refeição no
// dia. "troquei" é derivado no servidor; "feito"/"pulei" vêm da intent.
export type RegistrationStatus = "feito" | "troquei" | "pulei";

// Nutrição da porção filtrada pelo gate de exposição (montada na borda):
//  - hidden    -> o item NÃO traz nutrition (campo ausente).
//  - percent   -> só proporções dos macros (carbPct/proteinPct/fatPct), sem gramas/kcal.
//  - macros    -> gramas dos macros + proporções; sem kcal cheio.
//  - full_kcal -> tudo (kcal + macros + proporções).
// Campos opcionais para um único tipo cobrir os níveis sem união explodir no cliente.
export interface NutritionDto {
  readonly kcal?: number;
  readonly carb?: number;
  readonly protein?: number;
  readonly fat?: number;
  readonly carbPct?: number;
  readonly proteinPct?: number;
  readonly fatPct?: number;
}

export interface FoodRefDto {
  readonly id: string;
  readonly name: string;
}

export interface MealItemDto {
  readonly id: string;
  readonly food: FoodRefDto;
  readonly quantityGrams: number;
  readonly isLocked: boolean;
  readonly substitutionGroupId: string | null;
  // = !isLocked && substitutionGroupId != null
  readonly substitutable: boolean;
  // Ausente quando exposure = 'hidden'.
  readonly nutrition?: NutritionDto;
  // Fase 2: medida caseira preferida para exibir o planejado em UNIDADE/FATIA
  // (ovo, fruta); null → exibir em gramas (granel: arroz, aveia). Heurística v0
  // por rótulo de unidade; o flag "discreto vs granel" no alimento fica futuro.
  readonly medidaCaseira?: HouseholdMeasureDto | null;
}

export interface MealOptionDto {
  readonly id: string;
  readonly label: string;
  readonly isDefault: boolean;
  readonly items: readonly MealItemDto[];
}

export interface MealDto {
  readonly id: string;
  readonly name: string;
  readonly position: number;
  // Horário informativo "HH:MM"; ausente/null quando não definido.
  readonly horario?: string | null;
  // Fase 2: TODAS as opções da refeição (a default marcada). Habilita o
  // gatilho P1 (ver/escolher outra opção). defaultOption/otherOptionsCount
  // mantidos por retrocompatibilidade com a Fase 1.
  readonly options: readonly MealOptionDto[];
  readonly defaultOption: MealOptionDto;
  // Sinaliza outras opções (= options.length - 1).
  readonly otherOptionsCount: number;
  // Fase 3: estado vigente do registro desta refeição hoje; null = não-registrada.
  readonly registro: { readonly state: RegistrationStatus } | null;
  // Fase 3: é a refeição "o agora" (1ª não-registrada na ordem do plano).
  readonly isCurrent: boolean;
  // Fase 4 (009): refeição teve grama recalculada pela reconciliação com o
  // consumo (troca de tipo-de-dia). Aditivo/não-quebrável; default false (sem
  // override / sem gap / recusa do motor / refeição registrada single-count).
  // Booleano por design — não vaza kcal/macro/percentual ("ação, não número").
  readonly rebalanceado: boolean;
}

export interface DayTypeDto {
  readonly id: string;
  readonly label: string;
}

export interface TodayResponse {
  readonly patientId: string;
  readonly exposure: ExposureLevel;
  readonly dayType: DayTypeDto;
  // Fase 2: tipos-de-dia do plano (habilita a troca de cardápio no app — US3).
  readonly availableDayTypes: readonly DayTypeDto[];
  // Fase 3: 1ª refeição NÃO-REGISTRADA na ordem do plano; null se dia concluído.
  // (v0 era a 1ª por position, estática; sem eventos no dia, segue sendo a 1ª.)
  readonly currentMealId: string | null;
  // Fase 3: true quando todas as refeições do dia estão registradas.
  readonly diaConcluido: boolean;
  readonly meals: readonly MealDto[];
}

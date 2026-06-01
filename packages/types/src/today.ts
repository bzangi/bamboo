// DTOs do contrato GET /patients/:id/today (US1 — "ver o agora").
// Tipos puros compartilhados entre a casca (apps/api) e os clientes
// (api-client / mobile). Nenhuma dependência de Drizzle/Nest aqui.

export type ExposureLevel = "hidden" | "percent" | "macros" | "full_kcal";

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
  // v0: a 1ª refeição por position.
  readonly currentMealId: string;
  readonly meals: readonly MealDto[];
}

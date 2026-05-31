// Mapeamento PURO entidade-do-banco -> TodayResponse (Princípio III: nunca
// serializar entidade do Drizzle crua). Sem I/O, sem throw, sem mutação.
// Aplica o gate de exposição (FR-005) na borda.
import { nutrientesDaPorcao, type FoodMacros } from '@bamboo/core';
import type {
  ExposureLevel,
  MealDto,
  MealItemDto,
  NutritionDto,
  TodayResponse,
} from '@bamboo/types';

// Shapes lidos do banco (apenas os campos que o mapper consome).
export interface FoodRow {
  readonly id: string;
  readonly name: string;
  readonly kcalPer100g: number;
  readonly carbPer100g: number;
  readonly proteinPer100g: number;
  readonly fatPer100g: number;
}

export interface ItemRow {
  readonly id: string;
  readonly quantityGrams: number;
  readonly isLocked: boolean;
  readonly substitutionGroupId: string | null;
  readonly food: FoodRow;
}

export interface OptionRow {
  readonly id: string;
  readonly label: string;
  readonly isDefault: boolean;
  readonly items: readonly ItemRow[];
}

export interface MealRow {
  readonly id: string;
  readonly name: string;
  readonly position: number;
  readonly horario: string | null;
  readonly defaultOption: OptionRow;
  readonly otherOptionsCount: number;
}

export interface TodayInput {
  readonly patientId: string;
  readonly exposure: ExposureLevel;
  readonly dayType: { readonly id: string; readonly label: string };
  readonly currentMealId: string;
  readonly meals: readonly MealRow[];
}

/** Macros/100g de um food no formato do core. */
function toMacros(food: FoodRow): FoodMacros {
  return {
    carbPer100g: food.carbPer100g,
    proteinPer100g: food.proteinPer100g,
    fatPer100g: food.fatPer100g,
    kcalPer100g: food.kcalPer100g,
  };
}

/**
 * Nutrição da porção filtrada pelo nível de exposição.
 *  - hidden    -> undefined (item sem nutrition).
 *  - percent   -> só proporções dos macros.
 *  - macros    -> gramas dos macros + proporções; sem kcal.
 *  - full_kcal -> tudo.
 */
export function nutritionFor(
  food: FoodRow,
  gramas: number,
  exposure: ExposureLevel,
): NutritionDto | undefined {
  if (exposure === 'hidden') return undefined;

  const n = nutrientesDaPorcao(toMacros(food), gramas);
  const round1 = (v: number): number => Math.round(v * 10) / 10;

  // Proporções dos macros pela massa de macronutrientes (carb+protein+fat).
  const totalMacros = n.carb + n.protein + n.fat;
  const pct = (v: number): number =>
    totalMacros > 0 ? Math.round((v / totalMacros) * 100) : 0;

  const proportions: NutritionDto = {
    carbPct: pct(n.carb),
    proteinPct: pct(n.protein),
    fatPct: pct(n.fat),
  };

  if (exposure === 'percent') return proportions;

  const macros: NutritionDto = {
    ...proportions,
    carb: round1(n.carb),
    protein: round1(n.protein),
    fat: round1(n.fat),
  };

  if (exposure === 'macros') return macros;

  // full_kcal
  return { ...macros, kcal: Math.round(n.kcal) };
}

function toItemDto(item: ItemRow, exposure: ExposureLevel): MealItemDto {
  const substitutable = !item.isLocked && item.substitutionGroupId != null;
  const nutrition = nutritionFor(item.food, item.quantityGrams, exposure);
  return {
    id: item.id,
    food: { id: item.food.id, name: item.food.name },
    quantityGrams: item.quantityGrams,
    isLocked: item.isLocked,
    substitutionGroupId: item.substitutionGroupId,
    substitutable,
    ...(nutrition ? { nutrition } : {}),
  };
}

// Postgres `time` chega como "HH:MM:SS"; o contrato exibe "HH:MM".
function normalizeHorario(horario: string | null): string | null {
  if (horario == null) return null;
  const m = /^(\d{2}:\d{2})/.exec(horario);
  return m ? m[1] : horario;
}

function toMealDto(meal: MealRow, exposure: ExposureLevel): MealDto {
  return {
    id: meal.id,
    name: meal.name,
    position: meal.position,
    horario: normalizeHorario(meal.horario),
    defaultOption: {
      id: meal.defaultOption.id,
      label: meal.defaultOption.label,
      isDefault: meal.defaultOption.isDefault,
      items: meal.defaultOption.items.map((it) => toItemDto(it, exposure)),
    },
    otherOptionsCount: meal.otherOptionsCount,
  };
}

/** Monta a TodayResponse a partir do agregado lido do banco. Função pura. */
export function toTodayResponse(input: TodayInput): TodayResponse {
  return {
    patientId: input.patientId,
    exposure: input.exposure,
    dayType: input.dayType,
    currentMealId: input.currentMealId,
    meals: input.meals.map((m) => toMealDto(m, input.exposure)),
  };
}

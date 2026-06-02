// Mapeamento PURO entidade-do-banco -> TodayResponse (Princípio III: nunca
// serializar entidade do Drizzle crua). Sem I/O, sem throw, sem mutação.
// Aplica o gate de exposição (FR-005) na borda.
import {
  derivarOAgora,
  medidaMaisProxima,
  nutrientesDaPorcao,
  type EstadoRegistro,
  type FoodMacros,
} from '@bamboo/core';
import type {
  ExposureLevel,
  HouseholdMeasureDto,
  MealDto,
  MealItemDto,
  MealOptionDto,
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
  // Medidas caseiras do alimento (label + gramas); pode ser vazio.
  readonly measures: readonly {
    readonly label: string;
    readonly grams: number;
  }[];
}

// Heurística v0: medida "discreta" (unidade/fatia) — pra exibir ovo/fruta em
// unidades. Granel (arroz/aveia: "colher"/"escumadeira") não casa → null → gramas.
const UNIDADE_RE = /unidade|fatia/i;

function medidaPlanejada(
  gramas: number,
  measures: readonly { readonly label: string; readonly grams: number }[],
): HouseholdMeasureDto | null {
  const unidades = measures.filter((m) => UNIDADE_RE.test(m.label));
  const m = medidaMaisProxima(gramas, unidades);
  return m ? { label: m.label, grams: m.grams } : null;
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
  // Fase 2: TODAS as opções da refeição (a default entre elas).
  readonly options: readonly OptionRow[];
  // Fase 3: estado vigente do registro desta refeição hoje (last-wins/tombstone,
  // resolvido na casca via estadoVigente). null = não-registrada / sem eventos.
  readonly estadoVigente: EstadoRegistro | null;
}

export interface TodayInput {
  readonly patientId: string;
  readonly exposure: ExposureLevel;
  readonly dayType: { readonly id: string; readonly label: string };
  readonly availableDayTypes: readonly {
    readonly id: string;
    readonly label: string;
  }[];
  // Fase 3: "o agora" é DERIVADO aqui (1ª refeição não-registrada na ordem do
  // plano) via derivarOAgora — não vem mais pronto da casca.
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
    medidaCaseira: medidaPlanejada(item.quantityGrams, item.measures),
    ...(nutrition ? { nutrition } : {}),
  };
}

// Postgres `time` chega como "HH:MM:SS"; o contrato exibe "HH:MM".
function normalizeHorario(horario: string | null): string | null {
  if (horario == null) return null;
  const m = /^(\d{2}:\d{2})/.exec(horario);
  return m ? m[1] : horario;
}

function toOptionDto(opt: OptionRow, exposure: ExposureLevel): MealOptionDto {
  return {
    id: opt.id,
    label: opt.label,
    isDefault: opt.isDefault,
    items: opt.items.map((it) => toItemDto(it, exposure)),
  };
}

function toMealDto(
  meal: MealRow,
  exposure: ExposureLevel,
  currentMealId: string | null,
): MealDto {
  const options = meal.options.map((o) => toOptionDto(o, exposure));
  const defaultOption = options.find((o) => o.isDefault) ?? options[0];
  return {
    id: meal.id,
    name: meal.name,
    position: meal.position,
    horario: normalizeHorario(meal.horario),
    options,
    defaultOption,
    otherOptionsCount: options.length - 1,
    registro: meal.estadoVigente ? { state: meal.estadoVigente } : null,
    isCurrent: meal.id === currentMealId,
  };
}

/** Monta a TodayResponse a partir do agregado lido do banco. Função pura. */
export function toTodayResponse(input: TodayInput): TodayResponse {
  // "O agora" derivado: 1ª refeição não-registrada na ordem do plano. Todas
  // registradas → dia-concluido (currentMealId null). Sem eventos no dia, todos
  // os estados são null → o agora = 1ª refeição (retrocompat com a Fase 1/2).
  const oAgora = derivarOAgora({
    refeicoes: input.meals.map((m) => ({ mealId: m.id, ordem: m.position })),
    vigentes: input.meals.map((m) => ({
      mealId: m.id,
      estado: m.estadoVigente,
    })),
  });
  const currentMealId = oAgora.kind === 'refeicao' ? oAgora.mealId : null;
  const diaConcluido = oAgora.kind === 'dia-concluido';

  return {
    patientId: input.patientId,
    exposure: input.exposure,
    dayType: input.dayType,
    availableDayTypes: input.availableDayTypes.map((d) => ({
      id: d.id,
      label: d.label,
    })),
    currentMealId,
    diaConcluido,
    meals: input.meals.map((m) => toMealDto(m, input.exposure, currentMealId)),
  };
}

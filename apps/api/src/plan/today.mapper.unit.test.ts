// Unit puro (sem DB) do mapper — 009: derivação de `rebalanceado` (T009/US2) e
// do `registro` pareado por posição sob override (T004/US1). Roda no Vitest
// (include `src/**/*.unit.test.ts`), pois @bamboo/* é ESM e o jest do api não
// está configurado pra transpilá-lo.
import { describe, expect, it } from 'vitest';
import type { EstadoRegistro } from '@bamboo/core';
import {
  toTodayResponse,
  type ItemRow,
  type MealRow,
  type OptionRow,
  type TodayInput,
} from './today.mapper';

const food = (id: string) => ({
  id: `food-${id}`,
  name: `food-${id}`,
  kcalPer100g: 100,
  carbPer100g: 10,
  proteinPer100g: 5,
  fatPer100g: 2,
});

const item = (id: string): ItemRow => ({
  id,
  quantityGrams: 100,
  isLocked: false,
  substitutionGroupId: 'g1',
  food: food(id),
  measures: [],
});

const option = (
  id: string,
  isDefault: boolean,
  items: readonly ItemRow[],
): OptionRow => ({ id, label: id, isDefault, items });

const meal = (
  id: string,
  position: number,
  options: readonly OptionRow[],
  estadoVigente: EstadoRegistro | null = null,
): MealRow => ({
  id,
  name: id,
  position,
  horario: null,
  options,
  estadoVigente,
});

const input = (meals: readonly MealRow[]): TodayInput => ({
  patientId: 'p',
  exposure: 'hidden',
  dayType: { id: 'd', label: 'D' },
  availableDayTypes: [],
  meals,
});

const byPos = (res: ReturnType<typeof toTodayResponse>, pos: number) =>
  res.meals.find((m) => m.position === pos)!;

describe('toTodayResponse — rebalanceado (009/US2)', () => {
  const meals = [
    meal('A', 1, [option('A-def', true, [item('a1'), item('a2')])]),
    meal('B', 2, [option('B-def', true, [item('b1')])]),
    meal('C', 3, [
      option('C-def', true, [item('c1')]),
      option('C-alt', false, [item('c2')]),
    ]),
  ];

  it('true só nas refeições com item da opção DEFAULT no mapa de ajuste', () => {
    const ajuste = new Map<string, number>([
      ['a1', 80],
      ['c2', 50], // item de opção NÃO-default → não conta
    ]);
    const res = toTodayResponse(input(meals), ajuste);
    expect(byPos(res, 1).rebalanceado).toBe(true); // a1 default → ajustado
    expect(byPos(res, 2).rebalanceado).toBe(false); // nenhum item no mapa
    expect(byPos(res, 3).rebalanceado).toBe(false); // c2 é da opção alt
  });

  it('false em tudo sem mapa de ajuste (sem override / sem gap)', () => {
    const res = toTodayResponse(input(meals));
    for (const m of res.meals) expect(m.rebalanceado).toBe(false);
  });
});

describe('toTodayResponse — registro pareado por posição (009/US1)', () => {
  const meals = [
    meal('A', 1, [option('A-def', true, [item('a1')])], 'pulei'),
    meal('B', 2, [option('B-def', true, [item('b1')])], null),
  ];

  it('com registroPorPosition (override): registro vem por posição e sobrepõe o vigente', () => {
    const registroPorPosition = new Map<number, EstadoRegistro>([
      [1, 'feito'],
      [3, 'troquei'], // posição sem refeição exibida → ignorada
    ]);
    const res = toTodayResponse(input(meals), undefined, registroPorPosition);
    expect(byPos(res, 1).registro).toEqual({ state: 'feito' }); // sobrepõe 'pulei'
    expect(byPos(res, 2).registro).toBeNull(); // pos 2 não está no mapa
  });

  it('sem registroPorPosition (sem override): registro = estado vigente por mealId', () => {
    const res = toTodayResponse(input(meals));
    expect(byPos(res, 1).registro).toEqual({ state: 'pulei' });
    expect(byPos(res, 2).registro).toBeNull();
  });
});

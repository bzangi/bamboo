import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { match } from 'ts-pattern';
import { combinar, type FoodMacros, type HouseholdMeasure } from '@bamboo/core';
import { eq, schema } from '@bamboo/db';
import type { CombineRequest, CombineResponse } from '@bamboo/types';
import { DB, type Db } from '../db/db.module';
import type { FoodRow } from '../plan/today.mapper';
import { toCombineResponse } from './combination.mapper';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface GroupFood {
  readonly foodId: string;
  readonly name: string;
  readonly carb: number;
  readonly protein: number;
  readonly fat: number;
  readonly kcal: number;
}

const macrosOf = (f: GroupFood): FoodMacros => ({
  carbPer100g: f.carb,
  proteinPer100g: f.protein,
  fatPer100g: f.fat,
  kcalPer100g: f.kcal,
});

const foodRowOf = (f: GroupFood): FoodRow => ({
  id: f.foodId,
  name: f.name,
  kcalPer100g: f.kcal,
  carbPer100g: f.carb,
  proteinPer100g: f.protein,
  fatPer100g: f.fat,
});

// Casca imperativa (US2): I/O, orquestra combinar() e converte erro de domínio
// -> HttpException na borda. Não persiste (FR-026).
@Injectable()
export class CombinationService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async combine(
    mealItemId: string,
    body: CombineRequest,
  ): Promise<CombineResponse> {
    // 1. Validação estrutural do corpo.
    const ids = body?.alvoFoodIds ?? [];
    if (
      !Array.isArray(ids) ||
      ids.length !== 2 ||
      !ids.every((id) => typeof id === 'string' && UUID_RE.test(id)) ||
      ids[0] === ids[1]
    ) {
      throw new BadRequestException(
        'alvoFoodIds deve conter exatamente 2 UUIDs distintos',
      );
    }
    const split = body.split;
    if (
      split !== undefined &&
      (typeof split !== 'number' || split < 0 || split > 1)
    ) {
      throw new BadRequestException('split deve estar entre 0 e 1');
    }

    // 2. Item + macros do food atual + grupo + exposição (cadeia até patient).
    const [item] = await this.db
      .select({
        quantityGrams: schema.mealItem.quantityGrams,
        isLocked: schema.mealItem.isLocked,
        groupId: schema.mealItem.substitutionGroupId,
        carb: schema.food.carbPer100g,
        protein: schema.food.proteinPer100g,
        fat: schema.food.fatPer100g,
        kcal: schema.food.kcalPer100g,
        exposure: schema.patient.exposure,
      })
      .from(schema.mealItem)
      .innerJoin(schema.food, eq(schema.mealItem.foodId, schema.food.id))
      .innerJoin(
        schema.mealOption,
        eq(schema.mealItem.mealOptionId, schema.mealOption.id),
      )
      .innerJoin(schema.meal, eq(schema.mealOption.mealId, schema.meal.id))
      .innerJoin(schema.dayType, eq(schema.meal.dayTypeId, schema.dayType.id))
      .innerJoin(schema.plan, eq(schema.dayType.planId, schema.plan.id))
      .innerJoin(schema.patient, eq(schema.plan.patientId, schema.patient.id))
      .where(eq(schema.mealItem.id, mealItemId))
      .limit(1);
    if (!item) throw new NotFoundException('item não encontrado');

    // 3. Guarda: item flexível (não travado e com grupo).
    if (item.isLocked || item.groupId == null) {
      throw new UnprocessableEntityException(
        'item não combinável (travado ou sem grupo)',
      );
    }
    const groupId = item.groupId;

    // 4. Grupo (basis).
    const [group] = await this.db
      .select({ basis: schema.substitutionGroup.basis })
      .from(schema.substitutionGroup)
      .where(eq(schema.substitutionGroup.id, groupId))
      .limit(1);
    if (!group) throw new NotFoundException('grupo não encontrado');

    // 5. Foods do grupo (com macros) + medidas caseiras.
    const groupFoods = await this.db
      .select({
        foodId: schema.food.id,
        name: schema.food.name,
        carb: schema.food.carbPer100g,
        protein: schema.food.proteinPer100g,
        fat: schema.food.fatPer100g,
        kcal: schema.food.kcalPer100g,
      })
      .from(schema.foodSubstitutionGroup)
      .innerJoin(
        schema.food,
        eq(schema.foodSubstitutionGroup.foodId, schema.food.id),
      )
      .where(eq(schema.foodSubstitutionGroup.groupId, groupId));
    const byId = new Map<string, GroupFood>(
      groupFoods.map((f) => [f.foodId, f]),
    );

    const a0 = byId.get(ids[0]);
    const a1 = byId.get(ids[1]);
    if (!a0 || !a1) {
      throw new UnprocessableEntityException(
        'alvo de combinação fora do grupo do item',
      );
    }

    const measureRows = await this.db
      .select({
        foodId: schema.foodHouseholdMeasure.foodId,
        label: schema.foodHouseholdMeasure.label,
        grams: schema.foodHouseholdMeasure.grams,
      })
      .from(schema.foodHouseholdMeasure);
    const measuresByFood = new Map<string, HouseholdMeasure[]>();
    for (const r of measureRows) {
      const list = measuresByFood.get(r.foodId) ?? [];
      list.push({ label: r.label, grams: r.grams });
      measuresByFood.set(r.foodId, list);
    }

    // 6. Núcleo puro.
    const result = combinar({
      basis: group.basis,
      origem: {
        groupId,
        macros: {
          carbPer100g: item.carb,
          proteinPer100g: item.protein,
          fatPer100g: item.fat,
          kcalPer100g: item.kcal,
        },
        gramas: item.quantityGrams,
      },
      alvos: [
        {
          groupId,
          macros: macrosOf(a0),
          measures: measuresByFood.get(a0.foodId) ?? [],
        },
        {
          groupId,
          macros: macrosOf(a1),
          measures: measuresByFood.get(a1.foodId) ?? [],
        },
      ],
      split,
    });

    if (!result.ok) {
      throw match(result.error)
        .with(
          { kind: 'fora-do-grupo' },
          () => new UnprocessableEntityException('alvo fora do grupo'),
        )
        .with(
          { kind: 'alvo-sem-nutriente-base' },
          () =>
            new UnprocessableEntityException(
              'alvo sem o nutriente-base do grupo',
            ),
        )
        .exhaustive();
    }

    // 7. DTO (gate de exposição no mapper).
    return toCombineResponse({
      itemId: mealItemId,
      exposure: item.exposure,
      result: result.value,
      alvos: [foodRowOf(a0), foodRowOf(a1)],
    });
  }
}

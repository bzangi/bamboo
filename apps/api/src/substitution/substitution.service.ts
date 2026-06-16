import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { match } from 'ts-pattern';
import { substituir, type HouseholdMeasure } from '@bamboo/core';
import { and, eq, ne, schema } from '@bamboo/db';
import type {
  SubstitutionAlternativeDto,
  SubstitutionsResponse,
} from '@bamboo/types';
import { DB, type Db } from '../db/db.module';
import {
  toAlternativeDto,
  toSubstitutionsResponse,
} from './substitution.mapper';

// Casca imperativa: I/O (Drizzle), orquestra o núcleo puro (substituir), e
// converte erro de domínio -> HttpException na borda via ts-pattern (.exhaustive).
@Injectable()
export class SubstitutionService {
  private readonly logger = new Logger(SubstitutionService.name);

  constructor(@Inject(DB) private readonly db: Db) {}

  async getSubstitutions(mealItemId: string): Promise<SubstitutionsResponse> {
    this.logger.log(`getSubstitutions item=${mealItemId}`);
    // 1. meal_item + food atual.
    const [item] = await this.db
      .select({
        id: schema.mealItem.id,
        quantityGrams: schema.mealItem.quantityGrams,
        isLocked: schema.mealItem.isLocked,
        substitutionGroupId: schema.mealItem.substitutionGroupId,
        foodId: schema.food.id,
        foodName: schema.food.name,
        kcalPer100g: schema.food.kcalPer100g,
        carbPer100g: schema.food.carbPer100g,
        proteinPer100g: schema.food.proteinPer100g,
        fatPer100g: schema.food.fatPer100g,
      })
      .from(schema.mealItem)
      .innerJoin(schema.food, eq(schema.mealItem.foodId, schema.food.id))
      .where(eq(schema.mealItem.id, mealItemId))
      .limit(1);
    if (!item) throw new NotFoundException('item não encontrado');

    // 2. Item travado ou sem grupo -> não substituível (422).
    if (item.isLocked || item.substitutionGroupId == null) {
      throw new UnprocessableEntityException('item não substituível');
    }
    const groupId = item.substitutionGroupId;

    // 3. Grupo de substituição (basis).
    const [group] = await this.db
      .select({
        id: schema.substitutionGroup.id,
        name: schema.substitutionGroup.name,
        basis: schema.substitutionGroup.basis,
      })
      .from(schema.substitutionGroup)
      .where(eq(schema.substitutionGroup.id, groupId))
      .limit(1);
    if (!group)
      throw new NotFoundException('grupo de substituição não encontrado');
    const basis = group.basis;

    // 4. Outros foods do grupo (exclui o food atual), com macros.
    const targets = await this.db
      .select({
        foodId: schema.food.id,
        name: schema.food.name,
        kcalPer100g: schema.food.kcalPer100g,
        carbPer100g: schema.food.carbPer100g,
        proteinPer100g: schema.food.proteinPer100g,
        fatPer100g: schema.food.fatPer100g,
      })
      .from(schema.foodSubstitutionGroup)
      .innerJoin(
        schema.food,
        eq(schema.foodSubstitutionGroup.foodId, schema.food.id),
      )
      .where(
        and(
          eq(schema.foodSubstitutionGroup.groupId, groupId),
          ne(schema.foodSubstitutionGroup.foodId, item.foodId),
        ),
      );

    // 5. Medidas caseiras dos alvos (1 query; agrupa em memória).
    const measuresByFood = new Map<string, HouseholdMeasure[]>();
    if (targets.length > 0) {
      const rows = await this.db
        .select({
          foodId: schema.foodHouseholdMeasure.foodId,
          label: schema.foodHouseholdMeasure.label,
          grams: schema.foodHouseholdMeasure.grams,
        })
        .from(schema.foodHouseholdMeasure);
      for (const r of rows) {
        const list = measuresByFood.get(r.foodId) ?? [];
        list.push({ label: r.label, grams: r.grams });
        measuresByFood.set(r.foodId, list);
      }
    }

    // 6. Para cada alvo, chama o núcleo puro; exclui nutriente-base-zero.
    const origemMacros = {
      carbPer100g: item.carbPer100g,
      proteinPer100g: item.proteinPer100g,
      fatPer100g: item.fatPer100g,
      kcalPer100g: item.kcalPer100g,
    };

    const alternatives: SubstitutionAlternativeDto[] = [];
    for (const t of targets) {
      const r = substituir({
        basis,
        origem: {
          groupId,
          macros: origemMacros,
          gramas: item.quantityGrams,
        },
        alvo: {
          groupId,
          macros: {
            carbPer100g: t.carbPer100g,
            proteinPer100g: t.proteinPer100g,
            fatPer100g: t.fatPer100g,
            kcalPer100g: t.kcalPer100g,
          },
          measures: measuresByFood.get(t.foodId) ?? [],
        },
      });

      if (!r.ok) {
        // nutriente-base-zero -> exclui o alvo (não barra). fora-do-grupo não
        // deveria ocorrer (todos do mesmo grupo) -> 422 na borda.
        match(r.error)
          .with({ kind: 'nutriente-base-zero' }, () => {
            /* exclui silenciosamente */
          })
          .with({ kind: 'fora-do-grupo' }, () => {
            throw new UnprocessableEntityException('alimento fora do grupo');
          })
          .exhaustive();
        continue;
      }

      alternatives.push(
        toAlternativeDto({
          foodId: t.foodId,
          name: t.name,
          gramas: r.value.gramas,
          medidaCaseira: r.value.medidaCaseira,
        }),
      );
    }

    this.logger.debug(
      `${alternatives.length} alternativa(s) no grupo "${group.name}"`,
    );

    // 7. Lista vazia é 200 (FR-014). Monta DTO puro.
    return toSubstitutionsResponse({
      itemId: item.id,
      group: { id: group.id, name: group.name, basis },
      current: {
        foodId: item.foodId,
        name: item.foodName,
        quantityGrams: item.quantityGrams,
      },
      alternatives,
    });
  }
}

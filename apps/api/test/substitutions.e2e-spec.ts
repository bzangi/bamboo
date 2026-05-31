import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, isNotNull, db, pool, schema } from '@bamboo/db';
import { SubstitutionModule } from '../src/substitution/substitution.module';

// e2e US2 — GET /meal-items/:id/substitutions. Importa SÓ o SubstitutionModule.
// IDs por query (o seed gera UUIDs novos a cada run).
describe('GET /meal-items/:id/substitutions (US2)', () => {
  let app: INestApplication;
  let flexItemId: string;
  let flexGroupId: string;
  let flexFoodId: string;
  let lockedItemId: string;

  beforeAll(async () => {
    // Item flexível: não travado, com grupo.
    const [flex] = await db
      .select({
        id: schema.mealItem.id,
        foodId: schema.mealItem.foodId,
        groupId: schema.mealItem.substitutionGroupId,
      })
      .from(schema.mealItem)
      .where(
        and(
          eq(schema.mealItem.isLocked, false),
          isNotNull(schema.mealItem.substitutionGroupId),
        ),
      )
      .limit(1);
    flexItemId = flex.id;
    flexFoodId = flex.foodId;
    flexGroupId = flex.groupId!;

    // Item travado.
    const [locked] = await db
      .select({ id: schema.mealItem.id })
      .from(schema.mealItem)
      .where(eq(schema.mealItem.isLocked, true))
      .limit(1);
    lockedItemId = locked.id;

    const moduleRef = await Test.createTestingModule({
      imports: [SubstitutionModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await pool.end();
  });

  it('retorna alternativas do MESMO grupo com gramas + medidaCaseira', async () => {
    const res = await request(app.getHttpServer())
      .get(`/meal-items/${flexItemId}/substitutions`)
      .expect(200);

    const body = res.body;
    expect(body.itemId).toBe(flexItemId);
    expect(body.group.id).toBe(flexGroupId);
    expect(['carb', 'protein', 'fat', 'kcal']).toContain(body.group.basis);
    expect(body.current.foodId).toBe(flexFoodId);
    expect(Array.isArray(body.alternatives)).toBe(true);
    expect(body.alternatives.length).toBeGreaterThan(0);

    // todas do mesmo grupo (DB-side): conferimos via food_substitution_group.
    const groupFoodRows = await db
      .select({ foodId: schema.foodSubstitutionGroup.foodId })
      .from(schema.foodSubstitutionGroup)
      .where(eq(schema.foodSubstitutionGroup.groupId, flexGroupId));
    const groupFoodIds = new Set(groupFoodRows.map((r) => r.foodId));

    for (const alt of body.alternatives as Array<{
      foodId: string;
      gramas: number;
      medidaCaseira: { label: string; grams: number } | null;
    }>) {
      expect(groupFoodIds.has(alt.foodId)).toBe(true);
      expect(alt.foodId).not.toBe(flexFoodId); // exclui o atual
      expect(typeof alt.gramas).toBe('number');
      expect(alt.gramas).toBeGreaterThan(0);
      // medidaCaseira é objeto {label,grams} ou null.
      if (alt.medidaCaseira !== null) {
        expect(typeof alt.medidaCaseira.label).toBe('string');
        expect(typeof alt.medidaCaseira.grams).toBe('number');
      }
    }
  });

  it('preserva o nutriente-base do grupo dentro de ≤ 2% (SC-003)', async () => {
    // Carrega macros do food atual + quantidade do item.
    const [cur] = await db
      .select({
        quantityGrams: schema.mealItem.quantityGrams,
        carb: schema.food.carbPer100g,
        protein: schema.food.proteinPer100g,
        fat: schema.food.fatPer100g,
        kcal: schema.food.kcalPer100g,
      })
      .from(schema.mealItem)
      .innerJoin(schema.food, eq(schema.mealItem.foodId, schema.food.id))
      .where(eq(schema.mealItem.id, flexItemId))
      .limit(1);
    const [grp] = await db
      .select({ basis: schema.substitutionGroup.basis })
      .from(schema.substitutionGroup)
      .where(eq(schema.substitutionGroup.id, flexGroupId))
      .limit(1);

    const per100 = (f: {
      carb: number;
      protein: number;
      fat: number;
      kcal: number;
    }): number =>
      grp.basis === 'carb'
        ? f.carb
        : grp.basis === 'protein'
          ? f.protein
          : grp.basis === 'fat'
            ? f.fat
            : f.kcal;
    const nutBaseOrigem = (per100(cur) / 100) * cur.quantityGrams;

    const res = await request(app.getHttpServer())
      .get(`/meal-items/${flexItemId}/substitutions`)
      .expect(200);

    for (const alt of res.body.alternatives as Array<{
      foodId: string;
      gramas: number;
    }>) {
      const [af] = await db
        .select({
          carb: schema.food.carbPer100g,
          protein: schema.food.proteinPer100g,
          fat: schema.food.fatPer100g,
          kcal: schema.food.kcalPer100g,
        })
        .from(schema.food)
        .where(eq(schema.food.id, alt.foodId))
        .limit(1);
      const nutBaseAlvo = (per100(af) / 100) * alt.gramas;
      // gramas no DTO é arredondado a 1 casa; afere a preservação com folga.
      const erro = Math.abs(nutBaseAlvo - nutBaseOrigem) / nutBaseOrigem;
      expect(erro).toBeLessThanOrEqual(0.02);
    }
  });

  it('item travado -> 422 (não substituível)', async () => {
    await request(app.getHttpServer())
      .get(`/meal-items/${lockedItemId}/substitutions`)
      .expect(422);
  });

  it('404 para item inexistente (uuid válido)', async () => {
    await request(app.getHttpServer())
      .get('/meal-items/00000000-0000-0000-0000-000000000000/substitutions')
      .expect(404);
  });

  it('400 para id não-uuid (ParseUUIDPipe na borda)', async () => {
    await request(app.getHttpServer())
      .get('/meal-items/not-a-uuid/substitutions')
      .expect(400);
  });
});

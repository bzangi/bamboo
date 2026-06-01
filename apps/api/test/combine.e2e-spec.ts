import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, isNotNull, ne, db, pool, schema } from '@bamboo/db';
import { CombinationModule } from '../src/combination/combination.module';

// e2e US2 — POST /meal-items/:id/combine (combinação 1→2).
describe('POST /meal-items/:id/combine (US2)', () => {
  let app: INestApplication;
  let exposure: string;
  let flexItemId: string;
  let alvoA: string;
  let alvoB: string;
  let foreignFoodId: string;
  let lockedItemId: string;

  beforeAll(async () => {
    const [pat] = await db
      .select({ exposure: schema.patient.exposure })
      .from(schema.patient)
      .limit(1);
    exposure = pat.exposure;

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
    const flexGroupId = flex.groupId!;

    // 2 outros foods do MESMO grupo (alvos válidos).
    const others = await db
      .select({ foodId: schema.foodSubstitutionGroup.foodId })
      .from(schema.foodSubstitutionGroup)
      .where(
        and(
          eq(schema.foodSubstitutionGroup.groupId, flexGroupId),
          ne(schema.foodSubstitutionGroup.foodId, flex.foodId),
        ),
      )
      .limit(2);
    alvoA = others[0].foodId;
    alvoB = others[1].foodId;

    // Um food de OUTRO grupo (alvo fora do grupo).
    const [foreign] = await db
      .select({ foodId: schema.foodSubstitutionGroup.foodId })
      .from(schema.foodSubstitutionGroup)
      .where(ne(schema.foodSubstitutionGroup.groupId, flexGroupId))
      .limit(1);
    foreignFoodId = foreign.foodId;

    const [locked] = await db
      .select({ id: schema.mealItem.id })
      .from(schema.mealItem)
      .where(eq(schema.mealItem.isLocked, true))
      .limit(1);
    lockedItemId = locked.id;

    const moduleRef = await Test.createTestingModule({
      imports: [CombinationModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await pool.end();
  });

  it('50/50 → duas partes com gramas + medida caseira + fração 0.5', async () => {
    const res = await request(app.getHttpServer())
      .post(`/meal-items/${flexItemId}/combine`)
      .send({ alvoFoodIds: [alvoA, alvoB] })
      .expect(200);

    expect(res.body.itemId).toBe(flexItemId);
    expect(res.body.partes).toHaveLength(2);
    for (const p of res.body.partes as Array<{
      food: { id: string; name: string };
      gramas: number;
      fracao: number;
      nutrition?: Record<string, number>;
    }>) {
      expect(typeof p.food.name).toBe('string');
      expect(p.gramas).toBeGreaterThan(0);
      expect(p.fracao).toBeCloseTo(0.5, 6);
      if (exposure === 'macros')
        expect(typeof p.nutrition!.carb).toBe('number');
    }
  });

  it('split 0.7 → frações 0.7 / 0.3', async () => {
    const res = await request(app.getHttpServer())
      .post(`/meal-items/${flexItemId}/combine`)
      .send({ alvoFoodIds: [alvoA, alvoB], split: 0.7 })
      .expect(200);
    expect(res.body.partes[0].fracao).toBeCloseTo(0.7, 6);
    expect(res.body.partes[1].fracao).toBeCloseTo(0.3, 6);
  });

  it('alvo fora do grupo → 422', async () => {
    await request(app.getHttpServer())
      .post(`/meal-items/${flexItemId}/combine`)
      .send({ alvoFoodIds: [foreignFoodId, alvoB] })
      .expect(422);
  });

  it('item travado → 422 (não combinável)', async () => {
    await request(app.getHttpServer())
      .post(`/meal-items/${lockedItemId}/combine`)
      .send({ alvoFoodIds: [alvoA, alvoB] })
      .expect(422);
  });

  it('404 item inexistente', async () => {
    await request(app.getHttpServer())
      .post(`/meal-items/00000000-0000-0000-0000-000000000000/combine`)
      .send({ alvoFoodIds: [alvoA, alvoB] })
      .expect(404);
  });

  it('400 corpo inválido (1 alvo só)', async () => {
    await request(app.getHttpServer())
      .post(`/meal-items/${flexItemId}/combine`)
      .send({ alvoFoodIds: [alvoA] })
      .expect(400);
  });
});

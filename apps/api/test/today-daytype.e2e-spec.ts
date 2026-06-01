import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, asc, eq, db, pool, schema } from '@bamboo/db';
import { PlanModule } from '../src/plan/plan.module';

// e2e US3 — GET /today?dayTypeId: troca de tipo-de-dia (só exibição, FR-021).
describe('GET /patients/:id/today?dayTypeId (US3 — troca de tipo-de-dia)', () => {
  let app: INestApplication;
  let patientId: string;
  let targetDayTypeId: string;
  let targetDayTypeName: string;

  beforeAll(async () => {
    const [pat] = await db
      .select({ id: schema.patient.id })
      .from(schema.patient)
      .limit(1);
    patientId = pat.id;

    const [pln] = await db
      .select({ id: schema.plan.id })
      .from(schema.plan)
      .where(
        and(
          eq(schema.plan.patientId, patientId),
          eq(schema.plan.isActive, true),
        ),
      )
      .limit(1);

    // Pega um tipo-de-dia do plano (qualquer um serve pra exibir).
    const [dt] = await db
      .select({ id: schema.dayType.id, name: schema.dayType.name })
      .from(schema.dayType)
      .where(eq(schema.dayType.planId, pln.id))
      .orderBy(asc(schema.dayType.name))
      .limit(1);
    targetDayTypeId = dt.id;
    targetDayTypeName = dt.name;

    const moduleRef = await Test.createTestingModule({
      imports: [PlanModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await pool.end();
  });

  it('exibe o tipo-de-dia pedido e re-ancora "o agora" na 1ª refeição', async () => {
    const res = await request(app.getHttpServer())
      .get(`/patients/${patientId}/today`)
      .query({ dayTypeId: targetDayTypeId })
      .expect(200);

    expect(res.body.dayType.id).toBe(targetDayTypeId);
    expect(res.body.dayType.label).toBe(targetDayTypeName);
    expect(res.body.meals.length).toBeGreaterThan(0);
    // "o agora" = 1ª refeição por position (re-ancorada no novo cardápio).
    expect(res.body.currentMealId).toBe(res.body.meals[0].id);
    const positions = res.body.meals.map(
      (m: { position: number }) => m.position,
    );
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('dayTypeId fora do plano → 404', async () => {
    await request(app.getHttpServer())
      .get(`/patients/${patientId}/today`)
      .query({ dayTypeId: '00000000-0000-0000-0000-000000000000' })
      .expect(404);
  });

  it('dayTypeId não-uuid → 400', async () => {
    await request(app.getHttpServer())
      .get(`/patients/${patientId}/today`)
      .query({ dayTypeId: 'not-a-uuid' })
      .expect(400);
  });
});

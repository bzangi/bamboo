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

  it('exibe o tipo-de-dia pedido e re-ancora "o agora" na 1ª NÃO-registrada do cardápio', async () => {
    const res = await request(app.getHttpServer())
      .get(`/patients/${patientId}/today`)
      .query({ dayTypeId: targetDayTypeId })
      .expect(200);

    expect(res.body.dayType.id).toBe(targetDayTypeId);
    expect(res.body.dayType.label).toBe(targetDayTypeName);
    expect(res.body.meals.length).toBeGreaterThan(0);
    const positions = res.body.meals.map(
      (m: { position: number }) => m.position,
    );
    expect(positions).toEqual([...positions].sort((a, b) => a - b));

    // Fase 3: "o agora" = 1ª refeição NÃO-registrada do cardápio exibido (não
    // mais a 1ª estática). Robusto a eventos deixados por outras suítes na
    // mesma sessão de banco.
    expect(typeof res.body.diaConcluido).toBe('boolean');
    const meals = res.body.meals as Array<{
      id: string;
      registro: { state: string } | null;
      isCurrent: boolean;
    }>;
    const firstUnregistered = meals.find((m) => m.registro === null);
    if (firstUnregistered) {
      expect(res.body.diaConcluido).toBe(false);
      expect(res.body.currentMealId).toBe(firstUnregistered.id);
      expect(firstUnregistered.isCurrent).toBe(true);
    } else {
      expect(res.body.diaConcluido).toBe(true);
      expect(res.body.currentMealId).toBeNull();
    }
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

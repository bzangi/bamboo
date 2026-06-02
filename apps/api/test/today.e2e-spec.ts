import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, db, pool, schema } from '@bamboo/db';
import { PlanModule } from '../src/plan/plan.module';

// e2e US1 — GET /patients/:id/today. Importa SÓ o PlanModule. IDs por query
// (nunca hardcode: o seed gera UUIDs novos a cada run).
describe('GET /patients/:id/today (US1)', () => {
  let app: INestApplication;
  let patientId: string;
  let exposure: string;
  let weekdayDayTypeId: string;

  beforeAll(async () => {
    // Paciente semeado.
    const [pat] = await db
      .select({ id: schema.patient.id, exposure: schema.patient.exposure })
      .from(schema.patient)
      .limit(1);
    patientId = pat.id;
    exposure = pat.exposure;

    // day_type esperado para hoje (mesma resolução do service: weekday do servidor).
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
    const weekday = new Date().getDay();
    const [sched] = await db
      .select({ dayTypeId: schema.daySchedule.dayTypeId })
      .from(schema.daySchedule)
      .where(
        and(
          eq(schema.daySchedule.planId, pln.id),
          eq(schema.daySchedule.weekday, weekday),
        ),
      )
      .limit(1);
    weekdayDayTypeId = sched.dayTypeId;

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

  it('retorna dayType com label, refeições ordenadas e "o agora" = 1ª não-registrada (Fase 3)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/patients/${patientId}/today`)
      .expect(200);

    const body = res.body;
    expect(body.patientId).toBe(patientId);
    expect(body.dayType.id).toBe(weekdayDayTypeId);
    expect(typeof body.dayType.label).toBe('string');
    expect(body.dayType.label.length).toBeGreaterThan(0);

    // refeições ordenadas por position (crescente).
    expect(Array.isArray(body.meals)).toBe(true);
    expect(body.meals.length).toBeGreaterThan(0);
    const positions = body.meals.map((m: { position: number }) => m.position);
    const sorted = [...positions].sort((a, b) => a - b);
    expect(positions).toEqual(sorted);

    // Fase 3: campos de registro por refeição + diaConcluido no topo.
    // "o agora" = 1ª refeição NÃO-registrada na ordem do plano (não mais a 1ª
    // estática). Robusto a estado deixado por outras suítes na mesma sessão de
    // banco (registro.e2e roda antes; pode haver eventos do dia).
    expect(typeof body.diaConcluido).toBe('boolean');
    const meals = body.meals as Array<{
      id: string;
      registro: { state: string } | null;
      isCurrent: boolean;
      defaultOption: { id: string; isDefault: boolean; items: unknown[] };
      otherOptionsCount: number;
    }>;
    for (const m of meals) {
      // registro: estado vigente ou null (não-registrada).
      if (m.registro !== null) {
        expect(['feito', 'troquei', 'pulei']).toContain(m.registro.state);
      }
      expect(typeof m.isCurrent).toBe('boolean');
    }

    const firstUnregistered = meals.find((m) => m.registro === null);
    if (firstUnregistered) {
      expect(body.diaConcluido).toBe(false);
      // currentMealId = a 1ª não-registrada; e exatamente ela tem isCurrent.
      expect(body.currentMealId).toBe(firstUnregistered.id);
      const currents = meals.filter((m) => m.isCurrent);
      expect(currents.length).toBe(1);
      expect(currents[0].id).toBe(firstUnregistered.id);
    } else {
      // todas registradas → dia concluído, "o agora" nulo, ninguém isCurrent.
      expect(body.diaConcluido).toBe(true);
      expect(body.currentMealId).toBeNull();
      expect(meals.every((m) => !m.isCurrent)).toBe(true);
    }

    // cada refeição expõe a defaultOption + otherOptionsCount.
    for (const m of meals) {
      expect(m.defaultOption).toBeDefined();
      expect(m.defaultOption.isDefault).toBe(true);
      expect(Array.isArray(m.defaultOption.items)).toBe(true);
      expect(typeof m.otherOptionsCount).toBe('number');
      expect(m.otherOptionsCount).toBeGreaterThanOrEqual(0);
    }
  });

  it('aplica o gate de exposição (seed = macros: tem macros, sem kcal)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/patients/${patientId}/today`)
      .expect(200);

    expect(res.body.exposure).toBe(exposure);
    const items = res.body.meals.flatMap(
      (m: { defaultOption: { items: unknown[] } }) => m.defaultOption.items,
    );
    expect(items.length).toBeGreaterThan(0);

    for (const it of items as Array<{ nutrition?: Record<string, number> }>) {
      if (exposure === 'hidden') {
        expect(it.nutrition).toBeUndefined();
      } else {
        expect(it.nutrition).toBeDefined();
        if (exposure === 'percent') {
          expect(it.nutrition!.kcal).toBeUndefined();
          expect(it.nutrition!.carb).toBeUndefined();
          expect(typeof it.nutrition!.carbPct).toBe('number');
        } else if (exposure === 'macros') {
          expect(it.nutrition!.kcal).toBeUndefined();
          expect(typeof it.nutrition!.carb).toBe('number');
        } else if (exposure === 'full_kcal') {
          expect(typeof it.nutrition!.kcal).toBe('number');
          expect(typeof it.nutrition!.carb).toBe('number');
        }
      }
    }
  });

  it('404 para paciente inexistente (uuid válido, sem registro)', async () => {
    await request(app.getHttpServer())
      .get('/patients/00000000-0000-0000-0000-000000000000/today')
      .expect(404);
  });

  it('400 para patientId não-uuid (ParseUUIDPipe na borda)', async () => {
    await request(app.getHttpServer())
      .get('/patients/not-a-uuid/today')
      .expect(400);
  });
});

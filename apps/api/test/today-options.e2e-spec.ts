import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, pool, schema } from '@bamboo/db';
import { PlanModule } from '../src/plan/plan.module';

// e2e Fase 2 — extensão do GET /today: expõe TODAS as opções de cada refeição
// (gatilho P1), mantendo defaultOption/otherOptionsCount por retrocompat.
describe('GET /patients/:id/today — opções (Fase 2)', () => {
  let app: INestApplication;
  let patientId: string;
  let exposure: string;

  beforeAll(async () => {
    const [pat] = await db
      .select({ id: schema.patient.id, exposure: schema.patient.exposure })
      .from(schema.patient)
      .limit(1);
    patientId = pat.id;
    exposure = pat.exposure;

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

  it('cada refeição traz options (1 default) + retrocompat defaultOption/otherOptionsCount', async () => {
    const res = await request(app.getHttpServer())
      .get(`/patients/${patientId}/today`)
      .expect(200);

    for (const m of res.body.meals as Array<{
      options: Array<{ id: string; isDefault: boolean; items: unknown[] }>;
      defaultOption: { id: string };
      otherOptionsCount: number;
    }>) {
      expect(Array.isArray(m.options)).toBe(true);
      expect(m.options.length).toBeGreaterThanOrEqual(1);
      const defaults = m.options.filter((o) => o.isDefault);
      expect(defaults.length).toBe(1);
      expect(m.defaultOption.id).toBe(defaults[0].id);
      expect(m.otherOptionsCount).toBe(m.options.length - 1);
    }
  });

  it('aplica o gate de exposição em TODAS as opções (não só a default)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/patients/${patientId}/today`)
      .expect(200);

    const items = (
      res.body.meals as Array<{
        options: Array<{ items: Array<{ nutrition?: unknown }> }>;
      }>
    ).flatMap((m) => m.options.flatMap((o) => o.items));
    expect(items.length).toBeGreaterThan(0);
    for (const it of items) {
      if (exposure === 'hidden') expect(it.nutrition).toBeUndefined();
      else expect(it.nutrition).toBeDefined();
    }
  });
});

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, asc, eq, db, pool, schema } from '@bamboo/db';
import { RebalanceModule } from '../src/rebalance/rebalance.module';

// e2e US1 — POST /patients/:id/rebalance/option-choice (gatilho P1).
// IDs por query (o seed gera UUIDs novos a cada run; resolve o day_type de hoje).
describe('POST /patients/:id/rebalance/option-choice (US1)', () => {
  let app: INestApplication;
  let patientId: string;
  let exposure: string;
  let triggerMealId: string;
  let triggerPosition: number;
  let defaultOptionId: string;
  let heavierOptionId: string;
  let foreignOptionId: string; // opção de OUTRA refeição (pra testar 422)

  beforeAll(async () => {
    const [pat] = await db
      .select({ id: schema.patient.id, exposure: schema.patient.exposure })
      .from(schema.patient)
      .limit(1);
    patientId = pat.id;
    exposure = pat.exposure;

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

    const meals = await db
      .select({ id: schema.meal.id, position: schema.meal.position })
      .from(schema.meal)
      .where(eq(schema.meal.dayTypeId, sched.dayTypeId))
      .orderBy(asc(schema.meal.position));

    // Acha uma refeição com >1 opção (trigger) e uma opção de outra refeição.
    for (const m of meals) {
      const opts = await db
        .select({
          id: schema.mealOption.id,
          isDefault: schema.mealOption.isDefault,
        })
        .from(schema.mealOption)
        .where(eq(schema.mealOption.mealId, m.id));
      if (!triggerMealId && opts.length > 1) {
        triggerMealId = m.id;
        triggerPosition = m.position;
        defaultOptionId = (opts.find((o) => o.isDefault) ?? opts[0]).id;
        heavierOptionId = opts.find((o) => !o.isDefault)!.id;
      } else if (!foreignOptionId && opts[0]) {
        foreignOptionId = opts[0].id;
      }
    }

    const moduleRef = await Test.createTestingModule({
      imports: [RebalanceModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await pool.end();
  });

  it('opção igual à default → sem-acao (cabe na faixa)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/patients/${patientId}/rebalance/option-choice`)
      .send({ triggerMealId, chosenOptionId: defaultOptionId })
      .expect(200);
    expect(res.body.outcome.kind).toBe('sem-acao');
  });

  it('opção mais pesada → rebalanceado (seguintes) ou recusa-orientada (200, nunca barra)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/patients/${patientId}/rebalance/option-choice`)
      .send({ triggerMealId, chosenOptionId: heavierOptionId })
      .expect(200);

    const outcome = res.body.outcome;
    expect(['rebalanceado', 'recusa-orientada']).toContain(outcome.kind);

    if (outcome.kind === 'rebalanceado') {
      expect(Array.isArray(outcome.refeicoesAfetadas)).toBe(true);
      for (const r of outcome.refeicoesAfetadas as Array<{
        position: number;
        itensAjustados: Array<{
          food: { id: string; name: string };
          gramasNovo: number;
        }>;
      }>) {
        expect(r.position).not.toBe(triggerPosition); // qualquer refeição não-gatilho (não registrada)
        for (const it of r.itensAjustados) {
          expect(typeof it.food.name).toBe('string');
          expect(it.gramasNovo).toBeGreaterThan(0);
        }
      }
      // exposição = macros → totalDepois traz macros, sem kcal cheio.
      if (exposure === 'macros') {
        expect(typeof outcome.totalDepois.carb).toBe('number');
        expect(outcome.totalDepois.kcal).toBeUndefined();
      }
    } else {
      expect(['estoura-piso', 'sem-alavanca']).toContain(outcome.motivo);
      expect(typeof outcome.mensagem).toBe('string');
    }
  });

  it('opção que não pertence à refeição do gatilho → 422', async () => {
    await request(app.getHttpServer())
      .post(`/patients/${patientId}/rebalance/option-choice`)
      .send({ triggerMealId, chosenOptionId: foreignOptionId })
      .expect(422);
  });

  it('paciente inexistente → 404', async () => {
    await request(app.getHttpServer())
      .post(
        `/patients/00000000-0000-0000-0000-000000000000/rebalance/option-choice`,
      )
      .send({ triggerMealId, chosenOptionId: defaultOptionId })
      .expect(404);
  });

  it('corpo inválido (triggerMealId não-uuid) → 400', async () => {
    await request(app.getHttpServer())
      .post(`/patients/${patientId}/rebalance/option-choice`)
      .send({ triggerMealId: 'nope', chosenOptionId: defaultOptionId })
      .expect(400);
  });

  it('patientId não-uuid → 400 (ParseUUIDPipe na borda)', async () => {
    await request(app.getHttpServer())
      .post(`/patients/not-a-uuid/rebalance/option-choice`)
      .send({ triggerMealId, chosenOptionId: defaultOptionId })
      .expect(400);
  });
});

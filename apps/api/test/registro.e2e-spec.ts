import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, asc, eq, db, pool, schema } from '@bamboo/db';
import { RegistroModule } from '../src/registro/registro.module';
import { PlanModule } from '../src/plan/plan.module';

// e2e US1 (test-first) — POST /patients/:id/registro + reflexo no GET /today.
// Registrar feito/pulei numa refeição do dia, "o agora" avança, estado vigente
// persiste entre GETs e o dia conclui quando todas registradas. IDs por query
// (o seed gera UUIDs novos a cada run; resolve o day_type de hoje).
//
// Casos de troquei/correção/desfazer são US2/US3 — fora desta suíte.
//
// NB: cada `it` depende do estado deixado pelo anterior (registros são
// append-only no banco). A suíte roda sequencial (fileParallelism:false) e os
// passos são encadeados de propósito (passo 1 registra a 1ª, passo 2 lê, etc.).
describe('POST /patients/:id/registro (US1) + reflexo no GET /today', () => {
  let app: INestApplication;
  let patientId: string;
  let mealIds: string[]; // refeições do dia, na ordem do plano (position asc)

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

    // day_type de hoje (mesma resolução do service: weekday do servidor).
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
    mealIds = meals.map((m) => m.id);

    const moduleRef = await Test.createTestingModule({
      // RegistroModule p/ o POST; PlanModule p/ o GET /today (reflexo do estado).
      imports: [RegistroModule, PlanModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await pool.end();
  });

  it('estado inicial: GET /today → currentMealId = 1ª, toda refeição registro=null, diaConcluido=false', async () => {
    const res = await request(app.getHttpServer())
      .get(`/patients/${patientId}/today`)
      .expect(200);

    expect(res.body.diaConcluido).toBe(false);
    expect(res.body.currentMealId).toBe(mealIds[0]);
    for (const m of res.body.meals as Array<{
      id: string;
      registro: { state: string } | null;
      isCurrent: boolean;
    }>) {
      expect(m.registro).toBeNull();
    }
    const current = (
      res.body.meals as Array<{ id: string; isCurrent: boolean }>
    ).find((m) => m.isCurrent);
    expect(current?.id).toBe(mealIds[0]);
  });

  it('POST feito SEM consumo (assume default) na 1ª refeição → 200, vigente.state="feito", currentMealId avança p/ a 2ª', async () => {
    const res = await request(app.getHttpServer())
      .post(`/patients/${patientId}/registro`)
      .send({ mealId: mealIds[0], intent: 'feito' })
      .expect(200);

    expect(res.body.mealId).toBe(mealIds[0]);
    expect(typeof res.body.loggedDate).toBe('string');
    expect(res.body.vigente).toEqual({ state: 'feito' });
    expect(res.body.currentMealId).toBe(mealIds[1]);
    expect(res.body.diaConcluido).toBe(false);
  });

  it('GET /today reflete registro.state="feito" na 1ª e isCurrent na 2ª', async () => {
    const res = await request(app.getHttpServer())
      .get(`/patients/${patientId}/today`)
      .expect(200);

    expect(res.body.currentMealId).toBe(mealIds[1]);
    expect(res.body.diaConcluido).toBe(false);

    const meals = res.body.meals as Array<{
      id: string;
      registro: { state: string } | null;
      isCurrent: boolean;
    }>;
    const first = meals.find((m) => m.id === mealIds[0]);
    const second = meals.find((m) => m.id === mealIds[1]);
    expect(first?.registro).toEqual({ state: 'feito' });
    expect(first?.isCurrent).toBe(false);
    expect(second?.registro).toBeNull();
    expect(second?.isCurrent).toBe(true);
  });

  it('POST pulei na 2ª refeição → 200, vigente.state="pulei", "o agora" avança p/ a 3ª', async () => {
    const res = await request(app.getHttpServer())
      .post(`/patients/${patientId}/registro`)
      .send({ mealId: mealIds[1], intent: 'pulei' })
      .expect(200);

    expect(res.body.vigente).toEqual({ state: 'pulei' });
    expect(res.body.currentMealId).toBe(mealIds[2]);
    expect(res.body.diaConcluido).toBe(false);
  });

  it('persistência: novo GET /today mantém os estados (1ª feito, 2ª pulei, 3ª é o agora)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/patients/${patientId}/today`)
      .expect(200);

    expect(res.body.currentMealId).toBe(mealIds[2]);
    const meals = res.body.meals as Array<{
      id: string;
      registro: { state: string } | null;
      isCurrent: boolean;
    }>;
    expect(meals.find((m) => m.id === mealIds[0])?.registro).toEqual({
      state: 'feito',
    });
    expect(meals.find((m) => m.id === mealIds[1])?.registro).toEqual({
      state: 'pulei',
    });
    expect(meals.find((m) => m.id === mealIds[2])?.isCurrent).toBe(true);
  });

  it('registrar TODAS as refeições restantes → última retorna currentMealId=null + diaConcluido=true', async () => {
    // 1ª e 2ª já registradas; fecha da 3ª em diante.
    for (let i = 2; i < mealIds.length; i++) {
      const res = await request(app.getHttpServer())
        .post(`/patients/${patientId}/registro`)
        .send({ mealId: mealIds[i], intent: 'feito' })
        .expect(200);

      if (i < mealIds.length - 1) {
        expect(res.body.currentMealId).toBe(mealIds[i + 1]);
        expect(res.body.diaConcluido).toBe(false);
      } else {
        // última: dia concluído.
        expect(res.body.currentMealId).toBeNull();
        expect(res.body.diaConcluido).toBe(true);
      }
    }

    // GET /today confirma o dia concluído.
    const today = await request(app.getHttpServer())
      .get(`/patients/${patientId}/today`)
      .expect(200);
    expect(today.body.currentMealId).toBeNull();
    expect(today.body.diaConcluido).toBe(true);
    for (const m of today.body.meals as Array<{
      registro: { state: string } | null;
      isCurrent: boolean;
    }>) {
      expect(m.registro).not.toBeNull();
      expect(m.isCurrent).toBe(false);
    }
  });

  it('paciente inexistente (uuid válido, sem plano) → 404', async () => {
    await request(app.getHttpServer())
      .post('/patients/00000000-0000-0000-0000-000000000000/registro')
      .send({ mealId: mealIds[0], intent: 'feito' })
      .expect(404);
  });

  it('patientId não-uuid → 400 (ParseUUIDPipe na borda)', async () => {
    await request(app.getHttpServer())
      .post('/patients/not-a-uuid/registro')
      .send({ mealId: mealIds[0], intent: 'feito' })
      .expect(400);
  });

  it('corpo inválido (mealId não-uuid) → 400', async () => {
    await request(app.getHttpServer())
      .post(`/patients/${patientId}/registro`)
      .send({ mealId: 'nope', intent: 'feito' })
      .expect(400);
  });

  it('corpo inválido (intent fora do enum) → 400', async () => {
    await request(app.getHttpServer())
      .post(`/patients/${patientId}/registro`)
      .send({ mealId: mealIds[0], intent: 'troquei' })
      .expect(400);
  });
});

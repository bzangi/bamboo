import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray, db, schema } from '@bamboo/db';
import { CicloModule } from '../src/ciclo/ciclo.module';
import { PlanModule } from '../src/plan/plan.module';

// e2e da Feature 007 — ciclo de acompanhamento, test-first.
//
// Banco compartilhado entre suítes (mesmas regras da 006): nada aqui toca os
// REGISTROS de hoje; ciclos/vigências/pacientes/planos criados pela suíte são
// apagados no afterAll. A suíte roda depois de adesao.e2e-spec.ts (alfabético)
// e antes das demais — nenhum fluxo do paciente lê as tabelas de ciclo.

const NUTRI_KEY = 'test-nutri-key';
process.env.NUTRI_API_KEY = NUTRI_KEY;

// Mesma fonte de dia-calendário local do servidor (local-date.ts).
const hojeIso = (): string => {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
};

const isoDaysAgo = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
};

let app: INestApplication;
let patientId: string;
let planId: string; // plano ativo do seed
let extraPatientId: string | null = null; // sem plano ativo (US1)
let planBId: string | null = null; // 2º plano do paciente (US2 — active-plan)

const nutriPost = (path: string, body?: object) =>
  request(app.getHttpServer())
    .post(path)
    .set('x-nutri-key', NUTRI_KEY)
    .send(body ?? {});

const nutriGet = (path: string) =>
  request(app.getHttpServer()).get(path).set('x-nutri-key', NUTRI_KEY);

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
      and(eq(schema.plan.patientId, patientId), eq(schema.plan.isActive, true)),
    )
    .limit(1);
  planId = pln.id;

  const [n] = await db
    .select({ id: schema.nutritionist.id })
    .from(schema.nutritionist)
    .limit(1);
  const [extra] = await db
    .insert(schema.patient)
    .values({ nutritionistId: n.id, name: 'Sem Plano (e2e ciclo)' })
    .returning({ id: schema.patient.id });
  extraPatientId = extra.id;

  const moduleRef = await Test.createTestingModule({
    imports: [CicloModule, PlanModule], // PlanModule só pro snapshot do /today
  }).compile();
  app = moduleRef.createNestApplication();
  await app.init();
});

afterAll(async () => {
  // Apaga TUDO que a suíte criou: vigências/ciclos do paciente, plano B
  // (re-ativando o plano A do seed) e o paciente extra.
  const ciclos = await db
    .select({ id: schema.cycle.id })
    .from(schema.cycle)
    .where(eq(schema.cycle.patientId, patientId));
  if (ciclos.length > 0) {
    await db.delete(schema.cyclePlanVigencia).where(
      inArray(
        schema.cyclePlanVigencia.cycleId,
        ciclos.map((c) => c.id),
      ),
    );
    await db
      .delete(schema.cycle)
      .where(eq(schema.cycle.patientId, patientId));
  }
  if (planBId) {
    await db
      .update(schema.plan)
      .set({ isActive: true })
      .where(eq(schema.plan.id, planId));
    await db.delete(schema.plan).where(eq(schema.plan.id, planBId));
  }
  if (extraPatientId) {
    await db
      .delete(schema.patient)
      .where(eq(schema.patient.id, extraPatientId));
  }
  await app?.close();
});

// ───────────────────── US1 — abrir o ciclo na consulta ─────────────────────

describe('POST /nutri/patients/:id/cycles (US1 — abrir)', () => {
  let todayAntes: object;

  it('US1.4(a) — snapshot do /today ANTES de existir qualquer ciclo', async () => {
    const res = await request(app.getHttpServer())
      .get(`/patients/${patientId}/today`)
      .expect(200);
    todayAntes = res.body as object;
    expect(JSON.stringify(todayAntes)).not.toMatch(/cycle|ciclo/i);
  });

  it('US1.3 — duração ausente/zero/negativa/não-inteira → 400 (obrigatória ao abrir)', async () => {
    for (const body of [{}, { expectedDurationDays: 0 }, { expectedDurationDays: -7 }, { expectedDurationDays: 3.5 }]) {
      await nutriPost(`/nutri/patients/${patientId}/cycles`, body).expect(400);
    }
  });

  it('US1.1 — abrir com duração → 201: ativo, startedOn = hoje, vigência inicial = plano ativo', async () => {
    const res = await nutriPost(`/nutri/patients/${patientId}/cycles`, {
      expectedDurationDays: 42,
    }).expect(201);
    expect(res.body.startedOn).toBe(hojeIso());
    expect(res.body.expectedDurationDays).toBe(42);
    expect(res.body.closedOn).toBeNull();
    expect(res.body.fechouAnterior).toBeNull();
    expect(res.body.vigencias).toEqual([
      { planId, validFrom: hojeIso(), validTo: null },
    ]);
  });

  it('US1.4(b) — paciente sem plano ativo → 422; paciente inexistente → 404', async () => {
    await nutriPost(`/nutri/patients/${extraPatientId}/cycles`, {
      expectedDurationDays: 28,
    }).expect(422);
    await nutriPost(
      '/nutri/patients/00000000-0000-0000-0000-000000000000/cycles',
      { expectedDurationDays: 28 },
    ).expect(404);
  });

  it('US1.4(c) — /today do paciente IDÊNTICO depois de abrir o ciclo (SC-003/SC-006)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/patients/${patientId}/today`)
      .expect(200);
    expect(res.body).toEqual(todayAntes);
  });
});

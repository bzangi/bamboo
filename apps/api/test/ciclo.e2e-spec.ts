import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray, isNull, db, schema } from '@bamboo/db';
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
let foreignPlanId: string | null = null; // plano do paciente extra (US2 — 404)
const eventosUs3: string[] = []; // meal_events passados inseridos pra US3

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
  if (eventosUs3.length > 0) {
    await db
      .delete(schema.mealEvent)
      .where(inArray(schema.mealEvent.id, eventosUs3));
  }
  if (planBId) {
    await db
      .update(schema.plan)
      .set({ isActive: true })
      .where(eq(schema.plan.id, planId));
    await db.delete(schema.plan).where(eq(schema.plan.id, planBId));
  }
  if (foreignPlanId) {
    await db.delete(schema.plan).where(eq(schema.plan.id, foreignPlanId));
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

// ──────────────── US2 — fechar na reavaliação e abrir o próximo ────────────────

describe('ciclo de vida A+C + active-plan (US2)', () => {
  const contagens = async () => {
    const evs = await db
      .select({ id: schema.mealEvent.id })
      .from(schema.mealEvent);
    const its = await db
      .select({ id: schema.mealEventItem.id })
      .from(schema.mealEventItem);
    return { eventos: evs.length, itens: its.length };
  };

  const ativos = async () =>
    db
      .select({ id: schema.cycle.id })
      .from(schema.cycle)
      .where(
        and(
          eq(schema.cycle.patientId, patientId),
          isNull(schema.cycle.closedOn),
        ),
      );

  it('US2.1 — fechar com ativo → closedOn = hoje, vigência corrente fechada; dado cru intacto (SC-004)', async () => {
    const antes = await contagens();
    const res = await nutriPost(
      `/nutri/patients/${patientId}/cycles/close`,
    ).expect(200);
    expect(res.body.closedOn).toBe(hojeIso());
    expect(res.body.ativo).toBe(false);
    expect(
      (res.body.vigencias as { validTo: string | null }[]).every(
        (v) => v.validTo !== null,
      ),
    ).toBe(true);
    expect(await contagens()).toEqual(antes); // nada de registro tocado
    expect(await ativos()).toHaveLength(0);
  });

  it('US2.3 — fechar sem ativo → no-op orientado (nunca erro destrutivo; 2× idem)', async () => {
    for (let i = 0; i < 2; i++) {
      const res = await nutriPost(
        `/nutri/patients/${patientId}/cycles/close`,
      ).expect(200);
      expect(res.body).toEqual({
        kind: 'no-op-orientado',
        motivo: 'sem-ciclo-ativo',
      });
    }
  });

  it('US2.2 — reabrir e abrir DE NOVO no mesmo dia → anterior auto-fechado, nunca 2 ativos (SC-002)', async () => {
    const r1 = await nutriPost(`/nutri/patients/${patientId}/cycles`, {
      expectedDurationDays: 28,
    }).expect(201);
    expect(r1.body.fechouAnterior).toBeNull(); // não havia ativo (US2.1 fechou)

    const r2 = await nutriPost(`/nutri/patients/${patientId}/cycles`, {
      expectedDurationDays: 14,
    }).expect(201);
    expect(r2.body.fechouAnterior).toEqual({
      id: r1.body.id,
      closedOn: hojeIso(),
    });
    expect(await ativos()).toHaveLength(1); // índice parcial + transação
  });

  it('active-plan — flipa is_active E grava a vigência no ciclo aberto (observa)', async () => {
    const [novo] = await db
      .insert(schema.plan)
      .values({ patientId, name: 'Plano B (e2e ciclo)', isActive: false })
      .returning({ id: schema.plan.id });
    planBId = novo.id;

    await nutriPost(`/nutri/patients/${patientId}/active-plan`, {
      planId: planBId,
    }).expect(200);

    const planos = await db
      .select({ id: schema.plan.id, isActive: schema.plan.isActive })
      .from(schema.plan)
      .where(eq(schema.plan.patientId, patientId));
    expect(planos.find((p) => p.id === planId)?.isActive).toBe(false);
    expect(planos.find((p) => p.id === planBId)?.isActive).toBe(true);

    const [ativo] = await ativos();
    const vigencias = await db
      .select({
        planId: schema.cyclePlanVigencia.planId,
        validFrom: schema.cyclePlanVigencia.validFrom,
        validTo: schema.cyclePlanVigencia.validTo,
      })
      .from(schema.cyclePlanVigencia)
      .where(eq(schema.cyclePlanVigencia.cycleId, ativo.id));
    expect(vigencias).toHaveLength(2); // inicial (fechada hoje) + nova corrente
    expect(
      vigencias.find((v) => v.planId === planId),
    ).toEqual({ planId, validFrom: hojeIso(), validTo: hojeIso() });
    expect(
      vigencias.find((v) => v.planId === planBId),
    ).toEqual({ planId: planBId, validFrom: hojeIso(), validTo: null });
  });

  it('active-plan — já ativo → no-op (nenhuma vigência nova); plano de outro paciente → 404', async () => {
    const [ativo] = await ativos();
    const antes = await db
      .select({ id: schema.cyclePlanVigencia.id })
      .from(schema.cyclePlanVigencia)
      .where(eq(schema.cyclePlanVigencia.cycleId, ativo.id));

    await nutriPost(`/nutri/patients/${patientId}/active-plan`, {
      planId: planBId,
    }).expect(200); // já ativo → no-op

    const depois = await db
      .select({ id: schema.cyclePlanVigencia.id })
      .from(schema.cyclePlanVigencia)
      .where(eq(schema.cyclePlanVigencia.cycleId, ativo.id));
    expect(depois.length).toBe(antes.length);

    // Plano que não é do paciente → 404 (cria no paciente extra).
    const [alheio] = await db
      .insert(schema.plan)
      .values({
        patientId: extraPatientId as string,
        name: 'Plano alheio (e2e)',
        isActive: false,
      })
      .returning({ id: schema.plan.id });
    foreignPlanId = alheio.id;
    await nutriPost(`/nutri/patients/${patientId}/active-plan`, {
      planId: foreignPlanId,
    }).expect(404);
  });

  it('active-plan — SEM ciclo aberto: a troca acontece e nenhuma vigência é gravada', async () => {
    await nutriPost(`/nutri/patients/${patientId}/cycles/close`).expect(200);

    const antes = await db
      .select({ id: schema.cyclePlanVigencia.id })
      .from(schema.cyclePlanVigencia);

    await nutriPost(`/nutri/patients/${patientId}/active-plan`, {
      planId, // volta pro plano A do seed
    }).expect(200);

    const planos = await db
      .select({ id: schema.plan.id, isActive: schema.plan.isActive })
      .from(schema.plan)
      .where(eq(schema.plan.patientId, patientId));
    expect(planos.find((p) => p.id === planId)?.isActive).toBe(true);

    const depois = await db
      .select({ id: schema.cyclePlanVigencia.id })
      .from(schema.cyclePlanVigencia);
    expect(depois.length).toBe(antes.length); // nada a observar sem ciclo
  });
});

// ──────────────── US3 — o ciclo responde por um período ────────────────

describe('linha do tempo, detalhe e atribuição (US3)', () => {
  // Dois ciclos passados consecutivos (fronteira compartilhada) + registros,
  // montados por insert direto — datas passadas, cleanup no afterAll global.
  const C1_INI = isoDaysAgo(20);
  const C1_FIM = isoDaysAgo(10); // = início do c2 (fronteira)
  const C2_INI = isoDaysAgo(10);
  const C2_FIM = isoDaysAgo(5);
  const DIA_C1 = isoDaysAgo(15); // registro feito
  const DIA_ANULADO = isoDaysAgo(14); // feito + anulação → não aparece
  const DIA_C2 = isoDaysAgo(7); // registro pulei
  const DIA_LACUNA = isoDaysAgo(4);
  let c1Id: string;
  let c2Id: string;
  let mealRef: { id: string; position: number; dayTypeId: string };

  beforeAll(async () => {
    const [c1] = await db
      .insert(schema.cycle)
      .values({
        patientId,
        startedOn: C1_INI,
        expectedDurationDays: 10,
        closedOn: C1_FIM,
        createdAt: new Date(`${C1_INI}T09:00:00`),
      })
      .returning({ id: schema.cycle.id });
    c1Id = c1.id;
    const [c2] = await db
      .insert(schema.cycle)
      .values({
        patientId,
        startedOn: C2_INI,
        expectedDurationDays: 5,
        closedOn: C2_FIM,
        createdAt: new Date(`${C2_INI}T09:00:00`),
      })
      .returning({ id: schema.cycle.id });
    c2Id = c2.id;
    await db.insert(schema.cyclePlanVigencia).values([
      { cycleId: c1Id, planId, validFrom: C1_INI, validTo: C1_FIM },
      { cycleId: c2Id, planId, validFrom: C2_INI, validTo: C2_FIM },
    ]);

    // Uma refeição qualquer do plano (join via day_type) pros registros.
    const [m] = await db
      .select({
        id: schema.meal.id,
        position: schema.meal.position,
        dayTypeId: schema.meal.dayTypeId,
      })
      .from(schema.meal)
      .innerJoin(schema.dayType, eq(schema.meal.dayTypeId, schema.dayType.id))
      .where(eq(schema.dayType.planId, planId))
      .limit(1);
    mealRef = m;

    const evento = (
      loggedDate: string,
      state: 'feito' | 'pulei' | null,
      hora: string,
    ) => ({
      patientId,
      planId,
      mealId: mealRef.id,
      dayTypeId: mealRef.dayTypeId,
      chosenMealOptionId: null,
      state,
      loggedDate,
      createdAt: new Date(`${loggedDate}T${hora}`),
    });
    const inseridos = await db
      .insert(schema.mealEvent)
      .values([
        evento(DIA_C1, 'feito', '12:00:00'),
        evento(DIA_ANULADO, 'feito', '12:00:00'),
        evento(DIA_ANULADO, null, '12:05:00'), // anulação — não aparece no detalhe
        evento(DIA_C2, 'pulei', '12:00:00'),
      ])
      .returning({ id: schema.mealEvent.id });
    eventosUs3.push(...inseridos.map((e) => e.id));
  });

  it('US3.1 — atribuição determinística: dentro → o ciclo; fronteira → o aberto mais recentemente', async () => {
    const dentro = await nutriGet(
      `/nutri/patients/${patientId}/cycle-do-dia?date=${DIA_C1}`,
    ).expect(200);
    expect(dentro.body).toEqual({ date: DIA_C1, cycleId: c1Id });

    const repetida = await nutriGet(
      `/nutri/patients/${patientId}/cycle-do-dia?date=${DIA_C1}`,
    ).expect(200);
    expect(repetida.body).toEqual(dentro.body);

    const fronteira = await nutriGet(
      `/nutri/patients/${patientId}/cycle-do-dia?date=${C1_FIM}`,
    ).expect(200);
    expect(fronteira.body.cycleId).toBe(c2Id); // startedOn mais recente vence
  });

  it('US3.2 — lacuna e dia anterior a tudo → cycleId null; date inválida → 400', async () => {
    const lacuna = await nutriGet(
      `/nutri/patients/${patientId}/cycle-do-dia?date=${DIA_LACUNA}`,
    ).expect(200);
    expect(lacuna.body.cycleId).toBeNull();

    const anterior = await nutriGet(
      `/nutri/patients/${patientId}/cycle-do-dia?date=${isoDaysAgo(30)}`,
    ).expect(200);
    expect(anterior.body.cycleId).toBeNull();

    await nutriGet(
      `/nutri/patients/${patientId}/cycle-do-dia?date=2026-6-1`,
    ).expect(400);
  });

  it('linha do tempo — ordem cronológica com vigências', async () => {
    const res = await nutriGet(`/nutri/patients/${patientId}/cycles`).expect(
      200,
    );
    const cycles = res.body.cycles as {
      id: string;
      startedOn: string;
      vigencias: unknown[];
    }[];
    const idx1 = cycles.findIndex((c) => c.id === c1Id);
    const idx2 = cycles.findIndex((c) => c.id === c2Id);
    expect(idx1).toBeGreaterThanOrEqual(0);
    expect(idx2).toBe(idx1 + 1); // c1 antes de c2
    const datas = cycles.map((c) => c.startedOn);
    expect([...datas].sort()).toEqual(datas); // asc
    expect(cycles[idx1].vigencias).toHaveLength(1);
  });

  it('US3.3 — detalhe: janela + vigências + registros do período (estado vigente; sem métricas)', async () => {
    const res = await nutriGet(
      `/nutri/patients/${patientId}/cycles/${c1Id}`,
    ).expect(200);
    expect(res.body.startedOn).toBe(C1_INI);
    expect(res.body.closedOn).toBe(C1_FIM);
    expect(res.body.vigencias).toEqual([
      { planId, validFrom: C1_INI, validTo: C1_FIM },
    ]);
    // Só o registro vigente — o anulado de DIA_ANULADO não aparece.
    expect(res.body.registros).toEqual([
      {
        date: DIA_C1,
        mealId: mealRef.id,
        position: mealRef.position,
        state: 'feito',
      },
    ]);
    // Nenhuma métrica no payload (FR-010).
    expect(JSON.stringify(res.body)).not.toMatch(
      /valorPct|media|adesao|cobertura/,
    );

    const c2 = await nutriGet(
      `/nutri/patients/${patientId}/cycles/${c2Id}`,
    ).expect(200);
    expect(
      (c2.body.registros as { state: string }[]).map((r) => r.state),
    ).toEqual(['pulei']);
  });

  it('detalhe de ciclo de outro paciente / inexistente → 404', async () => {
    await nutriGet(
      `/nutri/patients/${extraPatientId}/cycles/${c1Id}`,
    ).expect(404);
    await nutriGet(
      `/nutri/patients/${patientId}/cycles/00000000-0000-0000-0000-000000000000`,
    ).expect(404);
  });

  it('FR-013 — TODAS as rotas de ciclo sem x-nutri-key → 403', async () => {
    const server = app.getHttpServer();
    await request(server)
      .post(`/nutri/patients/${patientId}/cycles`)
      .send({ expectedDurationDays: 7 })
      .expect(403);
    await request(server)
      .post(`/nutri/patients/${patientId}/cycles/close`)
      .expect(403);
    await request(server)
      .post(`/nutri/patients/${patientId}/active-plan`)
      .send({ planId })
      .expect(403);
    await request(server).get(`/nutri/patients/${patientId}/cycles`).expect(403);
    await request(server)
      .get(`/nutri/patients/${patientId}/cycles/${c1Id}`)
      .expect(403);
    await request(server)
      .get(`/nutri/patients/${patientId}/cycle-do-dia?date=${DIA_C1}`)
      .expect(403);
  });
});

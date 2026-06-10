import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, asc, eq, inArray, db, pool, schema } from '@bamboo/db';
import { AdesaoModule } from '../src/adesao/adesao.module';

// e2e da Feature 006 — métrica de adesão (só-nutri), test-first.
//
// IMPORTANTE (ordem das suítes): este arquivo roda PRIMEIRO (alfabético) e o
// banco é compartilhado. Por isso TODOS os registros daqui são de DIAS
// PASSADOS, inseridos direto via @bamboo/db (nunca via POST /registro de
// hoje) e apagados no afterAll — o estado de "hoje" fica intacto pras outras
// suítes (registro/today esperam dia virgem pós-seed).
//
// A credencial stub da nutri é fixada no process.env ANTES das requisições
// (o guard lê a env a cada request) — a suíte é determinística sem .env.

const NUTRI_KEY = 'test-nutri-key';
process.env.NUTRI_API_KEY = NUTRI_KEY;

// Data-calendário local "YYYY-MM-DD" de N dias atrás (mesma fonte de relógio
// do servidor — new Date() local, como local-date.ts).
const isoDaysAgo = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
};

const weekdayOf = (iso: string): number => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
};

type DayShape = {
  date: string;
  status: 'com-dado' | 'sem-dado';
  valorPct?: number;
  dentroFaixa?: boolean;
  flags?: Record<string, string>;
  cobertura?: number;
};

describe('GET /nutri/patients/:id/adesao (US1 — adesão de um dia)', () => {
  let app: INestApplication;
  let patientId: string;
  let planId: string;
  const insertedEventIds: string[] = [];
  let extraPatientId: string | null = null;

  // Dias de teste (todos no passado; hoje fica intacto).
  const DIA_FEITO = isoDaysAgo(3); // tudo feito conforme o plano → 100%
  const DIA_PULEI = isoDaysAgo(4); // tudo pulei → fora da faixa
  const DIA_ANULADO = isoDaysAgo(5); // registro único, depois anulado → sem-dado
  const DIA_VAZIO = isoDaysAgo(6); // nunca registrado → sem-dado

  // Refeições (e opção default + itens) do tipo-de-dia da PROGRAMAÇÃO pra data.
  const diaPlanejado = async (dateIso: string) => {
    const [sched] = await db
      .select({ dayTypeId: schema.daySchedule.dayTypeId })
      .from(schema.daySchedule)
      .where(
        and(
          eq(schema.daySchedule.planId, planId),
          eq(schema.daySchedule.weekday, weekdayOf(dateIso)),
        ),
      )
      .limit(1);
    const meals = await db
      .select({ id: schema.meal.id, position: schema.meal.position })
      .from(schema.meal)
      .where(eq(schema.meal.dayTypeId, sched.dayTypeId))
      .orderBy(asc(schema.meal.position));
    const options = await db
      .select({
        id: schema.mealOption.id,
        mealId: schema.mealOption.mealId,
        isDefault: schema.mealOption.isDefault,
      })
      .from(schema.mealOption)
      .where(
        inArray(
          schema.mealOption.mealId,
          meals.map((m) => m.id),
        ),
      );
    const defaultOf = new Map(
      options.filter((o) => o.isDefault).map((o) => [o.mealId, o.id]),
    );
    return { dayTypeId: sched.dayTypeId, meals, defaultOf };
  };

  const insertEvento = async (args: {
    mealId: string;
    dayTypeId: string;
    state: 'feito' | 'troquei' | 'pulei' | null;
    chosenMealOptionId?: string | null;
    loggedDate: string;
    createdAt: Date;
    itens?: ReadonlyArray<{ foodId: string; quantityGrams: number }>;
  }) => {
    const [ev] = await db
      .insert(schema.mealEvent)
      .values({
        patientId,
        planId,
        mealId: args.mealId,
        dayTypeId: args.dayTypeId,
        chosenMealOptionId: args.chosenMealOptionId ?? null,
        state: args.state,
        loggedDate: args.loggedDate,
        createdAt: args.createdAt,
      })
      .returning({ id: schema.mealEvent.id });
    insertedEventIds.push(ev.id);
    if (args.itens?.length) {
      await db.insert(schema.mealEventItem).values(
        args.itens.map((i) => ({
          mealEventId: ev.id,
          foodId: i.foodId,
          quantityGrams: i.quantityGrams,
        })),
      );
    }
    return ev.id;
  };

  const getAdesao = (pid: string, from: string, to: string) =>
    request(app.getHttpServer())
      .get(`/nutri/patients/${pid}/adesao`)
      .query({ from, to })
      .set('x-nutri-key', NUTRI_KEY);

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
    planId = pln.id;

    // DIA_FEITO: todas as refeições do tipo programado registradas como feito
    // (opção default) → consumido == alvo → 100%, dentro, sem flags.
    {
      const { dayTypeId, meals, defaultOf } = await diaPlanejado(DIA_FEITO);
      let t = new Date(`${DIA_FEITO}T12:00:00`);
      for (const m of meals) {
        await insertEvento({
          mealId: m.id,
          dayTypeId,
          state: 'feito',
          chosenMealOptionId: defaultOf.get(m.id),
          loggedDate: DIA_FEITO,
          createdAt: t,
        });
        t = new Date(t.getTime() + 60_000);
      }
    }

    // DIA_PULEI: todas puladas → consumido 0 → fora da faixa (abaixo).
    {
      const { dayTypeId, meals } = await diaPlanejado(DIA_PULEI);
      let t = new Date(`${DIA_PULEI}T12:00:00`);
      for (const m of meals) {
        await insertEvento({
          mealId: m.id,
          dayTypeId,
          state: 'pulei',
          loggedDate: DIA_PULEI,
          createdAt: t,
        });
        t = new Date(t.getTime() + 60_000);
      }
    }

    // DIA_ANULADO: um único feito... depois anulado (evento state=null mais
    // recente vence — estado vigente null) → dia volta a sem-dado.
    {
      const { dayTypeId, meals, defaultOf } = await diaPlanejado(DIA_ANULADO);
      const m = meals[0];
      await insertEvento({
        mealId: m.id,
        dayTypeId,
        state: 'feito',
        chosenMealOptionId: defaultOf.get(m.id),
        loggedDate: DIA_ANULADO,
        createdAt: new Date(`${DIA_ANULADO}T12:00:00`),
      });
      await insertEvento({
        mealId: m.id,
        dayTypeId,
        state: null, // anulação (tombstone)
        loggedDate: DIA_ANULADO,
        createdAt: new Date(`${DIA_ANULADO}T12:05:00`),
      });
    }

    // Paciente extra SEM plano ativo (pra US1.4) — limpo no afterAll.
    {
      const [nutri] = await db
        .select({ id: schema.nutritionist.id })
        .from(schema.nutritionist)
        .limit(1);
      const [extra] = await db
        .insert(schema.patient)
        .values({ nutritionistId: nutri.id, name: 'Sem Plano (e2e adesão)' })
        .returning({ id: schema.patient.id });
      extraPatientId = extra.id;
    }

    const moduleRef = await Test.createTestingModule({
      imports: [AdesaoModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    // Remove SÓ o que esta suíte criou (dias passados + paciente extra).
    if (insertedEventIds.length > 0) {
      await db
        .delete(schema.mealEventItem)
        .where(inArray(schema.mealEventItem.mealEventId, insertedEventIds));
      await db
        .delete(schema.mealEvent)
        .where(inArray(schema.mealEvent.id, insertedEventIds));
    }
    if (extraPatientId) {
      await db
        .delete(schema.patient)
        .where(eq(schema.patient.id, extraPatientId));
    }
    await app?.close();
  });

  it('US1.1 — dia todo feito conforme o plano → com-dado, 100%, dentro, sem flags, cobertura 1', async () => {
    const res = await getAdesao(patientId, DIA_FEITO, DIA_FEITO).expect(200);
    const [day] = res.body.days as DayShape[];
    expect(res.body.days).toHaveLength(1);
    expect(day.date).toBe(DIA_FEITO);
    expect(day.status).toBe('com-dado');
    expect(day.valorPct).toBe(100);
    expect(day.dentroFaixa).toBe(true);
    expect(day.flags).toEqual({});
    expect(day.cobertura).toBe(1);
    expect(res.body.media).toBe(100);
  });

  it('US1.2 — dia todo pulei (total abaixo da faixa) → fora de adesão, valor < 100', async () => {
    const res = await getAdesao(patientId, DIA_PULEI, DIA_PULEI).expect(200);
    const [day] = res.body.days as DayShape[];
    expect(day.status).toBe('com-dado'); // registrou (pulei é registro), só está fora
    expect(day.dentroFaixa).toBe(false);
    expect(day.valorPct).toBeLessThan(100);
    expect(day.cobertura).toBe(1);
  });

  it('US1.3 — registro anulado: o dia reflete o estado vigente (único registro anulado → sem-dado)', async () => {
    const res = await getAdesao(patientId, DIA_ANULADO, DIA_ANULADO).expect(
      200,
    );
    const [day] = res.body.days as DayShape[];
    expect(day.status).toBe('sem-dado');
    expect(day.valorPct).toBeUndefined();
    expect(res.body.media).toBeNull();
  });

  it('US1.4 — dia sem registro / data futura → sem-dado (nunca 0%, nunca erro)', async () => {
    const vazio = await getAdesao(patientId, DIA_VAZIO, DIA_VAZIO).expect(200);
    expect((vazio.body.days as DayShape[])[0].status).toBe('sem-dado');

    const amanha = isoDaysAgo(-1);
    const futuro = await getAdesao(patientId, amanha, amanha).expect(200);
    expect((futuro.body.days as DayShape[])[0].status).toBe('sem-dado');
    expect(futuro.body.media).toBeNull();
  });

  it('US1.4 — paciente sem plano ativo → tudo sem-dado (200); paciente inexistente → 404', async () => {
    const res = await getAdesao(
      extraPatientId as string,
      DIA_FEITO,
      DIA_FEITO,
    ).expect(200);
    expect((res.body.days as DayShape[])[0].status).toBe('sem-dado');
    expect(res.body.media).toBeNull();

    await getAdesao(
      '00000000-0000-0000-0000-000000000000',
      DIA_FEITO,
      DIA_FEITO,
    ).expect(404);
  });

  it('validação estrutural: from>to, formato inválido e período >366 dias → 400', async () => {
    await getAdesao(patientId, DIA_FEITO, DIA_PULEI).expect(400); // from > to
    await getAdesao(patientId, '2026-6-1', DIA_FEITO).expect(400); // formato
    await getAdesao(patientId, '2024-01-01', '2026-01-01').expect(400); // >366d
  });
});

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray, db, schema } from '@bamboo/db';
import { RelatorioModule } from '../src/relatorio/relatorio.module';

// e2e da Feature 011 — relatório de ciclo (só-nutri), test-first.
//
// D7 (self-contained): paciente-cenário PRÓPRIO (nunca o do seed nem o de
// outra suíte) — cria plano/tipo-de-dia/refeições/ciclos/meal_events aqui e
// apaga TUDO no afterAll, em ordem reversa de FK. Nunca usa dados de HOJE de
// outro paciente; nunca toca o paciente do seed (evita colidir com o índice
// único de 1-ciclo-ativo/paciente de ciclo.e2e-spec.ts).
//
// AdesaoModule/CicloModule vêm de graça (RelatorioModule os importa) — dá pra
// chamar GET /nutri/patients/:id/adesao no mesmo app pra checar SC-002
// tratando aquele endpoint como oráculo (não reimplementamos adesaoDoDia
// aqui: comparamos os dois endpoints, nunca uma fórmula calculada à mão).

const NUTRI_KEY = 'test-nutri-key';
process.env.NUTRI_API_KEY = NUTRI_KEY;

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
let outroPatientId: string;
let planId: string;
let meal1Id: string; // position 1
let meal2Id: string; // position 2
let defaultOption1Id: string;
let defaultOption2Id: string;
let dayTypeId: string;

// Ciclos do cenário US1.
let cicloFechadoId: string; // A — 4 dias, registros conhecidos
let cicloAbertoId: string; // B — aberto, parcial
let cicloVazioId: string; // C — aberto hoje, zero registros
let cicloJanelaInvalidaId: string; // D — > 366 dias
let cicloSemanasId: string; // E — 17 dias, 3 semanas com padrões distintos (US2)
let cicloDesempateId: string; // H — com dados; anterior empatado (US3)
let cicloAnteriorPerdedorId: string; // I1 — perde o desempate (startedOn mais antigo)
let cicloAnteriorVencedorId: string; // I2 — vence o desempate; sem registros (US3)

const eventIds: string[] = [];

const nutriGet = (path: string) =>
  request(app.getHttpServer()).get(path).set('x-nutri-key', NUTRI_KEY);

const insertEvento = async (args: {
  mealId: string;
  loggedDate: string;
  state: 'feito' | 'troquei' | 'pulei';
  chosenMealOptionId: string | null;
  hora: string;
}) => {
  const [ev] = await db
    .insert(schema.mealEvent)
    .values({
      patientId,
      planId,
      mealId: args.mealId,
      dayTypeId,
      chosenMealOptionId: args.chosenMealOptionId,
      state: args.state,
      loggedDate: args.loggedDate,
      createdAt: new Date(`${args.loggedDate}T${args.hora}`),
    })
    .returning({ id: schema.mealEvent.id });
  eventIds.push(ev.id);
};

const contagensGlobais = async () => {
  const evs = await db
    .select({ id: schema.mealEvent.id })
    .from(schema.mealEvent);
  const cys = await db.select({ id: schema.cycle.id }).from(schema.cycle);
  const vgs = await db
    .select({ id: schema.cyclePlanVigencia.id })
    .from(schema.cyclePlanVigencia);
  return { eventos: evs.length, ciclos: cys.length, vigencias: vgs.length };
};

beforeAll(async () => {
  const [n] = await db
    .select({ id: schema.nutritionist.id })
    .from(schema.nutritionist)
    .limit(1);
  const [foodA, foodB] = await db
    .select({ id: schema.food.id })
    .from(schema.food)
    .limit(2);

  const [pat] = await db
    .insert(schema.patient)
    .values({ nutritionistId: n.id, name: 'Cenário Relatório (e2e 011)' })
    .returning({ id: schema.patient.id });
  patientId = pat.id;

  const [outro] = await db
    .insert(schema.patient)
    .values({ nutritionistId: n.id, name: 'Outro paciente (e2e 011)' })
    .returning({ id: schema.patient.id });
  outroPatientId = outro.id;

  const [pln] = await db
    .insert(schema.plan)
    .values({ patientId, name: 'Plano (e2e 011)', isActive: true })
    .returning({ id: schema.plan.id });
  planId = pln.id;

  const [dt] = await db
    .insert(schema.dayType)
    .values({ planId, name: 'Padrão' })
    .returning({ id: schema.dayType.id });
  dayTypeId = dt.id;

  const [m1, m2] = await db
    .insert(schema.meal)
    .values([
      { dayTypeId, name: 'Café da manhã', position: 1 },
      { dayTypeId, name: 'Almoço', position: 2 },
    ])
    .returning({ id: schema.meal.id });
  meal1Id = m1.id;
  meal2Id = m2.id;

  const [opt1, opt2] = await db
    .insert(schema.mealOption)
    .values([
      { mealId: meal1Id, label: 'Padrão', isDefault: true },
      { mealId: meal2Id, label: 'Padrão', isDefault: true },
    ])
    .returning({ id: schema.mealOption.id });
  defaultOption1Id = opt1.id;
  defaultOption2Id = opt2.id;

  await db.insert(schema.mealItem).values([
    { mealOptionId: defaultOption1Id, foodId: foodA.id, quantityGrams: 100 },
    { mealOptionId: defaultOption2Id, foodId: foodB.id, quantityGrams: 150 },
  ]);

  // Fallback de tipo-de-dia pra TODOS os weekdays (só 1 tipo neste cenário).
  await db
    .insert(schema.daySchedule)
    .values(
      [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ planId, weekday, dayTypeId })),
    );

  // ── Ciclo A (fechado, 4 dias — US1 dados conhecidos) ──────────────────
  const A_INI = isoDaysAgo(6);
  const A_FIM = isoDaysAgo(3);
  const [a] = await db
    .insert(schema.cycle)
    .values({
      patientId,
      startedOn: A_INI,
      closedOn: A_FIM,
      expectedDurationDays: 4,
    })
    .returning({ id: schema.cycle.id });
  cicloFechadoId = a.id;
  await db.insert(schema.cyclePlanVigencia).values({
    cycleId: cicloFechadoId,
    planId,
    validFrom: A_INI,
    validTo: A_FIM,
  });

  // D1: ambas feito. D2: m1 troquei, m2 feito. D3: ambas pulei. D4: m1 feito, m2 sem registro.
  await insertEvento({
    mealId: meal1Id,
    loggedDate: isoDaysAgo(6),
    state: 'feito',
    chosenMealOptionId: defaultOption1Id,
    hora: '08:00:00',
  });
  await insertEvento({
    mealId: meal2Id,
    loggedDate: isoDaysAgo(6),
    state: 'feito',
    chosenMealOptionId: defaultOption2Id,
    hora: '12:00:00',
  });
  await insertEvento({
    mealId: meal1Id,
    loggedDate: isoDaysAgo(5),
    state: 'troquei',
    chosenMealOptionId: defaultOption1Id,
    hora: '08:00:00',
  });
  await insertEvento({
    mealId: meal2Id,
    loggedDate: isoDaysAgo(5),
    state: 'feito',
    chosenMealOptionId: defaultOption2Id,
    hora: '12:00:00',
  });
  await insertEvento({
    mealId: meal1Id,
    loggedDate: isoDaysAgo(4),
    state: 'pulei',
    chosenMealOptionId: null,
    hora: '08:00:00',
  });
  await insertEvento({
    mealId: meal2Id,
    loggedDate: isoDaysAgo(4),
    state: 'pulei',
    chosenMealOptionId: null,
    hora: '12:00:00',
  });
  await insertEvento({
    mealId: meal1Id,
    loggedDate: isoDaysAgo(3),
    state: 'feito',
    chosenMealOptionId: defaultOption1Id,
    hora: '08:00:00',
  });
  // isoDaysAgo(3) meal2: sem registro (deliberado).

  // ── Ciclo E (17 dias, 3 semanas com padrões distintos — US2) ──────────
  // Semana 1 (7d): tudo feito. Semana 2 (7d): ZERO registros (buraco —
  // acceptance #4). Semana 3 (3d, parcial): tudo pulei.
  const E_INI = isoDaysAgo(23);
  const E_FIM = isoDaysAgo(7);
  const [e] = await db
    .insert(schema.cycle)
    .values({
      patientId,
      startedOn: E_INI,
      closedOn: E_FIM,
      expectedDurationDays: 17,
    })
    .returning({ id: schema.cycle.id });
  cicloSemanasId = e.id;
  await db.insert(schema.cyclePlanVigencia).values({
    cycleId: cicloSemanasId,
    planId,
    validFrom: E_INI,
    validTo: E_FIM,
  });

  for (let n = 23; n >= 17; n--) {
    await insertEvento({
      mealId: meal1Id,
      loggedDate: isoDaysAgo(n),
      state: 'feito',
      chosenMealOptionId: defaultOption1Id,
      hora: '08:00:00',
    });
    await insertEvento({
      mealId: meal2Id,
      loggedDate: isoDaysAgo(n),
      state: 'feito',
      chosenMealOptionId: defaultOption2Id,
      hora: '12:00:00',
    });
  }
  // isoDaysAgo(16)..isoDaysAgo(10): semana 2 — nenhum registro (deliberado).
  for (let n = 9; n >= 7; n--) {
    await insertEvento({
      mealId: meal1Id,
      loggedDate: isoDaysAgo(n),
      state: 'pulei',
      chosenMealOptionId: null,
      hora: '08:00:00',
    });
    await insertEvento({
      mealId: meal2Id,
      loggedDate: isoDaysAgo(n),
      state: 'pulei',
      chosenMealOptionId: null,
      hora: '12:00:00',
    });
  }

  // ── Ciclos I1/I2 (fechados no MESMO dia — desempate, US3) ──────────────
  // I1 abriu há 60d, I2 abriu há 50d; ambos fecharam há 50d (empate de
  // closedOn) — desempate: o de startedOn mais recente (I2) vence (D3).
  const [i1] = await db
    .insert(schema.cycle)
    .values({
      patientId,
      startedOn: isoDaysAgo(60),
      closedOn: isoDaysAgo(50),
      expectedDurationDays: 10,
    })
    .returning({ id: schema.cycle.id });
  cicloAnteriorPerdedorId = i1.id;

  const [i2] = await db
    .insert(schema.cycle)
    .values({
      patientId,
      startedOn: isoDaysAgo(50),
      closedOn: isoDaysAgo(50),
      expectedDurationDays: 1,
    })
    .returning({ id: schema.cycle.id });
  cicloAnteriorVencedorId = i2.id;
  await db.insert(schema.cyclePlanVigencia).values({
    cycleId: cicloAnteriorVencedorId,
    planId,
    validFrom: isoDaysAgo(50),
    validTo: isoDaysAgo(50),
  });
  // I1/I2: zero registros — I2 vencedor serve também de "anterior sem dado".

  // ── Ciclo H (com dados; anterior = I2 via desempate — US3) ─────────────
  const H_INI = isoDaysAgo(45);
  const H_FIM = isoDaysAgo(40);
  const [h] = await db
    .insert(schema.cycle)
    .values({
      patientId,
      startedOn: H_INI,
      closedOn: H_FIM,
      expectedDurationDays: 6,
    })
    .returning({ id: schema.cycle.id });
  cicloDesempateId = h.id;
  await db.insert(schema.cyclePlanVigencia).values({
    cycleId: cicloDesempateId,
    planId,
    validFrom: H_INI,
    validTo: H_FIM,
  });
  await insertEvento({
    mealId: meal1Id,
    loggedDate: isoDaysAgo(43),
    state: 'feito',
    chosenMealOptionId: defaultOption1Id,
    hora: '08:00:00',
  });
  await insertEvento({
    mealId: meal2Id,
    loggedDate: isoDaysAgo(43),
    state: 'feito',
    chosenMealOptionId: defaultOption2Id,
    hora: '12:00:00',
  });
  await insertEvento({
    mealId: meal1Id,
    loggedDate: isoDaysAgo(41),
    state: 'pulei',
    chosenMealOptionId: null,
    hora: '08:00:00',
  });
  await insertEvento({
    mealId: meal2Id,
    loggedDate: isoDaysAgo(41),
    state: 'pulei',
    chosenMealOptionId: null,
    hora: '12:00:00',
  });

  // ── Ciclo B (aberto, parcial — US1) ────────────────────────────────────
  const B_INI = isoDaysAgo(2);
  const [b] = await db
    .insert(schema.cycle)
    .values({
      patientId,
      startedOn: B_INI,
      closedOn: null,
      expectedDurationDays: 21,
    })
    .returning({ id: schema.cycle.id });
  cicloAbertoId = b.id;
  await db.insert(schema.cyclePlanVigencia).values({
    cycleId: cicloAbertoId,
    planId,
    validFrom: B_INI,
    validTo: null,
  });

  await insertEvento({
    mealId: meal1Id,
    loggedDate: isoDaysAgo(2),
    state: 'feito',
    chosenMealOptionId: defaultOption1Id,
    hora: '08:00:00',
  });
  await insertEvento({
    mealId: meal2Id,
    loggedDate: isoDaysAgo(2),
    state: 'feito',
    chosenMealOptionId: defaultOption2Id,
    hora: '12:00:00',
  });
  await insertEvento({
    mealId: meal1Id,
    loggedDate: isoDaysAgo(1),
    state: 'pulei',
    chosenMealOptionId: null,
    hora: '08:00:00',
  });
  // isoDaysAgo(1) meal2 e hoje (m1+m2): sem registro (deliberado — inclui "hoje" na janela aberta).

  // ── Ciclo C (recém-aberto, fechado no mesmo dia, zero registros — US1) ─
  // closedOn = hoje (não null): evita colidir com o índice de 1-ciclo-ativo
  // do Ciclo B, que já está aberto pro mesmo paciente; FR-007 (zero registros
  // → válido, nunca erro) não depende de o ciclo estar aberto ou fechado.
  const [c] = await db
    .insert(schema.cycle)
    .values({
      patientId,
      startedOn: hojeIso(),
      closedOn: hojeIso(),
      expectedDurationDays: 14,
    })
    .returning({ id: schema.cycle.id });
  cicloVazioId = c.id;
  await db.insert(schema.cyclePlanVigencia).values({
    cycleId: cicloVazioId,
    planId,
    validFrom: hojeIso(),
    validTo: hojeIso(),
  });

  // ── Ciclo D (janela > 366 dias — US1 422) ──────────────────────────────
  const [d] = await db
    .insert(schema.cycle)
    .values({
      patientId,
      startedOn: isoDaysAgo(400),
      closedOn: hojeIso(),
      expectedDurationDays: 400,
    })
    .returning({ id: schema.cycle.id });
  cicloJanelaInvalidaId = d.id;

  const moduleRef = await Test.createTestingModule({
    imports: [RelatorioModule],
  }).compile();
  app = moduleRef.createNestApplication();
  await app.init();
});

afterAll(async () => {
  // Ordem reversa de FK (D7): itens → eventos → vigências → ciclos → opções/itens
  // de refeição → refeições → tipo-de-dia → programação → plano → pacientes.
  if (eventIds.length > 0) {
    await db
      .delete(schema.mealEvent)
      .where(inArray(schema.mealEvent.id, eventIds));
  }
  const cycleIds = [
    cicloFechadoId,
    cicloAbertoId,
    cicloVazioId,
    cicloJanelaInvalidaId,
    cicloSemanasId,
    cicloDesempateId,
    cicloAnteriorPerdedorId,
    cicloAnteriorVencedorId,
  ].filter(Boolean);
  if (cycleIds.length > 0) {
    await db
      .delete(schema.cyclePlanVigencia)
      .where(inArray(schema.cyclePlanVigencia.cycleId, cycleIds));
    await db.delete(schema.cycle).where(inArray(schema.cycle.id, cycleIds));
  }
  if (defaultOption1Id) {
    await db
      .delete(schema.mealItem)
      .where(
        inArray(schema.mealItem.mealOptionId, [
          defaultOption1Id,
          defaultOption2Id,
        ]),
      );
    await db
      .delete(schema.mealOption)
      .where(
        inArray(schema.mealOption.id, [defaultOption1Id, defaultOption2Id]),
      );
  }
  if (meal1Id) {
    await db
      .delete(schema.meal)
      .where(inArray(schema.meal.id, [meal1Id, meal2Id]));
  }
  if (dayTypeId) {
    await db
      .delete(schema.daySchedule)
      .where(eq(schema.daySchedule.dayTypeId, dayTypeId));
    await db.delete(schema.dayType).where(eq(schema.dayType.id, dayTypeId));
  }
  if (planId) {
    await db.delete(schema.plan).where(eq(schema.plan.id, planId));
  }
  await db
    .delete(schema.patient)
    .where(inArray(schema.patient.id, [patientId, outroPatientId]));
  await app?.close();
});

// ───────────────────── US1 — o retrato do ciclo ─────────────────────

describe('GET /nutri/patients/:id/cycles/:cycleId/report (US1 — retrato)', () => {
  it('ciclo fechado com registros conhecidos → janela + adesão + padrão de registro corretos', async () => {
    const res = await nutriGet(
      `/nutri/patients/${patientId}/cycles/${cicloFechadoId}/report`,
    ).expect(200);

    expect(res.body.cycle).toEqual({
      id: cicloFechadoId,
      startedOn: isoDaysAgo(6),
      closedOn: isoDaysAgo(3),
      expectedDurationDays: 4,
      aberto: false,
      janelaEfetiva: { from: isoDaysAgo(6), to: isoDaysAgo(3) },
    });

    expect(res.body.registro.totais).toEqual({
      feito: 4,
      troquei: 1,
      pulei: 2,
      semRegistro: 1,
    });
    const porRefeicao = res.body.registro.porRefeicao as {
      position: number;
      nome: string;
      feito: number;
      troquei: number;
      pulei: number;
      semRegistro: number;
    }[];
    expect(porRefeicao).toEqual([
      {
        position: 1,
        nome: 'Café da manhã',
        feito: 2,
        troquei: 1,
        pulei: 1,
        semRegistro: 0,
      },
      {
        position: 2,
        nome: 'Almoço',
        feito: 2,
        troquei: 0,
        pulei: 1,
        semRegistro: 1,
      },
    ]);

    expect(res.body.adesao.diasComDado).toBe(4); // todo dia teve ao menos 1 registro
    expect(typeof res.body.adesao.media === 'number').toBe(true);
  });

  it('SC-002 — mesma janela: adesao.media do relatório == media de GET /adesao (oráculo, sem fórmula própria)', async () => {
    const relatorio = await nutriGet(
      `/nutri/patients/${patientId}/cycles/${cicloFechadoId}/report`,
    ).expect(200);
    const adesao = await nutriGet(`/nutri/patients/${patientId}/adesao`)
      .query({ from: isoDaysAgo(6), to: isoDaysAgo(3) })
      .expect(200);

    expect(relatorio.body.adesao.media).toBe(adesao.body.media);
    expect(relatorio.body.adesao.diasComDado).toBe(
      (adesao.body.days as { status: string }[]).filter(
        (d) => d.status === 'com-dado',
      ).length,
    );
  });

  it('ciclo aberto → parcial (janelaEfetiva.to = hoje), aberto:true', async () => {
    const res = await nutriGet(
      `/nutri/patients/${patientId}/cycles/${cicloAbertoId}/report`,
    ).expect(200);
    expect(res.body.cycle.aberto).toBe(true);
    expect(res.body.cycle.closedOn).toBeNull();
    expect(res.body.cycle.janelaEfetiva).toEqual({
      from: isoDaysAgo(2),
      to: hojeIso(),
    });
    // 3 dias × 2 refeições = 6 slots: feito2 + pulei1 + semRegistro3 (D9)
    expect(res.body.registro.totais).toEqual({
      feito: 2,
      troquei: 0,
      pulei: 1,
      semRegistro: 3,
    });
  });

  it('ciclo recém-aberto sem nenhum registro → 200 válido, adesão sem-dado, zero atividade (FR-007)', async () => {
    const res = await nutriGet(
      `/nutri/patients/${patientId}/cycles/${cicloVazioId}/report`,
    ).expect(200);
    expect(res.body.adesao.media).toBeNull();
    expect(res.body.adesao.diasComDado).toBe(0);
    expect(res.body.registro.totais.feito).toBe(0);
    expect(res.body.registro.totais.troquei).toBe(0);
    expect(res.body.registro.totais.pulei).toBe(0);
    expect(res.body.registro.totais.semRegistro).toBeGreaterThan(0); // esperado − vigente (D9)
  });

  it('403 sem x-nutri-key; 404 ciclo de outro paciente / inexistente', async () => {
    await request(app.getHttpServer())
      .get(`/nutri/patients/${patientId}/cycles/${cicloFechadoId}/report`)
      .expect(403);
    await nutriGet(
      `/nutri/patients/${outroPatientId}/cycles/${cicloFechadoId}/report`,
    ).expect(404);
    await nutriGet(
      `/nutri/patients/${patientId}/cycles/00000000-0000-0000-0000-000000000000/report`,
    ).expect(404);
  });

  it('janela efetiva > 366 dias → 422 orientado (D8)', async () => {
    const res = await nutriGet(
      `/nutri/patients/${patientId}/cycles/${cicloJanelaInvalidaId}/report`,
    ).expect(422);
    expect(typeof res.body.message).toBe('string');
  });

  it('SC-006 — a consulta não escreve nada (contagens idênticas antes/depois)', async () => {
    const antes = await contagensGlobais();
    await nutriGet(
      `/nutri/patients/${patientId}/cycles/${cicloFechadoId}/report`,
    ).expect(200);
    expect(await contagensGlobais()).toEqual(antes);
  });
});

// ───────────────────── US2 — evolução semana a semana ─────────────────────

describe('GET .../report (US2 — semanas, A1 relativa ao início)', () => {
  it('3 semanas com padrões distintos: em ordem, intervalos corretos, última exata', async () => {
    const res = await nutriGet(
      `/nutri/patients/${patientId}/cycles/${cicloSemanasId}/report`,
    ).expect(200);
    const semanas = res.body.semanas as {
      indice: number;
      from: string;
      to: string;
      parcial: boolean;
      adesao: {
        media: number | null;
        diasComDado: number;
        diasSemDado: number;
      };
      registro: {
        feito: number;
        troquei: number;
        pulei: number;
        semRegistro: number;
      };
    }[];
    expect(semanas).toHaveLength(3);
    expect(semanas.map((s) => s.indice)).toEqual([1, 2, 3]);

    // Semana 1: tudo feito, com dado todo dia.
    expect(semanas[0]).toMatchObject({
      from: isoDaysAgo(23),
      to: isoDaysAgo(17),
      parcial: false,
    });
    expect(semanas[0].adesao.diasComDado).toBe(7);
    expect(semanas[0].adesao.diasSemDado).toBe(0);
    expect(semanas[0].registro).toEqual({
      feito: 14,
      troquei: 0,
      pulei: 0,
      semRegistro: 0,
    });

    // Semana 2: buraco total — aparece na série, sem-dado e zerada (acceptance #4).
    expect(semanas[1]).toMatchObject({
      from: isoDaysAgo(16),
      to: isoDaysAgo(10),
      parcial: false,
    });
    expect(semanas[1].adesao.media).toBeNull();
    expect(semanas[1].adesao.diasComDado).toBe(0);
    expect(semanas[1].adesao.diasSemDado).toBe(7);
    expect(semanas[1].registro).toEqual({
      feito: 0,
      troquei: 0,
      pulei: 0,
      semRegistro: 14,
    });

    // Semana 3: última fatia PARCIAL (3 dias) — tudo pulei.
    expect(semanas[2]).toMatchObject({
      from: isoDaysAgo(9),
      to: isoDaysAgo(7),
      parcial: true,
    });
    expect(semanas[2].adesao.diasComDado).toBe(3); // pulei É registro (com-dado)
    expect(semanas[2].registro).toEqual({
      feito: 0,
      troquei: 0,
      pulei: 6,
      semRegistro: 0,
    });
  });

  it('SC-002 por semana: adesao.media da semana 1 == media de GET /adesao na mesma janela', async () => {
    const relatorio = await nutriGet(
      `/nutri/patients/${patientId}/cycles/${cicloSemanasId}/report`,
    ).expect(200);
    const adesao = await nutriGet(`/nutri/patients/${patientId}/adesao`)
      .query({ from: isoDaysAgo(23), to: isoDaysAgo(17) })
      .expect(200);
    expect(relatorio.body.semanas[0].adesao.media).toBe(adesao.body.media);
  });

  it('ciclo aberto (janela de 3 dias, duração prevista 21) → só a semana real, nenhuma semana futura', async () => {
    const res = await nutriGet(
      `/nutri/patients/${patientId}/cycles/${cicloAbertoId}/report`,
    ).expect(200);
    expect(res.body.semanas).toHaveLength(1);
    expect(res.body.semanas[0]).toMatchObject({
      indice: 1,
      from: isoDaysAgo(2),
      to: hojeIso(),
      parcial: true,
    });
  });
});

// ───────────────────── US3 — comparativo com o ciclo anterior ─────────────

describe('GET .../report (US3 — comparativo, A3/D3)', () => {
  it('presente com deltas corretos (atual − anterior); cicloAnterior traz janela + agregados', async () => {
    const atual = await nutriGet(
      `/nutri/patients/${patientId}/cycles/${cicloFechadoId}/report`, // A — anterior = E
    ).expect(200);
    const anteriorSolo = await nutriGet(
      `/nutri/patients/${patientId}/cycles/${cicloSemanasId}/report`, // E direto
    ).expect(200);

    const comp = atual.body.comparativo as {
      cicloAnterior: {
        id: string;
        startedOn: string;
        closedOn: string;
        adesao: { media: number | null };
        registroTotais: {
          feito: number;
          troquei: number;
          pulei: number;
          semRegistro: number;
        };
      };
      deltas: {
        media: number | null;
        coberturaMedia: number | null;
        taxaFeito: number | null;
        taxaTroquei: number | null;
        taxaPulei: number | null;
      };
    };
    expect(comp.cicloAnterior.id).toBe(cicloSemanasId);
    expect(comp.cicloAnterior.startedOn).toBe(isoDaysAgo(23));
    expect(comp.cicloAnterior.closedOn).toBe(isoDaysAgo(7));
    expect(comp.cicloAnterior.adesao.media).toBe(
      anteriorSolo.body.adesao.media,
    );
    expect(comp.cicloAnterior.registroTotais).toEqual({
      feito: 14,
      troquei: 0,
      pulei: 6,
      semRegistro: 14,
    });

    // taxas: atual(A) = {feito4,troquei1,pulei2,semRegistro1}/8 vs anterior(E) totais/34.
    expect(comp.deltas.taxaFeito).toBeCloseTo(4 / 8 - 14 / 34, 6);
    expect(comp.deltas.taxaTroquei).toBeCloseTo(1 / 8 - 0 / 34, 6);
    expect(comp.deltas.taxaPulei).toBeCloseTo(2 / 8 - 6 / 34, 6);
    expect(comp.deltas.media).toBeCloseTo(
      (atual.body.adesao.media as number) -
        (anteriorSolo.body.adesao.media as number),
      6,
    );
  });

  it('primeiro ciclo do paciente (sem candidato anterior) → comparativo ausente, sem erro', async () => {
    const res = await nutriGet(
      // I1 (perdedor do desempate) é o ciclo mais antigo do cenário — nada fechou antes dele.
      `/nutri/patients/${patientId}/cycles/${cicloAnteriorPerdedorId}/report`,
    ).expect(200);
    expect(res.body.comparativo).toBeNull();
  });

  it('desempate (dois anteriores fechados no mesmo dia) → o de startedOn mais recente vence; anterior sem dado → deltas todos null', async () => {
    const res = await nutriGet(
      `/nutri/patients/${patientId}/cycles/${cicloDesempateId}/report`, // H
    ).expect(200);
    const comp = res.body.comparativo as {
      cicloAnterior: { id: string; adesao: { media: number | null } };
      deltas: Record<string, number | null>;
    };
    expect(comp).not.toBeNull();
    expect(comp.cicloAnterior.id).toBe(cicloAnteriorVencedorId); // I2, não I1
    expect(comp.cicloAnterior.adesao.media).toBeNull(); // anterior sem nenhum dia com dado
    expect(comp.deltas).toEqual({
      media: null,
      coberturaMedia: null,
      taxaFeito: null,
      taxaTroquei: null,
      taxaPulei: null,
    });
  });
});

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, gt, inArray, db, schema } from '@bamboo/db';
import { AdesaoModule } from '../src/adesao/adesao.module';
import { CicloModule } from '../src/ciclo/ciclo.module';
import { PlanModule } from '../src/plan/plan.module';

// e2e da Feature 012 (T009/T010/T011) — os DOIS EIXOS a que a suíte é cega.
//
// A suíte existente usa UM plano e UM tipo-de-dia por cenário, então duas
// convenções divergentes dos leitores de `meal_event` são hoje inobserváveis:
//
//   1. ESCOPO DE PLANO — quem filtra por `planId` e quem não filtra (T-A).
//   2. JANELA DO DIA — a imunidade de hoje a um registro de ontem (T-D).
//
// E um terceiro caso, que NÃO é caracterização: o empate de `created_at`, hoje
// resolvido de forma arbitrária (T-C, TDD — tem de FALHAR antes do leitor novo).
//
// Self-contained (lição a2894f3/KI-001): paciente-cenário PRÓPRIO, nunca o do
// seed nem o de outra suíte, com cleanup total no `afterAll` em ordem reversa de
// FK. 10 pontos das suítes existentes fazem `select().from(patient).limit(1)`
// sem `where` nem `order` — um paciente-cenário sobrevivente pode ser sorteado
// por elas. Não chama `pool.end()`: o pool do `@bamboo/db` é singleton e as
// suítes /nutri (adesao/ciclo/relatorio) já não o fecham.
//
// ⚠️ As asserções ÓBVIAS de escopo são CEGAS. `GET /today` sem override filtra
// `inArray(mealEvent.mealId, mealIds)` do plano ativo (`plan.service.ts:143`), e
// como `meal → day_type → plan` uma refeição nunca é compartilhada entre planos:
// o evento do plano aposentado sai pelo filtro de `mealId` MESMO SEM o de
// `planId`. Idem no rebalance (`porMeal.get(m.id)`). Os únicos consumidores onde
// as duas convenções produzem números diferentes são a adesão (plan-scoped e SEM
// filtro de `mealId`) e o caminho por `position` do `/today?dayTypeId=`.

const NUTRI_KEY = 'test-nutri-key';
process.env.NUTRI_API_KEY = NUTRI_KEY;

// Mesma fonte de data do service (`local-date.localToday`) — nunca UTC.
const isoDaysAgo = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
};
const HOJE = isoDaysAgo(0);
const ONTEM = isoDaysAgo(1);
const DIA_SO_P1 = isoDaysAgo(5); // registro só no plano APOSENTADO
const DIA_SO_P2 = isoDaysAgo(4); // registro só no plano VIGENTE (controle)

// Empate de `created_at`: ids explícitos para fixar quem DEVE ganhar sob
// `ORDER BY (logged_date, created_at, id)` — o de maior `id`. Em cada par o
// vencedor esperado é o `bbbb…` (state 'pulei'), e a ORDEM DE INSERÇÃO é
// invertida entre os pares: qualquer ordem que o heap devolva hoje erra ao
// menos um dos dois. Assim o RED é estrutural, não sorte.
const ID_MENOR_1 = 'aaaaaaaa-0000-4000-8000-000000000001';
const ID_MAIOR_1 = 'bbbbbbbb-0000-4000-8000-000000000001';
const ID_MENOR_2 = 'aaaaaaaa-0000-4000-8000-000000000002';
const ID_MAIOR_2 = 'bbbbbbbb-0000-4000-8000-000000000002';

let app: INestApplication;
let patientId: string;

// P1 = plano APOSENTADO (isActive:false); P2 = plano VIGENTE (isActive:true).
let planP1Id: string;
let planP2Id: string;
let dtP1Id: string;
let dtAId: string; // tipo programado em TODO weekday no P2
let dtBId: string; // alvo do override (`?dayTypeId=`)

let mealP1Pos2Id: string; // P1, position 2 — colide com o slot 2 do P2
const mealA = new Map<number, string>(); // position → mealId (tipo A)
const optA = new Map<number, string>(); // position → default optionId (tipo A)

let cycleId: string;

const eventIds: string[] = [];
const optionIds: string[] = [];
const mealIds: string[] = [];
const dayTypeIds: string[] = [];
const planIds: string[] = [];

const nutriGet = (path: string) =>
  request(app.getHttpServer()).get(path).set('x-nutri-key', NUTRI_KEY);

const inserirEvento = async (args: {
  id?: string;
  planId: string;
  mealId: string;
  dayTypeId: string;
  loggedDate: string;
  state: 'feito' | 'troquei' | 'pulei';
  chosenMealOptionId: string | null;
  hora: string;
}) => {
  const [ev] = await db
    .insert(schema.mealEvent)
    .values({
      ...(args.id ? { id: args.id } : {}),
      patientId,
      planId: args.planId,
      mealId: args.mealId,
      dayTypeId: args.dayTypeId,
      chosenMealOptionId: args.chosenMealOptionId,
      state: args.state,
      loggedDate: args.loggedDate,
      createdAt: new Date(`${args.loggedDate}T${args.hora}`),
    })
    .returning({ id: schema.mealEvent.id });
  eventIds.push(ev.id);
  return ev.id;
};

// Cria um tipo-de-dia com uma refeição por position, cada uma com 1 opção
// default de 1 item. Devolve position → {mealId, optionId}.
const criarTipoDia = async (args: {
  planId: string;
  nome: string;
  positions: readonly number[];
  foodId: string;
  gramas: number;
}) => {
  const [dt] = await db
    .insert(schema.dayType)
    .values({ planId: args.planId, name: args.nome })
    .returning({ id: schema.dayType.id });
  dayTypeIds.push(dt.id);

  const meals = await db
    .insert(schema.meal)
    .values(
      args.positions.map((position) => ({
        dayTypeId: dt.id,
        name: `${args.nome} refeição ${position}`,
        position,
      })),
    )
    .returning({ id: schema.meal.id, position: schema.meal.position });
  mealIds.push(...meals.map((m) => m.id));

  const opcoes = await db
    .insert(schema.mealOption)
    .values(
      meals.map((m) => ({ mealId: m.id, label: 'Padrão', isDefault: true })),
    )
    .returning({ id: schema.mealOption.id, mealId: schema.mealOption.mealId });
  optionIds.push(...opcoes.map((o) => o.id));

  await db.insert(schema.mealItem).values(
    opcoes.map((o) => ({
      mealOptionId: o.id,
      foodId: args.foodId,
      quantityGrams: args.gramas,
    })),
  );

  const porPosition = new Map<number, { mealId: string; optionId: string }>();
  for (const m of meals) {
    const o = opcoes.find((x) => x.mealId === m.id);
    if (o) porPosition.set(m.position, { mealId: m.id, optionId: o.id });
  }
  return { dayTypeId: dt.id, porPosition };
};

beforeAll(async () => {
  const [n] = await db
    .select({ id: schema.nutritionist.id })
    .from(schema.nutritionist)
    .limit(1);
  // Alimentos com kcal > 0 (alvo/consumido degenerado zeraria a adesão).
  const [foodA, foodB] = await db
    .select({ id: schema.food.id })
    .from(schema.food)
    .where(gt(schema.food.kcalPer100g, 100))
    .limit(2);

  const [pat] = await db
    .insert(schema.patient)
    .values({ nutritionistId: n.id, name: 'Cenário Escopo (e2e 012)' })
    .returning({ id: schema.patient.id });
  patientId = pat.id;

  // ── P1: plano APOSENTADO, com uma refeição na position 2 ────────────────
  const [p1] = await db
    .insert(schema.plan)
    .values({ patientId, name: 'Plano aposentado (e2e 012)', isActive: false })
    .returning({ id: schema.plan.id });
  planP1Id = p1.id;
  planIds.push(planP1Id);

  const p1Tipo = await criarTipoDia({
    planId: planP1Id,
    nome: 'P1',
    positions: [2],
    foodId: foodA.id,
    gramas: 100,
  });
  dtP1Id = p1Tipo.dayTypeId;
  mealP1Pos2Id = p1Tipo.porPosition.get(2)!.mealId;
  const optP1Pos2Id = p1Tipo.porPosition.get(2)!.optionId;

  // ── P2: plano VIGENTE. Tipo A (programado) 1..5; tipo B (override) 1..3 ──
  const [p2] = await db
    .insert(schema.plan)
    .values({ patientId, name: 'Plano vigente (e2e 012)', isActive: true })
    .returning({ id: schema.plan.id });
  planP2Id = p2.id;
  planIds.push(planP2Id);

  const tipoA = await criarTipoDia({
    planId: planP2Id,
    nome: 'A',
    positions: [1, 2, 3, 4, 5],
    foodId: foodB.id,
    gramas: 100,
  });
  dtAId = tipoA.dayTypeId;
  for (const [position, { mealId, optionId }] of tipoA.porPosition) {
    mealA.set(position, mealId);
    optA.set(position, optionId);
  }

  const tipoB = await criarTipoDia({
    planId: planP2Id,
    nome: 'B',
    positions: [1, 2, 3],
    foodId: foodB.id,
    gramas: 120,
  });
  dtBId = tipoB.dayTypeId;

  // Tipo A programado em TODO weekday — o cenário não depende do calendário
  // (o seed mapeia seg–sex → treino e sáb/dom → descanso; ver KI-004).
  await db.insert(schema.daySchedule).values(
    [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      planId: planP2Id,
      weekday,
      dayTypeId: dtAId,
    })),
  );

  // Ciclo aberto cobrindo toda a janela do cenário (observador da via nutri).
  const [cy] = await db
    .insert(schema.cycle)
    .values({
      patientId,
      startedOn: isoDaysAgo(10),
      closedOn: null,
      expectedDurationDays: 30,
    })
    .returning({ id: schema.cycle.id });
  cycleId = cy.id;
  await db.insert(schema.cyclePlanVigencia).values({
    cycleId,
    planId: planP2Id,
    validFrom: isoDaysAgo(10),
    validTo: null,
  });

  // ── Eventos ─────────────────────────────────────────────────────────────

  // T-A: dia com registro SÓ no plano aposentado (o discriminante da adesão).
  await inserirEvento({
    planId: planP1Id,
    mealId: mealP1Pos2Id,
    dayTypeId: dtP1Id,
    loggedDate: DIA_SO_P1,
    state: 'feito',
    chosenMealOptionId: optP1Pos2Id,
    hora: '12:00:00',
  });
  // T-A: dia de controle — registro no plano vigente.
  await inserirEvento({
    planId: planP2Id,
    mealId: mealA.get(1)!,
    dayTypeId: dtAId,
    loggedDate: DIA_SO_P2,
    state: 'feito',
    chosenMealOptionId: optA.get(1)!,
    hora: '08:00:00',
  });

  // T-D: registro de ONTEM na position 3 — hoje não deve enxergá-lo.
  await inserirEvento({
    planId: planP2Id,
    mealId: mealA.get(3)!,
    dayTypeId: dtAId,
    loggedDate: ONTEM,
    state: 'feito',
    chosenMealOptionId: optA.get(3)!,
    hora: '15:00:00',
  });

  // HOJE, position 1 (plano vigente): controle de todas as asserções de hoje —
  // garante consumo > 0, para o `/today?dayTypeId=` não cair no early-return.
  await inserirEvento({
    planId: planP2Id,
    mealId: mealA.get(1)!,
    dayTypeId: dtAId,
    loggedDate: HOJE,
    state: 'feito',
    chosenMealOptionId: optA.get(1)!,
    hora: '08:00:00',
  });
  // HOJE, position 2, mas no plano APOSENTADO — o discriminante do
  // `/today?dayTypeId=B` (caminho por position) e da via do ciclo.
  await inserirEvento({
    planId: planP1Id,
    mealId: mealP1Pos2Id,
    dayTypeId: dtP1Id,
    loggedDate: HOJE,
    state: 'feito',
    chosenMealOptionId: optP1Pos2Id,
    hora: '12:00:00',
  });

  // T-C par 1 (position 4): menor id inserido PRIMEIRO.
  await inserirEvento({
    id: ID_MENOR_1,
    planId: planP2Id,
    mealId: mealA.get(4)!,
    dayTypeId: dtAId,
    loggedDate: HOJE,
    state: 'feito',
    chosenMealOptionId: optA.get(4)!,
    hora: '19:00:00',
  });
  await inserirEvento({
    id: ID_MAIOR_1,
    planId: planP2Id,
    mealId: mealA.get(4)!,
    dayTypeId: dtAId,
    loggedDate: HOJE,
    state: 'pulei',
    chosenMealOptionId: null,
    hora: '19:00:00',
  });
  // T-C par 2 (position 5): maior id inserido PRIMEIRO (ordem invertida).
  await inserirEvento({
    id: ID_MAIOR_2,
    planId: planP2Id,
    mealId: mealA.get(5)!,
    dayTypeId: dtAId,
    loggedDate: HOJE,
    state: 'pulei',
    chosenMealOptionId: null,
    hora: '21:00:00',
  });
  await inserirEvento({
    id: ID_MENOR_2,
    planId: planP2Id,
    mealId: mealA.get(5)!,
    dayTypeId: dtAId,
    loggedDate: HOJE,
    state: 'feito',
    chosenMealOptionId: optA.get(5)!,
    hora: '21:00:00',
  });

  const moduleRef = await Test.createTestingModule({
    imports: [PlanModule, AdesaoModule, CicloModule],
  }).compile();
  app = moduleRef.createNestApplication();
  await app.init();
});

afterAll(async () => {
  // Ordem reversa de FK. Obrigatório mesmo em falha.
  if (eventIds.length > 0) {
    await db
      .delete(schema.mealEventItem)
      .where(inArray(schema.mealEventItem.mealEventId, eventIds));
    await db
      .delete(schema.mealEvent)
      .where(inArray(schema.mealEvent.id, eventIds));
  }
  if (cycleId) {
    await db
      .delete(schema.cyclePlanVigencia)
      .where(eq(schema.cyclePlanVigencia.cycleId, cycleId));
    await db.delete(schema.cycle).where(eq(schema.cycle.id, cycleId));
  }
  if (optionIds.length > 0) {
    await db
      .delete(schema.mealItem)
      .where(inArray(schema.mealItem.mealOptionId, optionIds));
    await db
      .delete(schema.mealOption)
      .where(inArray(schema.mealOption.id, optionIds));
  }
  if (mealIds.length > 0) {
    await db.delete(schema.meal).where(inArray(schema.meal.id, mealIds));
  }
  if (planIds.length > 0) {
    await db
      .delete(schema.daySchedule)
      .where(inArray(schema.daySchedule.planId, planIds));
  }
  if (dayTypeIds.length > 0) {
    await db
      .delete(schema.dayType)
      .where(inArray(schema.dayType.id, dayTypeIds));
  }
  if (planIds.length > 0) {
    await db.delete(schema.plan).where(inArray(schema.plan.id, planIds));
  }
  if (patientId) {
    await db.delete(schema.patient).where(eq(schema.patient.id, patientId));
  }
  await app?.close();
});

// Refeição do `/today` por position.
type MealDtoLido = {
  position: number;
  registro: { state: string } | null;
};
const porPosition = (body: { meals: MealDtoLido[] }) =>
  new Map(body.meals.map((m) => [m.position, m]));

// ───────── T-A — escopo de plano (CARACTERIZAÇÃO: verde de primeira) ─────────

describe('T-A — escopo de plano: quem filtra por planId e quem não (012/FR-002)', () => {
  it('adesão IGNORA registro de plano aposentado: dia com só ele é sem-dado; o do plano vigente é com-dado', async () => {
    const res = await nutriGet(`/nutri/patients/${patientId}/adesao`)
      .query({ from: DIA_SO_P1, to: DIA_SO_P2 })
      .expect(200);

    const dias = new Map(
      (
        res.body.days as { date: string; status: string; valorPct?: number }[]
      ).map((d) => [d.date, d] as const),
    );

    // Discriminante: a adesão é plan-scoped (plano ATIVO) e NÃO filtra por
    // `mealId` — é o único consumidor onde as duas convenções de escopo produzem
    // números diferentes. Trocar para "qualquer plano" tornaria este dia
    // com-dado.
    expect(dias.get(DIA_SO_P1)).toEqual({
      date: DIA_SO_P1,
      status: 'sem-dado',
    });
    expect(dias.get(DIA_SO_P2)?.status).toBe('com-dado');
    expect(typeof dias.get(DIA_SO_P2)?.valorPct).toBe('number');
  });

  it('a via do ciclo NÃO filtra por plano: o MESMO evento que a adesão ignorou aparece nos registros', async () => {
    const res = await nutriGet(
      `/nutri/patients/${patientId}/cycles/${cycleId}`,
    ).expect(200);

    const registros = res.body.registros as {
      date: string;
      mealId: string;
      position: number;
      state: string;
    }[];

    // As duas convenções, lado a lado, sobre o MESMO evento: plan-scoped na
    // adesão (acima), plan-agnostic aqui. É a divergência que a 012 preserva
    // deliberadamente (D2) — não um bug a consertar nesta feature.
    expect(
      registros.find((r) => r.date === DIA_SO_P1 && r.mealId === mealP1Pos2Id),
    ).toEqual({
      date: DIA_SO_P1,
      mealId: mealP1Pos2Id,
      position: 2,
      state: 'feito',
    });
  });

  it('/today?dayTypeId= pareia por position SÓ o consumo do plano vigente: slot 2 fica sem badge', async () => {
    const res = await request(app.getHttpServer())
      .get(`/patients/${patientId}/today`)
      .query({ dayTypeId: dtBId })
      .expect(200);

    const slots = porPosition(res.body);
    expect(res.body.dayType.id).toBe(dtBId);

    // Controle: o registro de HOJE no plano vigente (position 1) atravessa o
    // override — o badge segue pro slot de mesma posição no novo tipo.
    expect(slots.get(1)?.registro).toEqual({ state: 'feito' });

    // Discriminante: há um evento de HOJE na position 2, mas no plano
    // APOSENTADO. `carregarConsumoDoDia` filtra por `planId`, então ele não
    // entra em `registroPorPosition`. Com escopo "qualquer plano" este slot
    // ganharia badge e sairia das alavancas.
    expect(slots.get(2)?.registro).toBeNull();
  });
});

// ───────── T-D — janela do dia (CARACTERIZAÇÃO: verde de primeira) ─────────

describe('T-D — janela do dia: registro de ontem não influencia hoje (012/FR-002)', () => {
  it('/today sem override: a position registrada ONTEM não tem badge; a de hoje tem', async () => {
    const res = await request(app.getHttpServer())
      .get(`/patients/${patientId}/today`)
      .expect(200);

    const slots = porPosition(res.body);
    expect(res.body.dayType.id).toBe(dtAId);
    expect(slots.get(1)?.registro).toEqual({ state: 'feito' }); // hoje
    expect(slots.get(3)?.registro).toBeNull(); // ontem — invisível hoje
  });

  it('/today?dayTypeId= idem: o consumo do dia é só de hoje (eq(loggedDate, localToday))', async () => {
    const res = await request(app.getHttpServer())
      .get(`/patients/${patientId}/today`)
      .query({ dayTypeId: dtBId })
      .expect(200);

    const slots = porPosition(res.body);
    // O tipo B tem slot na position 3; o registro de ontem não pode aparecer
    // nele. Trava a imunidade ANTES de `from`/`to` serem parametrizados.
    expect(slots.get(3)?.registro).toBeNull();
  });
});

// ───────── T-C — empate de created_at (TDD: deve FALHAR hoje) ─────────

describe('T-C — empate de created_at resolve pelo id (012/FR-004, A3) [RED até o leitor novo]', () => {
  // `ORDER BY (logged_date, created_at, id)` + `seq = índice` ⇒ em empate de
  // `created_at` ganha o de MAIOR id. Hoje `seq = created_at.getTime()` empata e
  // `estadoVigente` mantém o PRIMEIRO da ordem arbitrária do heap — por isso os
  // dois pares têm ordem de inserção invertida: qualquer ordem devolvida hoje
  // erra ao menos um. Que o `state` venha do MESMO evento que os metadados é
  // travado no unit do núcleo (T013), onde a linha vencedora é inspecionável.
  it('/today: nos dois pares (positions 4 e 5) vence o evento de maior id', async () => {
    const res = await request(app.getHttpServer())
      .get(`/patients/${patientId}/today`)
      .expect(200);

    const slots = porPosition(res.body);
    expect(slots.get(4)?.registro).toEqual({ state: 'pulei' }); // ID_MAIOR_1
    expect(slots.get(5)?.registro).toEqual({ state: 'pulei' }); // ID_MAIOR_2
  });

  it('a via do ciclo concorda: mesmo vencedor nos dois pares', async () => {
    const res = await nutriGet(
      `/nutri/patients/${patientId}/cycles/${cycleId}`,
    ).expect(200);

    const registros = res.body.registros as {
      date: string;
      position: number;
      state: string;
    }[];
    const doDia = new Map(
      registros
        .filter((r) => r.date === HOJE)
        .map((r) => [r.position, r.state]),
    );
    expect(doDia.get(4)).toBe('pulei');
    expect(doDia.get(5)).toBe('pulei');
  });
});

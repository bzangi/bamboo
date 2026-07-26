import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  buildScenario,
  everyWeekday,
  localDate,
  type Scenario,
} from '@bamboo/db/testing';
import { AdesaoModule } from '../src/adesao/adesao.module';
import { CicloModule } from '../src/ciclo/ciclo.module';
import { PlanModule } from '../src/plan/plan.module';

// e2e da Feature 012 (T009/T010/T011) — os DOIS EIXOS a que a suíte era cega.
//
// A suíte usava UM plano e UM tipo-de-dia por cenário, então duas convenções
// divergentes dos leitores de `meal_event` eram inobserváveis:
//
//   1. ESCOPO DE PLANO — quem filtra por `planId` e quem não filtra (T-A).
//   2. JANELA DO DIA — a imunidade de hoje a um registro de ontem (T-D).
//
// E um terceiro caso, que NÃO é caracterização: o empate de `created_at`, antes
// resolvido de forma arbitrária (T-C, escrito e visto falhar antes do leitor novo).
//
// ⚠️ As asserções ÓBVIAS de escopo são CEGAS. `GET /today` sem override filtra
// `inArray(mealEvent.mealId, mealIds)` do plano ativo, e como
// `meal → day_type → plan` uma refeição nunca é compartilhada entre planos: o
// evento do plano aposentado sai pelo filtro de `mealId` MESMO SEM o de `planId`.
// Idem no rebalance. Os únicos consumidores onde as duas convenções produzem
// números diferentes são a adesão (plan-scoped e SEM filtro de `mealId`) e o
// caminho por `position` do `/today?dayTypeId=`.
//
// FIXTURE (013): declarado via `buildScenario` — 330 linhas de montagem à mão
// viraram a spec abaixo. O construtor detém a ordem de inserção, a ordem reversa
// de FK do teardown e a resolução determinística de nutricionista/food. Nenhum
// bloco `it` mudou na migração.

const NUTRI_KEY = 'test-nutri-key';
process.env.NUTRI_API_KEY = NUTRI_KEY;

const HOJE = localDate(0);
const ONTEM = localDate(1);
const DIA_SO_P1 = localDate(5); // registro só no plano APOSENTADO
const DIA_SO_P2 = localDate(4); // registro só no plano VIGENTE (controle)

// Empate de `created_at`: ids explícitos fixam quem DEVE ganhar sob
// `ORDER BY (logged_date, created_at, id)` — o de maior `id`. Em cada par o
// vencedor esperado é o `bbbb…` (state 'pulei'), e a ORDEM DE INSERÇÃO é
// invertida entre os pares: quando este teste foi escrito, qualquer ordem que o
// heap devolvesse errava ao menos um dos dois — o RED era estrutural, não sorte.
const ID_MENOR_1 = 'aaaaaaaa-0000-4000-8000-000000000001';
const ID_MAIOR_1 = 'bbbbbbbb-0000-4000-8000-000000000001';
const ID_MENOR_2 = 'aaaaaaaa-0000-4000-8000-000000000002';
const ID_MAIOR_2 = 'bbbbbbbb-0000-4000-8000-000000000002';

// 'R' = tipo-de-dia do plano aposentado; 'A' = programado no plano vigente;
// 'B' = alvo do override. Labels são únicos no cenário INTEIRO — é o que permite
// derivar plano e paciente de um `{dayType, position}`.
type Tipo = 'R' | 'A' | 'B';

let app: INestApplication;
let cenario: Scenario<Tipo>;
let patientId: string;
let cycleId: string;
let dtAId: string;
let dtBId: string;
let mealP1Pos2Id: string; // plano APOSENTADO, position 2 — colide com o slot 2 do vigente

const nutriGet = (path: string) =>
  request(app.getHttpServer()).get(path).set('x-nutri-key', NUTRI_KEY);

beforeAll(async () => {
  const item = (food: string, grams: number) => ({ food, grams });
  const refeicoes = (
    food: string,
    grams: number,
    positions: readonly number[],
  ) =>
    positions.map((position) => ({
      position,
      options: [{ label: 'Padrão', items: [item(food, grams)] }],
    }));

  cenario = await buildScenario<Tipo>({
    label: 'escopo-plano (e2e 012)',
    foods: { a: { minKcalPer100g: 100 }, b: { minKcalPer100g: 100 } },
    patients: [
      {
        name: 'Cenário Escopo (e2e 012)',
        plans: [
          // P1: APOSENTADO. Uma refeição na position 2, que colide com o slot 2
          // do plano vigente — o discriminante do escopo.
          {
            label: 'P1',
            name: 'Plano aposentado (e2e 012)',
            active: false,
            dayTypes: [{ label: 'R', meals: refeicoes('a', 100, [2]) }],
          },
          // P2: VIGENTE. Tipo A (programado) 1..5; tipo B (override) 1..3.
          {
            label: 'P2',
            name: 'Plano vigente (e2e 012)',
            schedule: everyWeekday('A'), // independente do calendário
            dayTypes: [
              { label: 'A', meals: refeicoes('b', 100, [1, 2, 3, 4, 5]) },
              { label: 'B', meals: refeicoes('b', 120, [1, 2, 3]) },
            ],
          },
        ],
        cycles: [
          {
            label: 'aberto',
            startedDaysAgo: 10,
            expectedDurationDays: 30,
            planWindows: [{ plan: 'P2', fromDaysAgo: 10 }],
          },
        ],
      },
    ],
    // A ORDEM importa nos dois últimos pares (empate de `created_at`).
    events: [
      // T-A: dia com registro SÓ no plano aposentado (discriminante da adesão).
      {
        meal: { dayType: 'R', position: 2 },
        state: 'feito',
        daysAgo: 5,
        time: '12:00:00',
      },
      // T-A: dia de controle — registro no plano vigente.
      {
        meal: { dayType: 'A', position: 1 },
        state: 'feito',
        daysAgo: 4,
        time: '08:00:00',
      },
      // T-D: registro de ONTEM na position 3 — hoje não deve enxergá-lo.
      {
        meal: { dayType: 'A', position: 3 },
        state: 'feito',
        daysAgo: 1,
        time: '15:00:00',
      },
      // HOJE, position 1 (plano vigente): controle de todas as asserções de hoje —
      // garante consumo > 0, para o `/today?dayTypeId=` não cair no early-return.
      {
        meal: { dayType: 'A', position: 1 },
        state: 'feito',
        daysAgo: 0,
        time: '08:00:00',
      },
      // HOJE, position 2, mas no plano APOSENTADO — o discriminante do
      // `/today?dayTypeId=B` (caminho por position) e da via do ciclo.
      {
        meal: { dayType: 'R', position: 2 },
        state: 'feito',
        daysAgo: 0,
        time: '12:00:00',
      },
      // T-C par 1 (position 4): menor id inserido PRIMEIRO.
      {
        meal: { dayType: 'A', position: 4 },
        state: 'feito',
        daysAgo: 0,
        time: '19:00:00',
        id: ID_MENOR_1,
      },
      {
        meal: { dayType: 'A', position: 4 },
        state: 'pulei',
        daysAgo: 0,
        time: '19:00:00',
        id: ID_MAIOR_1,
      },
      // T-C par 2 (position 5): maior id inserido PRIMEIRO (ordem invertida).
      {
        meal: { dayType: 'A', position: 5 },
        state: 'pulei',
        daysAgo: 0,
        time: '21:00:00',
        id: ID_MAIOR_2,
      },
      {
        meal: { dayType: 'A', position: 5 },
        state: 'feito',
        daysAgo: 0,
        time: '21:00:00',
        id: ID_MENOR_2,
      },
    ],
  });

  patientId = cenario.ids.patient();
  cycleId = cenario.ids.cycle('aberto');
  dtAId = cenario.ids.dayType('A');
  dtBId = cenario.ids.dayType('B');
  mealP1Pos2Id = cenario.ids.meal({ dayType: 'R', position: 2 }).mealId;

  const moduleRef = await Test.createTestingModule({
    imports: [PlanModule, AdesaoModule, CicloModule],
  }).compile();
  app = moduleRef.createNestApplication();
  await app.init();
});

afterAll(async () => {
  await cenario?.destroy(); // ordem reversa de FK é do construtor (I-9)
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

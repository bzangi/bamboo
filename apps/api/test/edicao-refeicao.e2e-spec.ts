import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, eq, schema } from '@bamboo/db';
import { buildScenario, everyWeekday, type Scenario } from '@bamboo/db/testing';
import { PlanModule } from '../src/plan/plan.module';
import { RebalanceModule } from '../src/rebalance/rebalance.module';

// e2e da Feature 020 — edição de refeição em lote: o overlay `items` no
// POST /rebalance/option-choice (contrato em contracts/option-choice-items.md).
//
// Calibração EXATA por foods reais da TACO (kcal/100g):
//   arroz    'Arroz branco cozido'              128.26
//   batata   'Batata doce cozida'                76.76  (travada, no gatilho)
//   frango   'Frango, peito, sem pele, grelhado' 159.19  (alavanca, pos 2)
//   macarrao 'Macarrão cozido'                  131.00  (alavanca, pos 3)
//
// Dia default: arroz 100 g + batata 100 g + frango 200 g + macarrão 100 g
//   alvo  = 128.26 + 76.76 + 318.38 + 131.00 = 654.40 kcal
//   faixa = ±10% (pinada no paciente)         = [588.96, 719.84]
//   piso  = 50% (pinado no paciente)
const ALVO_KCAL = 654.4;

const HOJE_TIPO = 'A';
type Tipo = typeof HOJE_TIPO;

let app: INestApplication;
let cenario: Scenario<Tipo>;
let patientId: string;
let itemArrozId: string; // pos 1, flexível — o item editado
let itemBatataId: string; // pos 1, travado
let itemFrangoId: string; // pos 2, alavanca
let itemMacarraoId: string; // pos 3, alavanca
let foodArrozId: string;

type OutcomeBody = {
  outcome: {
    kind: string;
    motivo?: string;
    totalDepois?: { kcal?: number };
    refeicoesAfetadas?: {
      position: number;
      itensAjustados: { itemId: string; gramasNovo: number }[];
    }[];
  };
};

const preview = (body: object) =>
  request(app.getHttpServer())
    .post(`/patients/${patientId}/rebalance/option-choice`)
    .send(body);

const corpoBase = () => ({
  triggerMealId: cenario.ids.meal({ dayType: HOJE_TIPO, position: 1 }).mealId,
  chosenOptionId: cenario.ids.meal({ dayType: HOJE_TIPO, position: 1 })
    .defaultOptionId,
});

const contarEventos = async (): Promise<number> => {
  const rows = await db
    .select({ id: schema.mealEvent.id })
    .from(schema.mealEvent)
    .where(eq(schema.mealEvent.patientId, patientId));
  return rows.length;
};

beforeAll(async () => {
  cenario = await buildScenario<Tipo>({
    label: 'edicao-refeicao (e2e 020)',
    foods: {
      arroz: { name: 'Arroz branco cozido' },
      batata: { name: 'Batata doce cozida' },
      frango: { name: 'Frango, peito, sem pele, grelhado' },
      macarrao: { name: 'Macarrão cozido' },
    },
    patients: [
      {
        name: 'Cenário Edição em Lote (e2e 020)',
        exposure: 'full_kcal',
        // Régua pinada: a calibração acima não pode depender do default da
        // nutricionista semeada (lição da 013).
        bandTolerancePct: 10,
        floorPct: 50,
        plans: [
          {
            label: 'P',
            schedule: everyWeekday(HOJE_TIPO),
            dayTypes: [
              {
                label: HOJE_TIPO,
                meals: [
                  {
                    position: 1,
                    options: [
                      {
                        label: 'Única',
                        items: [
                          {
                            food: 'arroz',
                            grams: 100,
                            group: 'Amidos e cereais',
                          },
                          { food: 'batata', grams: 100, locked: true },
                        ],
                      },
                    ],
                  },
                  {
                    position: 2,
                    options: [
                      {
                        label: 'Única',
                        items: [
                          { food: 'frango', grams: 200, group: 'Proteínas' },
                        ],
                      },
                    ],
                  },
                  {
                    position: 3,
                    options: [
                      {
                        label: 'Única',
                        items: [
                          {
                            food: 'macarrao',
                            grams: 100,
                            group: 'Amidos e cereais',
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  });

  patientId = cenario.ids.patient();
  foodArrozId = cenario.ids.food('arroz');

  const moduleRef = await Test.createTestingModule({
    imports: [PlanModule, RebalanceModule],
  }).compile();
  app = moduleRef.createNestApplication();
  await app.init();

  // Ids dos meal_item saem do próprio /today (o handle expõe refeição/opção).
  const res = await request(app.getHttpServer())
    .get(`/patients/${patientId}/today`)
    .expect(200);
  const meals = (
    res.body as {
      meals: {
        position: number;
        options: { items: { id: string; substitutable: boolean }[] }[];
      }[];
    }
  ).meals;
  const itens = (position: number) => {
    const meal = meals.find((m) => m.position === position);
    if (!meal) throw new Error(`refeição ${position} ausente do /today`);
    return meal.options.flatMap((o) => o.items);
  };
  itemArrozId = itens(1).find((i) => i.substitutable)?.id ?? '';
  itemBatataId = itens(1).find((i) => !i.substitutable)?.id ?? '';
  itemFrangoId = itens(2)[0]?.id ?? '';
  itemMacarraoId = itens(3)[0]?.id ?? '';
  if (!itemArrozId || !itemBatataId || !itemFrangoId || !itemMacarraoId) {
    throw new Error('fixture: não achei os meal_item do cenário');
  }
});

afterAll(async () => {
  await cenario?.destroy();
  await app?.close();
});

describe('overlay dentro da faixa (US2/AC1)', () => {
  it('composição idêntica à planejada → sem-acao', async () => {
    const res = await preview({
      ...corpoBase(),
      items: [{ itemId: itemArrozId, foodId: foodArrozId, quantityGrams: 100 }],
    }).expect(200);
    expect((res.body as OutcomeBody).outcome.kind).toBe('sem-acao');
  });
});

describe('overlay que estoura a faixa (US2/AC2, AC6)', () => {
  // arroz 100 g → 250 g: delta = +150 g × 1.2826 = +192.39 kcal (> banda 65.44).
  // Redução proporcional pelas alavancas (frango 318.38 + macarrão 131.00 kcal):
  //   frango  −136.31 kcal → −85.6 g → 114.4 g (piso 100 g respeitado)
  //   macarrão −56.08 kcal → −42.8 g →  57.2 g (piso  50 g respeitado)
  it('rebalanceia as DEMAIS refeições, nunca a editada', async () => {
    const res = await preview({
      ...corpoBase(),
      items: [{ itemId: itemArrozId, foodId: foodArrozId, quantityGrams: 250 }],
    }).expect(200);

    const outcome = (res.body as OutcomeBody).outcome;
    expect(outcome.kind).toBe('rebalanceado');
    const afetadas = outcome.refeicoesAfetadas ?? [];
    expect(afetadas.map((r) => r.position).sort()).toEqual([2, 3]);

    const ajustes = new Map(
      afetadas
        .flatMap((r) => r.itensAjustados)
        .map((i) => [i.itemId, i.gramasNovo]),
    );
    expect(ajustes.get(itemFrangoId)).toBeCloseTo(114.4, 0);
    expect(ajustes.get(itemMacarraoId)).toBeCloseTo(57.2, 0);
    expect(ajustes.has(itemArrozId)).toBe(false);
    expect(ajustes.has(itemBatataId)).toBe(false);

    expect(outcome.totalDepois?.kcal).toBeCloseTo(ALVO_KCAL, 0);
  });

  it('combinação: duas entradas do MESMO item somam (125 + 125 ≡ 250)', async () => {
    const inteiro = await preview({
      ...corpoBase(),
      items: [{ itemId: itemArrozId, foodId: foodArrozId, quantityGrams: 250 }],
    }).expect(200);
    const partido = await preview({
      ...corpoBase(),
      items: [
        { itemId: itemArrozId, foodId: foodArrozId, quantityGrams: 125 },
        { itemId: itemArrozId, foodId: foodArrozId, quantityGrams: 125 },
      ],
    }).expect(200);

    expect(partido.body).toEqual(inteiro.body);
  });

  it('a prévia não persiste nada (FR-008)', async () => {
    const antes = await contarEventos();
    await preview({
      ...corpoBase(),
      items: [{ itemId: itemArrozId, foodId: foodArrozId, quantityGrams: 250 }],
    }).expect(200);
    expect(await contarEventos()).toBe(antes);
  });
});

describe('refeições registradas (US2/AC4, AC5)', () => {
  afterEach(async () => {
    await cenario.clearEvents();
  });

  it('registrada sai das alavancas; consumo real entra no total', async () => {
    await cenario.addEvents([
      { meal: { dayType: HOJE_TIPO, position: 3 }, state: 'feito', daysAgo: 0 },
    ]);
    // delta = +100 g de arroz = +128.26 kcal; única alavanca restante é o
    // frango: −128.26 kcal → −80.6 g → 119.4 g.
    const res = await preview({
      ...corpoBase(),
      items: [{ itemId: itemArrozId, foodId: foodArrozId, quantityGrams: 200 }],
    }).expect(200);

    const outcome = (res.body as OutcomeBody).outcome;
    expect(outcome.kind).toBe('rebalanceado');
    const afetadas = outcome.refeicoesAfetadas ?? [];
    expect(afetadas.map((r) => r.position)).toEqual([2]);
    expect(afetadas[0]?.itensAjustados[0]?.itemId).toBe(itemFrangoId);
    expect(afetadas[0]?.itensAjustados[0]?.gramasNovo).toBeCloseTo(119.4, 0);
  });

  it('pulei contribui 0 ao total: o ajuste compensa só o delta LÍQUIDO', async () => {
    await cenario.addEvents([
      { meal: { dayType: HOJE_TIPO, position: 3 }, state: 'pulei', daysAgo: 0 },
    ]);
    // arroz 240 g: +179.56 kcal; macarrão pulado: −131.00 kcal.
    // delta líquido = 654.40 + 179.56 − 131.00 − 654.40 = +48.56 kcal →
    // frango −30.5 g → 169.5 g. Se o pulei fosse ignorado, o delta seria
    // +179.56 kcal e a única alavanca (frango, cap −159.19 kcal no piso)
    // não bastaria → recusa estoura-piso, não rebalanceado.
    const res = await preview({
      ...corpoBase(),
      items: [{ itemId: itemArrozId, foodId: foodArrozId, quantityGrams: 240 }],
    }).expect(200);

    const outcome = (res.body as OutcomeBody).outcome;
    expect(outcome.kind).toBe('rebalanceado');
    const afetadas = outcome.refeicoesAfetadas ?? [];
    expect(afetadas.map((r) => r.position)).toEqual([2]);
    expect(afetadas[0]?.itensAjustados[0]?.gramasNovo).toBeCloseTo(169.5, 0);
  });

  it('todas as demais registradas → recusa orientada (sem alavanca)', async () => {
    await cenario.addEvents([
      { meal: { dayType: HOJE_TIPO, position: 2 }, state: 'feito', daysAgo: 0 },
      { meal: { dayType: HOJE_TIPO, position: 3 }, state: 'feito', daysAgo: 0 },
    ]);
    const res = await preview({
      ...corpoBase(),
      items: [{ itemId: itemArrozId, foodId: foodArrozId, quantityGrams: 250 }],
    }).expect(200);

    const outcome = (res.body as OutcomeBody).outcome;
    expect(outcome.kind).toBe('recusa-orientada');
    expect(outcome.motivo).toBe('sem-alavanca');
  });
});

describe('validação do overlay (contrato §Validação)', () => {
  it.each([
    ['items vazio', { items: [] }],
    ['items não-array', { items: 'x' }],
    [
      'quantityGrams zero',
      {
        items: [
          {
            itemId: '00000000-0000-4000-8000-000000000000',
            foodId: '00000000-0000-4000-8000-000000000000',
            quantityGrams: 0,
          },
        ],
      },
    ],
    [
      'quantityGrams não numérico',
      {
        items: [
          {
            itemId: '00000000-0000-4000-8000-000000000000',
            foodId: '00000000-0000-4000-8000-000000000000',
            quantityGrams: 'abc',
          },
        ],
      },
    ],
    [
      'itemId não-UUID',
      {
        items: [
          {
            itemId: 'nope',
            foodId: '00000000-0000-4000-8000-000000000000',
            quantityGrams: 100,
          },
        ],
      },
    ],
    [
      'foodId não-UUID',
      {
        items: [
          {
            itemId: '00000000-0000-4000-8000-000000000000',
            foodId: 'nope',
            quantityGrams: 100,
          },
        ],
      },
    ],
  ])('%s → 400', async (_nome, extra) => {
    await preview({ ...corpoBase(), ...extra }).expect(400);
  });

  it('itemId de outra refeição (fora da opção escolhida) → 404', async () => {
    await preview({
      ...corpoBase(),
      items: [
        { itemId: itemFrangoId, foodId: foodArrozId, quantityGrams: 100 },
      ],
    }).expect(404);
  });

  it('foodId inexistente → 404', async () => {
    await preview({
      ...corpoBase(),
      items: [
        {
          itemId: itemArrozId,
          foodId: '00000000-0000-4000-8000-000000000000',
          quantityGrams: 100,
        },
      ],
    }).expect(404);
  });

  it('item travado no overlay → 422', async () => {
    await preview({
      ...corpoBase(),
      items: [
        { itemId: itemBatataId, foodId: foodArrozId, quantityGrams: 100 },
      ],
    }).expect(422);
  });
});

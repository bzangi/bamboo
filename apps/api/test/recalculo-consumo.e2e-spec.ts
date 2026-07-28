import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { db, eq, schema } from '@bamboo/db';
import { buildScenario, everyWeekday, type Scenario } from '@bamboo/db/testing';
import { PlanModule } from '../src/plan/plan.module';
import { RegistroModule } from '../src/registro/registro.module';

// e2e da Feature 022 / US1 — o `/today` recalcula pelo consumo real SEM exigir
// override de tipo-de-dia. Revoga a Q1/FR-013a da 004 (ver
// docs/adr/0004-recalculo-pelo-consumo-sem-override.md).
//
// Todas as requisições aqui são SEM `?dayTypeId` — é exatamente esse o caminho
// que antes nunca ajustava.
//
// Calibração EXATA por foods reais da TACO (kcal/100g), régua pinada no
// paciente (±10% de faixa, piso 50%) para não depender do default da
// nutricionista semeada (lição da 013):
//   arroz    'Arroz branco cozido'               128.26  pos 1, flexível
//   frango   'Frango, peito, sem pele, grelhado' 159.19  pos 2, flexível
//   batata   'Batata doce cozida'                 76.76  pos 2, TRAVADA
//   macarrao 'Macarrão cozido'                   131.00  pos 3, flexível
//   alface   'Alface lisa crua'                   13.82  pos 3, À VONTADE (0 g)
//
//   alvo = 128.26 + (318.38 + 76.76) + (131.00 + 0) = 654.40 kcal
//   faixa ±10% = [588.96, 719.84]
//
// Cenário "pulei na pos 1":
//   totalAtual = 0 + 395.14 + 131.00 = 526.14  → déficit de 128.26 kcal
//   alavancas  = frango (318.38 kcal) + macarrão (131.00 kcal); soma 449.38
//     frango   += 128.26 × (318.38/449.38) / 1.5919 = +57.08 g → 257.08 g
//     macarrão += 128.26 × (131.00/449.38) / 1.3100 = +28.54 g → 128.54 g
//   batata (travada) e alface (à vontade) NÃO entram — nem como peso, nem como
//   destino do ajuste.

const HOJE_TIPO = 'A';
type Tipo = typeof HOJE_TIPO;

const FRANGO_AJUSTADO = 257.08;
const MACARRAO_AJUSTADO = 128.54;

let app: INestApplication;
let cenario: Scenario<Tipo>;
let patientId: string;

type ItemDto = {
  id: string;
  quantityGrams: number;
  substitutable: boolean;
  adLibitum: boolean;
};
type MealDto = {
  id: string;
  position: number;
  defaultOption: { items: ItemDto[] };
  registro: { state: string } | null;
  rebalanceado: boolean;
};
type TodayBody = { dayType: { id: string }; meals: MealDto[] };

const getToday = () =>
  request(app.getHttpServer()).get(`/patients/${patientId}/today`);

const hoje = async (): Promise<TodayBody> => {
  const res = await getToday().expect(200);
  return res.body as TodayBody;
};

const refeicao = (body: TodayBody, position: number): MealDto => {
  const m = body.meals.find((x) => x.position === position);
  if (!m) throw new Error(`refeição ${position} ausente do /today`);
  return m;
};

// Item pela ordem de declaração dentro da opção default.
const item = (body: TodayBody, position: number, indice: number): ItemDto => {
  const itens = refeicao(body, position).defaultOption.items;
  const it = itens[indice];
  if (!it) throw new Error(`item ${indice} ausente da refeição ${position}`);
  return it;
};

const registrar = (mealId: string, intent: 'feito' | 'pulei' | 'desfazer') =>
  request(app.getHttpServer())
    .post(`/patients/${patientId}/registro`)
    .send({ mealId, intent })
    .expect(200);

const mealIdDe = (position: number) =>
  cenario.ids.meal({ dayType: HOJE_TIPO, position }).mealId;

const contarEventos = async (): Promise<number> => {
  const rows = await db
    .select({ id: schema.mealEvent.id })
    .from(schema.mealEvent)
    .where(eq(schema.mealEvent.patientId, patientId));
  return rows.length;
};

beforeAll(async () => {
  cenario = await buildScenario<Tipo>({
    label: 'recalculo-consumo (e2e 022/US1)',
    foods: {
      arroz: { name: 'Arroz branco cozido' },
      frango: { name: 'Frango, peito, sem pele, grelhado' },
      batata: { name: 'Batata doce cozida' },
      macarrao: { name: 'Macarrão cozido' },
      alface: { name: 'Alface lisa crua' },
    },
    patients: [
      {
        name: 'Cenário Recálculo pelo Consumo (e2e 022)',
        exposure: 'full_kcal',
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
                          { food: 'batata', grams: 100, locked: true },
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
                          { food: 'alface', aVontade: true },
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

  const moduleRef = await Test.createTestingModule({
    imports: [PlanModule, RegistroModule],
  }).compile();
  app = moduleRef.createNestApplication();
  await app.init();
});

afterEach(async () => {
  // Cada teste parte de "dia sem registro".
  await cenario?.clearEvents();
});

afterAll(async () => {
  await cenario?.destroy();
  await app?.close();
});

describe('FR-006 — dia sem registro: o plano, sem ajuste', () => {
  it('quantidades planejadas e rebalanceado=false em todas as refeições', async () => {
    const body = await hoje();

    expect(item(body, 1, 0).quantityGrams).toBe(100); // arroz
    expect(item(body, 2, 0).quantityGrams).toBe(200); // frango
    expect(item(body, 2, 1).quantityGrams).toBe(100); // batata (travada)
    expect(item(body, 3, 0).quantityGrams).toBe(100); // macarrão
    for (const m of body.meals) expect(m.rebalanceado).toBe(false);
    for (const m of body.meals) expect(m.registro).toBeNull();
  });
});

describe('FR-001/FR-002 — "pulei" sem override reajusta as não-registradas', () => {
  it('itens flexíveis das seguintes aumentam proporcionalmente à kcal', async () => {
    await registrar(mealIdDe(1), 'pulei');
    const body = await hoje();

    expect(item(body, 2, 0).quantityGrams).toBeCloseTo(FRANGO_AJUSTADO, 1);
    expect(item(body, 3, 0).quantityGrams).toBeCloseTo(MACARRAO_AJUSTADO, 1);
    expect(refeicao(body, 2).rebalanceado).toBe(true);
    expect(refeicao(body, 3).rebalanceado).toBe(true);
  });

  it('item TRAVADO e item À VONTADE ficam intactos', async () => {
    await registrar(mealIdDe(1), 'pulei');
    const body = await hoje();

    expect(item(body, 2, 1).quantityGrams).toBe(100); // batata, travada
    expect(item(body, 2, 1).substitutable).toBe(false);
    expect(item(body, 3, 1).quantityGrams).toBe(0); // alface, à vontade
    expect(item(body, 3, 1).adLibitum).toBe(true);
  });

  it('FR-003 — a refeição registrada mantém o planejado e não é marcada como ajustada', async () => {
    await registrar(mealIdDe(1), 'pulei');
    const body = await hoje();

    expect(item(body, 1, 0).quantityGrams).toBe(100);
    expect(refeicao(body, 1).rebalanceado).toBe(false);
    expect(refeicao(body, 1).registro).toEqual({ state: 'pulei' });
  });

  it('FR-012 — recarregar devolve os mesmos valores (derivado do registro)', async () => {
    await registrar(mealIdDe(1), 'pulei');
    const primeira = await hoje();
    const segunda = await hoje();

    expect(item(segunda, 2, 0).quantityGrams).toBe(
      item(primeira, 2, 0).quantityGrams,
    );
    expect(item(segunda, 3, 0).quantityGrams).toBe(
      item(primeira, 3, 0).quantityGrams,
    );
  });

  it('desfazer o registro devolve o planejado', async () => {
    await registrar(mealIdDe(1), 'pulei');
    await registrar(mealIdDe(1), 'desfazer');
    const body = await hoje();

    expect(item(body, 2, 0).quantityGrams).toBe(200);
    expect(item(body, 3, 0).quantityGrams).toBe(100);
    for (const m of body.meals) expect(m.rebalanceado).toBe(false);
  });
});

describe('FR-012/SC-005 — leitura não grava nada', () => {
  it('contagem de meal_event idêntica antes e depois do GET', async () => {
    await registrar(mealIdDe(1), 'pulei');
    const antes = await contarEventos();

    await hoje();
    await hoje();

    expect(await contarEventos()).toBe(antes);
  });
});

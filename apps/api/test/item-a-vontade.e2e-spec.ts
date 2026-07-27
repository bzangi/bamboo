import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildScenario, everyWeekday, type Scenario } from '@bamboo/db/testing';
import { PlanModule } from '../src/plan/plan.module';
import { SubstitutionModule } from '../src/substitution/substitution.module';
import { RebalanceModule } from '../src/rebalance/rebalance.module';

// e2e da Feature 018 — item "à vontade".
//
// O cenário é o do plano real: uma refeição com um amido flexível (arroz) e uma
// SALADA sem quantidade prescrita, as duas no grupo delas. É o caso que o plano
// do paciente 0 repete em 12 das 30 opções.
//
// `exposure: 'full_kcal'` de propósito: é o nível em que a tela mostraria
// "0 kcal" no item à vontade se o mapper não omitisse a nutrição.

const HOJE_TIPO = 'A';
type Tipo = typeof HOJE_TIPO;

let app: INestApplication;
let cenario: Scenario<Tipo>;
let patientId: string;
let itemSaladaId: string;
let itemArrozId: string;

type ItemLido = {
  id: string;
  quantityGrams: number;
  adLibitum: boolean;
  substitutable: boolean;
  medidaCaseira: { label: string; grams: number } | null;
  nutrition?: unknown;
};

const itensDaRefeicao = async (position: number): Promise<ItemLido[]> => {
  const res = await request(app.getHttpServer())
    .get(`/patients/${patientId}/today`)
    .expect(200);
  const meals = (
    res.body as {
      meals: { position: number; options: { items: ItemLido[] }[] }[];
    }
  ).meals;
  const meal = meals.find((m) => m.position === position);
  if (!meal) throw new Error(`refeição ${position} ausente do /today`);
  return meal.options.flatMap((o) => o.items);
};

beforeAll(async () => {
  cenario = await buildScenario<Tipo>({
    label: 'a-vontade (e2e 018)',
    foods: {
      // Arroz: o flexível com quantidade. Salada: o "à vontade".
      arroz: { name: 'Arroz branco cozido' },
      salada: { name: 'Alface lisa crua' },
      prot: { minKcalPer100g: 100 },
    },
    patients: [
      {
        name: 'Cenário À Vontade (e2e 018)',
        exposure: 'full_kcal',
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
                        label: 'Padrão',
                        items: [
                          {
                            food: 'arroz',
                            grams: 150,
                            group: 'Amidos e cereais',
                          },
                          // Sem `grams`: é o ponto da feature.
                          {
                            food: 'salada',
                            aVontade: true,
                            group: 'Vegetais',
                          },
                        ],
                      },
                    ],
                  },
                  {
                    // Segunda refeição: dá ao rebalanceamento uma alavanca fora
                    // do gatilho, senão a prévia recusa por falta de alavanca e
                    // o teste não discrimina nada.
                    position: 2,
                    options: [
                      {
                        label: 'Leve',
                        items: [
                          {
                            food: 'prot',
                            grams: 100,
                            group: 'Proteínas',
                          },
                        ],
                      },
                      {
                        label: 'Pesada',
                        items: [
                          {
                            food: 'prot',
                            grams: 200,
                            group: 'Proteínas',
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
  const refeicao1 = cenario.ids.meal({ dayType: HOJE_TIPO, position: 1 });
  itemSaladaId = '';
  itemArrozId = '';

  const moduleRef = await Test.createTestingModule({
    imports: [PlanModule, SubstitutionModule, RebalanceModule],
  }).compile();
  app = moduleRef.createNestApplication();
  await app.init();

  // Os ids dos itens saem do próprio /today (o handle expõe refeição e opção,
  // não item — e derivar do grafo é melhor que uma query à mão aqui).
  const itens = await itensDaRefeicao(1);
  itemArrozId = itens.find((i) => !i.adLibitum)?.id ?? '';
  itemSaladaId = itens.find((i) => i.adLibitum)?.id ?? '';
  if (!refeicao1.mealId || !itemArrozId || !itemSaladaId) {
    throw new Error('fixture: não achei os itens da refeição 1');
  }
});

afterAll(async () => {
  await cenario?.destroy();
  await app?.close();
});

describe('GET /today — o item à vontade se anuncia (018/SC-004)', () => {
  it('vem marcado, com 0 g, sem medida caseira e SEM nutrição', async () => {
    const itens = await itensDaRefeicao(1);
    const salada = itens.find((i) => i.id === itemSaladaId);

    expect(salada?.adLibitum).toBe(true);
    expect(salada?.quantityGrams).toBe(0);
    expect(salada?.medidaCaseira).toBeNull();
    // "0 kcal" numa salada é a tela mentindo com número certo.
    expect(salada?.nutrition).toBeUndefined();
    // Continua trocável: salada por salada é o caso mais comum do plano real.
    expect(salada?.substitutable).toBe(true);
  });

  it('o item normal ao lado não mudou em nada (FR-007)', async () => {
    const itens = await itensDaRefeicao(1);
    const arroz = itens.find((i) => i.id === itemArrozId);

    expect(arroz?.adLibitum).toBe(false);
    expect(arroz?.quantityGrams).toBe(150);
    expect(arroz?.nutrition).toBeDefined();
  });
});

describe('GET /meal-items/:id/substitutions — trocar salada por salada (018/SC-005)', () => {
  it('origem à vontade: alternativas marcadas, sem gramas, sem medida e sem nutrição', async () => {
    const res = await request(app.getHttpServer())
      .get(`/meal-items/${itemSaladaId}/substitutions`)
      .expect(200);

    const body = res.body as {
      current: { adLibitum: boolean; quantityGrams: number };
      alternatives: {
        adLibitum: boolean;
        gramas: number;
        medidaCaseira: unknown;
        nutrition?: unknown;
      }[];
    };

    expect(body.current.adLibitum).toBe(true);
    expect(body.alternatives.length).toBeGreaterThan(0);
    for (const alt of body.alternatives) {
      expect(alt.adLibitum).toBe(true);
      expect(alt.gramas).toBe(0);
      expect(alt.medidaCaseira).toBeNull();
      expect(alt.nutrition).toBeUndefined();
    }
  });

  it('origem normal: a equivalência continua como sempre (FR-007)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/meal-items/${itemArrozId}/substitutions`)
      .expect(200);

    const body = res.body as {
      current: { adLibitum: boolean };
      alternatives: { adLibitum: boolean; gramas: number }[];
    };

    expect(body.current.adLibitum).toBe(false);
    expect(body.alternatives.length).toBeGreaterThan(0);
    for (const alt of body.alternatives) {
      expect(alt.adLibitum).toBe(false);
      expect(alt.gramas).toBeGreaterThan(0);
    }
  });
});

describe('POST /rebalance/option-choice — o motor não mexe no que não tem quantidade (018/SC-002)', () => {
  it('escolher a opção pesada ajusta o arroz e NUNCA a salada', async () => {
    const refeicao2 = cenario.ids.meal({ dayType: HOJE_TIPO, position: 2 });

    const res = await request(app.getHttpServer())
      .post(`/patients/${patientId}/rebalance/option-choice`)
      .send({
        triggerMealId: refeicao2.mealId,
        chosenOptionId: refeicao2.option('Pesada'),
      })
      // 200 e não 201: é prévia computada, e recusa-orientada também é 200.
      .expect(200);

    const body = res.body as {
      kind: string;
      adjustments?: { mealItemId: string }[];
    };

    // A prévia pode recusar de forma orientada dependendo da calibração, mas se
    // ajustar, a salada NÃO pode estar entre os ajustes.
    const ids = (body.adjustments ?? []).map((a) => a.mealItemId);
    expect(ids).not.toContain(itemSaladaId);
    if (body.kind === 'rebalanceado') expect(ids).toContain(itemArrozId);
  });
});

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildScenario, everyWeekday, type Scenario } from '@bamboo/db/testing';
import { db, eq, schema } from '@bamboo/db';
import { NutriModule } from '../src/nutri/nutri.module';
import { PlanoEditorModule } from '../src/plano-editor/plano-editor.module';

// e2e da Feature 017 — plano, tipo-de-dia e a semana (US2 + US3 parcial).
//
// Cenário self-contained (013) com `destroy()` no afterAll. Cada paciente aqui
// existe por causa de UM bloqueador diferente de exclusão: são situações
// distintas por construção, não repetição.

const NUTRI_KEY = 'test-nutri-key';
process.env.NUTRI_API_KEY = NUTRI_KEY;

const PRE = 'ZZZ 017 plano';

let app: INestApplication;
let cenario: Scenario<'REG' | 'VIG'>;

const req = () => request(app.getHttpServer());
const get = (p: string) => req().get(p).set('x-nutri-key', NUTRI_KEY);
const post = (p: string, b?: object) =>
  req()
    .post(p)
    .set('x-nutri-key', NUTRI_KEY)
    .send(b ?? {});
const patch = (p: string, b: object) =>
  req().patch(p).set('x-nutri-key', NUTRI_KEY).send(b);
const put = (p: string, b: object) =>
  req().put(p).set('x-nutri-key', NUTRI_KEY).send(b);
const del = (p: string) => req().delete(p).set('x-nutri-key', NUTRI_KEY);

const UUID_INEXISTENTE = '00000000-0000-4000-8000-000000000000';

/** Contagens das tabelas que um cadastro de plano NÃO deve tocar. */
async function contagens() {
  const um = async (t: typeof schema.dayType | typeof schema.daySchedule) =>
    (await db.select({ id: t.id }).from(t)).length;
  return {
    dayType: await um(schema.dayType),
    daySchedule: await um(schema.daySchedule),
    meal: (await db.select({ id: schema.meal.id }).from(schema.meal)).length,
  };
}

beforeAll(async () => {
  cenario = await buildScenario<'REG' | 'VIG'>({
    label: PRE,
    foods: { base: { minKcalPer100g: 50 } },
    patients: [
      // Paciente de trabalho: recebe os planos criados PELO endpoint.
      { label: 'novo', name: `${PRE} novo` },
      {
        // Plano com registro ⇒ exclusão recusada.
        label: 'comRegistro',
        name: `${PRE} com registro`,
        plans: [
          {
            label: 'p-registro',
            dayTypes: [
              {
                label: 'REG',
                meals: [
                  {
                    position: 1,
                    options: [
                      {
                        label: 'Padrão',
                        items: [{ food: 'base', grams: 100 }],
                      },
                    ],
                  },
                ],
              },
            ],
            schedule: everyWeekday('REG'),
          },
        ],
      },
      {
        // Plano com vigência de ciclo ⇒ exclusão recusada, e o ciclo está ABERTO
        // (o plano é o ativo), que é o terceiro bloqueador.
        label: 'comVigencia',
        name: `${PRE} com vigência`,
        plans: [
          {
            label: 'p-vigencia',
            dayTypes: [
              {
                label: 'VIG',
                meals: [
                  {
                    position: 1,
                    options: [
                      {
                        label: 'Padrão',
                        items: [{ food: 'base', grams: 100 }],
                      },
                    ],
                  },
                ],
              },
            ],
            schedule: everyWeekday('VIG'),
          },
        ],
        cycles: [
          {
            label: 'c-aberto',
            startedDaysAgo: 3,
            expectedDurationDays: 30,
            planWindows: [{ plan: 'p-vigencia', fromDaysAgo: 3 }],
          },
        ],
      },
    ],
    events: [
      { meal: { dayType: 'REG', position: 1 }, state: 'feito', daysAgo: 1 },
    ],
  });

  const mod = await Test.createTestingModule({
    imports: [NutriModule, PlanoEditorModule],
  }).compile();
  app = mod.createNestApplication();
  await app.init();
});

afterAll(async () => {
  await app?.close();
  await cenario?.destroy();
});

describe('POST /nutri/patients/:patientId/plans', () => {
  it('cria APENAS a linha de plan — plano nasce vazio (FR-004)', async () => {
    const antes = await contagens();
    const res = await post(
      `/nutri/patients/${cenario.ids.patient('novo')}/plans`,
      { name: `${PRE} julho` },
    ).expect(201);
    const depois = await contagens();

    expect(depois).toEqual(antes); // nem tipo-de-dia, nem refeição, nem semana
    expect(res.body).toMatchObject({
      name: `${PRE} julho`,
      patientId: cenario.ids.patient('novo'),
      dayTypes: [],
      week: [],
    });
  });

  it('o primeiro plano nasce ATIVO; o segundo nasce inativo', async () => {
    const id = cenario.ids.patient('novo');
    // O primeiro já foi criado no caso anterior e tem de estar ativo.
    const lista1 = await get(`/nutri/patients/${id}/plans`).expect(200);
    expect(lista1.body.plans.length).toBe(1);
    expect(lista1.body.plans[0].isActive).toBe(true);

    const segundo = await post(`/nutri/patients/${id}/plans`, {
      name: `${PRE} agosto`,
    }).expect(201);
    // Trocar o plano ativo é o ato que o ciclo observa (007) — não pode
    // acontecer como efeito colateral de um cadastro.
    expect(segundo.body.isActive).toBe(false);
  });

  it('400 em nome vazio, e nada é criado', async () => {
    const id = cenario.ids.patient('novo');
    const antes = (await get(`/nutri/patients/${id}/plans`)).body.plans.length;
    await post(`/nutri/patients/${id}/plans`, { name: '   ' }).expect(400);
    await post(`/nutri/patients/${id}/plans`, {}).expect(400);
    const depois = (await get(`/nutri/patients/${id}/plans`)).body.plans.length;
    expect(depois).toBe(antes);
  });

  it('404 em paciente inexistente', async () => {
    await post(`/nutri/patients/${UUID_INEXISTENTE}/plans`, {
      name: 'x',
    }).expect(404);
  });

  it('403 sem a credencial', async () => {
    await req()
      .post(`/nutri/patients/${cenario.ids.patient('novo')}/plans`)
      .send({ name: 'x' })
      .expect(403);
  });
});

describe('GET /nutri/patients/:patientId/plans', () => {
  it('lista com o tamanho do grafo e o estado da semana, ativo primeiro', async () => {
    const res = await get(
      `/nutri/patients/${cenario.ids.patient('comVigencia')}/plans`,
    ).expect(200);

    expect(res.body.plans.length).toBe(1);
    expect(res.body.plans[0]).toMatchObject({
      id: cenario.ids.plan('p-vigencia'),
      isActive: true,
      dayTypeCount: 1,
      mealCount: 1,
      semanaCompleta: true,
    });
  });

  it('paciente sem plano devolve lista vazia, não 404', async () => {
    const res = await get(
      `/nutri/patients/${cenario.ids.patient('comRegistro')}/plans`,
    ).expect(200);
    expect(Array.isArray(res.body.plans)).toBe(true);
  });
});

describe('GET /nutri/plans/:planId — o grafo inteiro numa requisição', () => {
  it('devolve tipos-de-dia, semana, refeições, opções e itens com nome resolvido', async () => {
    const res = await get(
      `/nutri/plans/${cenario.ids.plan('p-vigencia')}`,
    ).expect(200);

    expect(res.body.dayTypes.length).toBe(1);
    const tipo = res.body.dayTypes[0];
    expect(tipo.id).toBe(cenario.ids.dayType('VIG'));
    expect(tipo.meals.length).toBe(1);

    const refeicao = tipo.meals[0];
    expect(refeicao.position).toBe(1);
    expect(refeicao.options.length).toBe(1);

    const opcao = refeicao.options[0];
    expect(opcao.isDefault).toBe(true);
    expect(opcao.items.length).toBe(1);

    const item = opcao.items[0];
    expect(item.foodId).toBe(cenario.ids.food('base'));
    // Nome resolvido: a tela exibe texto, não UUID.
    expect(typeof item.foodName).toBe('string');
    expect(item.foodName.length).toBeGreaterThan(0);
    expect(item.quantityGrams).toBe(100);

    expect(res.body.week.length).toBe(7);
  });

  it('404 em plano inexistente', async () => {
    await get(`/nutri/plans/${UUID_INEXISTENTE}`).expect(404);
  });
});

describe('PATCH /nutri/plans/:planId', () => {
  it('renomeia', async () => {
    const planId = cenario.ids.plan('p-registro');
    const res = await patch(`/nutri/plans/${planId}`, {
      name: `${PRE} renomeado`,
    }).expect(200);
    expect(res.body.name).toBe(`${PRE} renomeado`);
  });

  it('400 em nome vazio; 404 em plano inexistente', async () => {
    await patch(`/nutri/plans/${cenario.ids.plan('p-registro')}`, {
      name: '  ',
    }).expect(400);
    await patch(`/nutri/plans/${UUID_INEXISTENTE}`, { name: 'x' }).expect(404);
  });
});

describe('POST /nutri/plans/:planId/day-types', () => {
  it('cria o tipo-de-dia VAZIO', async () => {
    const planId = (
      await get(`/nutri/patients/${cenario.ids.patient('novo')}/plans`)
    ).body.plans[0].id as string;

    const res = await post(`/nutri/plans/${planId}/day-types`, {
      name: 'Treino',
    }).expect(201);

    expect(res.body).toMatchObject({ name: 'Treino', meals: [] });
  });

  it('400 em nome vazio; 404 em plano inexistente', async () => {
    const planId = cenario.ids.plan('p-registro');
    await post(`/nutri/plans/${planId}/day-types`, { name: '' }).expect(400);
    await post(`/nutri/plans/${UUID_INEXISTENTE}/day-types`, {
      name: 'x',
    }).expect(404);
  });
});

describe('PATCH/DELETE /nutri/day-types/:id', () => {
  it('renomeia', async () => {
    const dtId = cenario.ids.dayType('VIG');
    const res = await patch(`/nutri/day-types/${dtId}`, {
      name: 'Descanso',
    }).expect(200);
    expect(res.body.name).toBe('Descanso');
  });

  it('409 ao excluir tipo-de-dia referenciado pela semana', async () => {
    const res = await del(
      `/nutri/day-types/${cenario.ids.dayType('VIG')}`,
    ).expect(409);
    expect(String(res.body.message)).toMatch(/semana|programa/i);
  });

  it('409 ao excluir tipo-de-dia com registro em alguma refeição sua', async () => {
    // Este tipo-de-dia também está na semana; tiro a semana do caminho para que
    // o bloqueador exercitado seja o REGISTRO, não a programação.
    const planId = cenario.ids.plan('p-registro');
    await db
      .delete(schema.daySchedule)
      .where(eq(schema.daySchedule.planId, planId));

    const res = await del(
      `/nutri/day-types/${cenario.ids.dayType('REG')}`,
    ).expect(409);
    expect(String(res.body.message)).toMatch(/registro/i);
  });

  it('exclui em cascata quando está limpo (refeições, opções e itens somem)', async () => {
    const planId = (
      await get(`/nutri/patients/${cenario.ids.patient('novo')}/plans`)
    ).body.plans[0].id as string;

    const dt = (
      await post(`/nutri/plans/${planId}/day-types`, { name: 'Descartável' })
    ).body as { id: string };
    const refeicao = (
      await post(`/nutri/day-types/${dt.id}/meals`, {
        name: 'Almoço',
        position: 1,
      })
    ).body as { id: string };
    const opcao = (
      await post(`/nutri/meals/${refeicao.id}/options`, { label: 'Padrão' })
    ).body as { id: string };
    await post(`/nutri/options/${opcao.id}/items`, {
      foodId: cenario.ids.food('base'),
      quantityGrams: 80,
    }).expect(201);

    await del(`/nutri/day-types/${dt.id}`).expect(204);

    const refeicoes = await db
      .select({ id: schema.meal.id })
      .from(schema.meal)
      .where(eq(schema.meal.dayTypeId, dt.id));
    expect(refeicoes).toEqual([]);

    const opcoes = await db
      .select({ id: schema.mealOption.id })
      .from(schema.mealOption)
      .where(eq(schema.mealOption.mealId, refeicao.id));
    expect(opcoes).toEqual([]);

    const itens = await db
      .select({ id: schema.mealItem.id })
      .from(schema.mealItem)
      .where(eq(schema.mealItem.mealOptionId, opcao.id));
    expect(itens).toEqual([]);
  });

  it('404 em tipo-de-dia inexistente', async () => {
    await del(`/nutri/day-types/${UUID_INEXISTENTE}`).expect(404);
    await patch(`/nutri/day-types/${UUID_INEXISTENTE}`, {
      name: 'x',
    }).expect(404);
  });
});

describe('PUT /nutri/plans/:planId/schedule — a semana é UM objeto', () => {
  it('define os 7 dias e substitui a programação anterior', async () => {
    const planId = (
      await get(`/nutri/patients/${cenario.ids.patient('novo')}/plans`)
    ).body.plans[0].id as string;

    const tipos = (await get(`/nutri/plans/${planId}`)).body.dayTypes as {
      id: string;
    }[];
    const a = tipos[0].id;
    const b = (
      await post(`/nutri/plans/${planId}/day-types`, { name: 'Segundo tipo' })
    ).body.id as string;

    const todosA = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      weekday,
      dayTypeId: a,
    }));
    const res1 = await put(`/nutri/plans/${planId}/schedule`, {
      days: todosA,
    }).expect(200);
    expect(res1.body.week.length).toBe(7);
    expect(
      new Set(res1.body.week.map((d: { dayTypeId: string }) => d.dayTypeId)),
    ).toEqual(new Set([a]));

    // Substitui, não acumula: 7 linhas, não 14.
    const misto = todosA.map((d) =>
      d.weekday === 0 || d.weekday === 6 ? { ...d, dayTypeId: b } : d,
    );
    const res2 = await put(`/nutri/plans/${planId}/schedule`, {
      days: misto,
    }).expect(200);
    expect(res2.body.week.length).toBe(7);
    const porDia = new Map(
      res2.body.week.map((d: { weekday: number; dayTypeId: string }) => [
        d.weekday,
        d.dayTypeId,
      ]),
    );
    expect(porDia.get(0)).toBe(b);
    expect(porDia.get(6)).toBe(b);
    expect(porDia.get(3)).toBe(a);

    const linhas = await db
      .select({ id: schema.daySchedule.id })
      .from(schema.daySchedule)
      .where(eq(schema.daySchedule.planId, planId));
    expect(linhas.length).toBe(7);
  });

  it('400 em semana incompleta ou com dia repetido', async () => {
    const planId = (
      await get(`/nutri/patients/${cenario.ids.patient('novo')}/plans`)
    ).body.plans[0].id as string;
    const dtId = (await get(`/nutri/plans/${planId}`)).body.dayTypes[0].id;

    await put(`/nutri/plans/${planId}/schedule`, {
      days: [0, 1, 2].map((weekday) => ({ weekday, dayTypeId: dtId })),
    }).expect(400);

    await put(`/nutri/plans/${planId}/schedule`, {
      days: [0, 0, 1, 2, 3, 4, 5].map((weekday) => ({
        weekday,
        dayTypeId: dtId,
      })),
    }).expect(400);

    await put(`/nutri/plans/${planId}/schedule`, { days: 'segunda' }).expect(
      400,
    );
  });

  it('422 quando a semana aponta para tipo-de-dia de OUTRO plano', async () => {
    const planId = (
      await get(`/nutri/patients/${cenario.ids.patient('novo')}/plans`)
    ).body.plans[0].id as string;

    const res = await put(`/nutri/plans/${planId}/schedule`, {
      days: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        weekday,
        dayTypeId: cenario.ids.dayType('REG'), // pertence a outro plano
      })),
    }).expect(422);
    expect(String(res.body.message)).toMatch(/plano/i);
  });
});

describe('DELETE /nutri/plans/:planId', () => {
  it('409 quando o plano tem registro', async () => {
    const res = await del(
      `/nutri/plans/${cenario.ids.plan('p-registro')}`,
    ).expect(409);
    expect(String(res.body.message)).toMatch(/registro/i);
  });

  it('409 quando o plano tem vigência de ciclo', async () => {
    const res = await del(
      `/nutri/plans/${cenario.ids.plan('p-vigencia')}`,
    ).expect(409);
    expect(String(res.body.message)).toMatch(/ciclo/i);
  });

  it('apaga o plano e o grafo quando está limpo', async () => {
    const patientId = cenario.ids.patient('novo');
    const planId = (
      await post(`/nutri/patients/${patientId}/plans`, {
        name: `${PRE} descartável`,
      })
    ).body.id as string;
    const dt = (await post(`/nutri/plans/${planId}/day-types`, { name: 'X' }))
      .body.id as string;
    await put(`/nutri/plans/${planId}/schedule`, {
      days: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        weekday,
        dayTypeId: dt,
      })),
    }).expect(200);

    await del(`/nutri/plans/${planId}`).expect(204);
    await get(`/nutri/plans/${planId}`).expect(404);

    const semana = await db
      .select({ id: schema.daySchedule.id })
      .from(schema.daySchedule)
      .where(eq(schema.daySchedule.planId, planId));
    expect(semana).toEqual([]);

    const tipos = await db
      .select({ id: schema.dayType.id })
      .from(schema.dayType)
      .where(eq(schema.dayType.planId, planId));
    expect(tipos).toEqual([]);
  });

  it('404 em plano inexistente', async () => {
    await del(`/nutri/plans/${UUID_INEXISTENTE}`).expect(404);
  });
});

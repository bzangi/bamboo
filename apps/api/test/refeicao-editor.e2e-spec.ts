import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildScenario, type Scenario } from '@bamboo/db/testing';
import { and, asc, db, eq, inArray, notInArray, schema } from '@bamboo/db';
import { NutriModule } from '../src/nutri/nutri.module';
import { PlanoEditorModule } from '../src/plano-editor/plano-editor.module';

// e2e da Feature 017 — refeição → opção → item (US3).
//
// As duas invariantes que este arquivo existe para travar:
//  · `(day_type, position)` único — position é a chave que pareia refeições entre
//    tipos-de-dia (009/012); duplicá-la corrompe a troca de tipo-de-dia;
//  · exatamente UMA opção padrão por refeição.
//
// O par alimento↔grupo é RESOLVIDO do banco (não criado): grupos e vínculos têm
// semântica de upsert-com-história da ingestão TACO / classificação (I-7 da 013).

const NUTRI_KEY = 'test-nutri-key';
process.env.NUTRI_API_KEY = NUTRI_KEY;

const PRE = 'ZZZ 017 refeicao';

let app: INestApplication;
let cenario: Scenario<'EDIT' | 'COMREG'>;
let planId: string;
let dayTypeId: string;
/** Um grupo real + um alimento que participa dele + um que não participa. */
let grupoId: string;
let foodNoGrupo: string;
let foodForaDoGrupo: string;

const req = () => request(app.getHttpServer());
const get = (p: string) => req().get(p).set('x-nutri-key', NUTRI_KEY);
const post = (p: string, b?: object) =>
  req()
    .post(p)
    .set('x-nutri-key', NUTRI_KEY)
    .send(b ?? {});
const patch = (p: string, b: object) =>
  req().patch(p).set('x-nutri-key', NUTRI_KEY).send(b);
const del = (p: string) => req().delete(p).set('x-nutri-key', NUTRI_KEY);

const UUID_INEXISTENTE = '00000000-0000-4000-8000-000000000000';

/** Cria uma refeição limpa com uma opção, para os casos que precisam de um alvo. */
async function refeicaoComOpcao(position: number): Promise<{
  mealId: string;
  optionId: string;
}> {
  const meal = (
    await post(`/nutri/day-types/${dayTypeId}/meals`, {
      name: `Refeição ${position}`,
      position,
    }).expect(201)
  ).body as { id: string };
  const opcao = (
    await post(`/nutri/meals/${meal.id}/options`, { label: 'Padrão' }).expect(
      201,
    )
  ).body as { id: string };
  return { mealId: meal.id, optionId: opcao.id };
}

beforeAll(async () => {
  cenario = await buildScenario<'EDIT' | 'COMREG'>({
    label: PRE,
    foods: { base: { minKcalPer100g: 50 } },
    patients: [
      {
        label: 'edit',
        name: `${PRE} edit`,
        plans: [{ label: 'p-edit', dayTypes: [{ label: 'EDIT', meals: [] }] }],
      },
      {
        label: 'comRegistro',
        name: `${PRE} com registro`,
        plans: [
          {
            label: 'p-comreg',
            dayTypes: [
              {
                label: 'COMREG',
                meals: [
                  {
                    position: 1,
                    options: [
                      {
                        label: 'Padrão',
                        items: [{ food: 'base', grams: 100 }],
                      },
                      { label: 'Alternativa', items: [] },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    events: [
      { meal: { dayType: 'COMREG', position: 1 }, state: 'feito', daysAgo: 1 },
    ],
  });

  planId = cenario.ids.plan('p-edit');
  dayTypeId = cenario.ids.dayType('EDIT');

  // Um vínculo alimento↔grupo REAL, resolvido com ORDER BY explícito (I-2).
  const [vinculo] = await db
    .select({
      groupId: schema.foodSubstitutionGroup.groupId,
      foodId: schema.foodSubstitutionGroup.foodId,
    })
    .from(schema.foodSubstitutionGroup)
    .orderBy(
      asc(schema.foodSubstitutionGroup.groupId),
      asc(schema.foodSubstitutionGroup.foodId),
    )
    .limit(1);
  if (!vinculo) {
    throw new Error(
      'nenhum vínculo alimento↔grupo no banco: rode o seed e o classify-foods',
    );
  }
  grupoId = vinculo.groupId;
  foodNoGrupo = vinculo.foodId;

  const doGrupo = await db
    .select({ foodId: schema.foodSubstitutionGroup.foodId })
    .from(schema.foodSubstitutionGroup)
    .where(eq(schema.foodSubstitutionGroup.groupId, grupoId));
  const [fora] = await db
    .select({ id: schema.food.id })
    .from(schema.food)
    .where(
      notInArray(
        schema.food.id,
        doGrupo.map((d) => d.foodId),
      ),
    )
    .orderBy(asc(schema.food.name), asc(schema.food.id))
    .limit(1);
  if (!fora) throw new Error('todo alimento do banco está neste grupo');
  foodForaDoGrupo = fora.id;

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

describe('refeição', () => {
  it('cria com nome, posição e horário opcional; nasce sem opções', async () => {
    const res = await post(`/nutri/day-types/${dayTypeId}/meals`, {
      name: 'Café da manhã',
      position: 1,
      horario: '08:00',
    }).expect(201);

    expect(res.body).toMatchObject({
      name: 'Café da manhã',
      position: 1,
      // Normalizado para o formato que o Postgres devolve — sem isso o valor
      // que entra e o que sai diferem e a tela pisca.
      horario: '08:00:00',
      options: [],
    });
  });

  it('aceita refeição sem horário', async () => {
    const res = await post(`/nutri/day-types/${dayTypeId}/meals`, {
      name: 'Ceia',
      position: 9,
    }).expect(201);
    expect(res.body.horario).toBeNull();
  });

  it('409 em position já usada no mesmo tipo-de-dia', async () => {
    const res = await post(`/nutri/day-types/${dayTypeId}/meals`, {
      name: 'Outra na 1',
      position: 1,
    }).expect(409);
    expect(String(res.body.message)).toMatch(/posi/i);
  });

  it('aceita a MESMA position em tipo-de-dia diferente', async () => {
    const outro = (
      await post(`/nutri/plans/${planId}/day-types`, { name: 'Outro tipo' })
    ).body as { id: string };
    await post(`/nutri/day-types/${outro.id}/meals`, {
      name: 'Café',
      position: 1,
    }).expect(201);
  });

  it('400 em name vazio, position fora da faixa e horário solto', async () => {
    const p = `/nutri/day-types/${dayTypeId}/meals`;
    await post(p, { name: '', position: 2 }).expect(400);
    await post(p, { name: 'x', position: 0 }).expect(400);
    await post(p, { name: 'x', position: 1.5 }).expect(400);
    await post(p, { name: 'x', position: 2, horario: '24:00' }).expect(400);
    await post(p, { name: 'x', position: 2, horario: 'oito' }).expect(400);
  });

  it('patch move para uma position livre e recusa uma ocupada', async () => {
    const { mealId } = await refeicaoComOpcao(20);

    const ok = await patch(`/nutri/meals/${mealId}`, { position: 21 }).expect(
      200,
    );
    expect(ok.body.position).toBe(21);

    // Mover para a própria posição atual não é colisão consigo mesmo.
    await patch(`/nutri/meals/${mealId}`, { position: 21 }).expect(200);

    await patch(`/nutri/meals/${mealId}`, { position: 1 }).expect(409);
  });

  it('patch limpa o horário com null', async () => {
    const { mealId } = await refeicaoComOpcao(22);
    await patch(`/nutri/meals/${mealId}`, { horario: '19:30' }).expect(200);
    const res = await patch(`/nutri/meals/${mealId}`, {
      horario: null,
    }).expect(200);
    expect(res.body.horario).toBeNull();
  });

  it('409 ao excluir refeição com registro', async () => {
    const mealId = cenario.ids.meal({ dayType: 'COMREG', position: 1 }).mealId;
    const res = await del(`/nutri/meals/${mealId}`).expect(409);
    expect(String(res.body.message)).toMatch(/registro/i);
  });

  it('exclui em cascata quando limpa (opções e itens somem)', async () => {
    const { mealId, optionId } = await refeicaoComOpcao(23);
    await post(`/nutri/options/${optionId}/items`, {
      foodId: cenario.ids.food('base'),
      quantityGrams: 50,
    }).expect(201);

    await del(`/nutri/meals/${mealId}`).expect(204);

    const opcoes = await db
      .select({ id: schema.mealOption.id })
      .from(schema.mealOption)
      .where(eq(schema.mealOption.mealId, mealId));
    expect(opcoes).toEqual([]);

    const itens = await db
      .select({ id: schema.mealItem.id })
      .from(schema.mealItem)
      .where(eq(schema.mealItem.mealOptionId, optionId));
    expect(itens).toEqual([]);
  });

  it('404 em refeição inexistente', async () => {
    await patch(`/nutri/meals/${UUID_INEXISTENTE}`, { name: 'x' }).expect(404);
    await del(`/nutri/meals/${UUID_INEXISTENTE}`).expect(404);
    await post(`/nutri/day-types/${UUID_INEXISTENTE}/meals`, {
      name: 'x',
      position: 1,
    }).expect(404);
  });
});

describe('opção — exatamente uma padrão por refeição', () => {
  it('a PRIMEIRA opção nasce padrão mesmo sem pedir', async () => {
    const meal = (
      await post(`/nutri/day-types/${dayTypeId}/meals`, {
        name: 'Almoço',
        position: 2,
      })
    ).body as { id: string };

    const res = await post(`/nutri/meals/${meal.id}/options`, {
      label: 'Arroz e carne',
    }).expect(201);
    expect(res.body.isDefault).toBe(true);
  });

  it('a segunda nasce NÃO padrão; criar com isDefault desmarca as irmãs', async () => {
    const meal = (
      await post(`/nutri/day-types/${dayTypeId}/meals`, {
        name: 'Jantar',
        position: 3,
      })
    ).body as { id: string };
    const primeira = (
      await post(`/nutri/meals/${meal.id}/options`, { label: 'A' })
    ).body as { id: string };

    const segunda = await post(`/nutri/meals/${meal.id}/options`, {
      label: 'B',
    }).expect(201);
    expect(segunda.body.isDefault).toBe(false);

    const terceira = await post(`/nutri/meals/${meal.id}/options`, {
      label: 'C',
      isDefault: true,
    }).expect(201);
    expect(terceira.body.isDefault).toBe(true);

    const opcoes = (await get(`/nutri/plans/${planId}`)).body.dayTypes
      .flatMap((d: { meals: { id: string; options: unknown[] }[] }) => d.meals)
      .find((m: { id: string }) => m.id === meal.id).options as {
      id: string;
      isDefault: boolean;
    }[];
    expect(opcoes.filter((o) => o.isDefault).length).toBe(1);
    expect(opcoes.find((o) => o.id === primeira.id)!.isDefault).toBe(false);
  });

  it('patch isDefault:true promove esta e desmarca as irmãs', async () => {
    const meal = (
      await post(`/nutri/day-types/${dayTypeId}/meals`, {
        name: 'Lanche',
        position: 4,
      })
    ).body as { id: string };
    const a = (await post(`/nutri/meals/${meal.id}/options`, { label: 'A' }))
      .body as { id: string };
    const b = (await post(`/nutri/meals/${meal.id}/options`, { label: 'B' }))
      .body as { id: string };

    const res = await patch(`/nutri/options/${b.id}`, {
      isDefault: true,
    }).expect(200);
    expect(res.body.isDefault).toBe(true);

    const relidas = await db
      .select({
        id: schema.mealOption.id,
        isDefault: schema.mealOption.isDefault,
      })
      .from(schema.mealOption)
      .where(inArray(schema.mealOption.id, [a.id, b.id]));
    expect(relidas.filter((o) => o.isDefault).map((o) => o.id)).toEqual([b.id]);
  });

  it('409 ao tentar DESMARCAR a única padrão', async () => {
    const { optionId } = await refeicaoComOpcao(24);
    const res = await patch(`/nutri/options/${optionId}`, {
      isDefault: false,
    }).expect(409);
    expect(String(res.body.message)).toMatch(/padr/i);
  });

  it('409 ao excluir a ÚNICA opção da refeição', async () => {
    const { optionId } = await refeicaoComOpcao(25);
    const res = await del(`/nutri/options/${optionId}`).expect(409);
    expect(String(res.body.message)).toMatch(/única|unica/i);
  });

  it('excluir a padrão promove outra no mesmo ato', async () => {
    const meal = (
      await post(`/nutri/day-types/${dayTypeId}/meals`, {
        name: 'Pré-treino',
        position: 5,
      })
    ).body as { id: string };
    const a = (await post(`/nutri/meals/${meal.id}/options`, { label: 'A' }))
      .body as { id: string; isDefault: boolean };
    const b = (await post(`/nutri/meals/${meal.id}/options`, { label: 'B' }))
      .body as { id: string };
    expect(a.isDefault).toBe(true);

    await del(`/nutri/options/${a.id}`).expect(204);

    const [restante] = await db
      .select({
        id: schema.mealOption.id,
        isDefault: schema.mealOption.isDefault,
      })
      .from(schema.mealOption)
      .where(eq(schema.mealOption.mealId, meal.id));
    // A refeição NUNCA fica sem padrão.
    expect(restante).toEqual({ id: b.id, isDefault: true });
  });

  it('409 ao excluir a opção que um registro diz ter sido cumprida', async () => {
    const optionId = cenario.ids.meal({
      dayType: 'COMREG',
      position: 1,
    }).defaultOptionId;
    const res = await del(`/nutri/options/${optionId}`).expect(409);
    expect(String(res.body.message)).toMatch(/registro/i);
  });

  it('400 em label vazio; 404 em opção/refeição inexistente', async () => {
    const { mealId } = await refeicaoComOpcao(26);
    await post(`/nutri/meals/${mealId}/options`, { label: '  ' }).expect(400);
    await patch(`/nutri/options/${UUID_INEXISTENTE}`, { label: 'x' }).expect(
      404,
    );
    await del(`/nutri/options/${UUID_INEXISTENTE}`).expect(404);
  });
});

describe('item', () => {
  it('cria com alimento e gramas, e devolve o nome do alimento resolvido', async () => {
    const { optionId } = await refeicaoComOpcao(27);
    const res = await post(`/nutri/options/${optionId}/items`, {
      foodId: cenario.ids.food('base'),
      quantityGrams: 120,
    }).expect(201);

    expect(res.body).toMatchObject({
      foodId: cenario.ids.food('base'),
      quantityGrams: 120,
      isLocked: false,
      substitutionGroupId: null,
      substitutionGroupName: null,
    });
    expect(typeof res.body.foodName).toBe('string');
    expect(res.body.foodName.length).toBeGreaterThan(0);
  });

  it('aceita a marcação de flexibilidade quando o alimento participa do grupo', async () => {
    const { optionId } = await refeicaoComOpcao(28);
    const res = await post(`/nutri/options/${optionId}/items`, {
      foodId: foodNoGrupo,
      quantityGrams: 90,
      substitutionGroupId: grupoId,
    }).expect(201);

    expect(res.body.substitutionGroupId).toBe(grupoId);
    expect(typeof res.body.substitutionGroupName).toBe('string');
  });

  it('aceita item travado', async () => {
    const { optionId } = await refeicaoComOpcao(29);
    const res = await post(`/nutri/options/${optionId}/items`, {
      foodId: cenario.ids.food('base'),
      quantityGrams: 30,
      isLocked: true,
    }).expect(201);
    expect(res.body.isLocked).toBe(true);
  });

  it('422 quando o alimento NÃO participa do grupo informado', async () => {
    const { optionId } = await refeicaoComOpcao(30);
    const res = await post(`/nutri/options/${optionId}/items`, {
      foodId: foodForaDoGrupo,
      quantityGrams: 90,
      substitutionGroupId: grupoId,
    }).expect(422);
    // Sem `reference_portion_grams` a troca não sabe reescalar a quantidade.
    expect(String(res.body.message)).toMatch(/participa|refer/i);
  });

  it('400 quando travado E com grupo — as duas marcações são contraditórias', async () => {
    const { optionId } = await refeicaoComOpcao(11);
    const res = await post(`/nutri/options/${optionId}/items`, {
      foodId: foodNoGrupo,
      quantityGrams: 90,
      isLocked: true,
      substitutionGroupId: grupoId,
    }).expect(400);
    expect(String(res.body.message)).toMatch(/contradit|travado/i);
  });

  it('400 em gramas ≤ 0 ou não-numérico', async () => {
    const { optionId } = await refeicaoComOpcao(12);
    const p = `/nutri/options/${optionId}/items`;
    const foodId = cenario.ids.food('base');
    await post(p, { foodId, quantityGrams: 0 }).expect(400);
    await post(p, { foodId, quantityGrams: -10 }).expect(400);
    await post(p, { foodId, quantityGrams: '100' }).expect(400);
    await post(p, { foodId }).expect(400);
  });

  it('404 em alimento inexistente', async () => {
    const { optionId } = await refeicaoComOpcao(13);
    await post(`/nutri/options/${optionId}/items`, {
      foodId: UUID_INEXISTENTE,
      quantityGrams: 50,
    }).expect(404);
  });

  it('patch avalia a flexibilidade em CONJUNTO com o que já está gravado', async () => {
    const { optionId } = await refeicaoComOpcao(14);
    const item = (
      await post(`/nutri/options/${optionId}/items`, {
        foodId: foodNoGrupo,
        quantityGrams: 90,
        substitutionGroupId: grupoId,
      })
    ).body as { id: string };

    // Só `isLocked: true`, sem mencionar o grupo: o grupo gravado ainda está lá,
    // então a combinação resultante é a proibida — e tem de ser recusada, não
    // "resolvida" por precedência.
    await patch(`/nutri/items/${item.id}`, { isLocked: true }).expect(400);

    // Tirando o grupo no mesmo patch, passa.
    const ok = await patch(`/nutri/items/${item.id}`, {
      isLocked: true,
      substitutionGroupId: null,
    }).expect(200);
    expect(ok.body).toMatchObject({
      isLocked: true,
      substitutionGroupId: null,
    });
  });

  it('patch troca gramas e alimento', async () => {
    const { optionId } = await refeicaoComOpcao(15);
    const item = (
      await post(`/nutri/options/${optionId}/items`, {
        foodId: cenario.ids.food('base'),
        quantityGrams: 90,
      })
    ).body as { id: string };

    const res = await patch(`/nutri/items/${item.id}`, {
      quantityGrams: 200,
      foodId: foodForaDoGrupo,
    }).expect(200);
    expect(res.body).toMatchObject({
      quantityGrams: 200,
      foodId: foodForaDoGrupo,
    });
  });

  it('exclui sem bloqueador — nada referencia meal_item', async () => {
    const { optionId } = await refeicaoComOpcao(16);
    const item = (
      await post(`/nutri/options/${optionId}/items`, {
        foodId: cenario.ids.food('base'),
        quantityGrams: 90,
      })
    ).body as { id: string };

    await del(`/nutri/items/${item.id}`).expect(204);
    const restante = await db
      .select({ id: schema.mealItem.id })
      .from(schema.mealItem)
      .where(eq(schema.mealItem.id, item.id));
    expect(restante).toEqual([]);
  });

  it('404 em item inexistente', async () => {
    await patch(`/nutri/items/${UUID_INEXISTENTE}`, {
      quantityGrams: 10,
    }).expect(404);
    await del(`/nutri/items/${UUID_INEXISTENTE}`).expect(404);
  });

  it('403 sem a credencial', async () => {
    const { optionId } = await refeicaoComOpcao(17);
    await req()
      .post(`/nutri/options/${optionId}/items`)
      .send({ foodId: cenario.ids.food('base'), quantityGrams: 10 })
      .expect(403);
  });
});

describe('o item registrado sobrevive à edição do plano', () => {
  it('apagar um item de plano não toca no snapshot do registro', async () => {
    // `meal_event_item` referencia `food`, não `meal_item` — então a edição do
    // plano nunca alcança o histórico. Este teste é a prova disso.
    const antes = await db
      .select({ id: schema.mealEventItem.id })
      .from(schema.mealEventItem);

    const { optionId } = await refeicaoComOpcao(18);
    const item = (
      await post(`/nutri/options/${optionId}/items`, {
        foodId: cenario.ids.food('base'),
        quantityGrams: 90,
      })
    ).body as { id: string };
    await del(`/nutri/items/${item.id}`).expect(204);

    const depois = await db
      .select({ id: schema.mealEventItem.id })
      .from(schema.mealEventItem);
    expect(depois.length).toBe(antes.length);
  });

  it('o registro do cenário continua de pé depois de tudo isso', async () => {
    const eventos = await db
      .select({ id: schema.mealEvent.id })
      .from(schema.mealEvent)
      .where(
        and(
          eq(schema.mealEvent.patientId, cenario.ids.patient('comRegistro')),
          eq(schema.mealEvent.state, 'feito'),
        ),
      );
    expect(eventos.length).toBe(1);
  });
});

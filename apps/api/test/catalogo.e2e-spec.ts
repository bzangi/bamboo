import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildScenario, type Scenario } from '@bamboo/db/testing';
import { and, db, eq, inArray, schema } from '@bamboo/db';
import type { FoodDto } from '@bamboo/types';
import { NutriModule } from '../src/nutri/nutri.module';
import { PlanoEditorModule } from '../src/plano-editor/plano-editor.module';

// e2e da Feature 017 — o catálogo (US4): alimentos e grupos de substituição.
//
// `buildScenario` deliberadamente NÃO cria food / substitution_group (I-7 da 013):
// eles têm semântica de upsert-com-história (ingestão TACO, classificação 008), e
// são pré-requisito, não cenário. Então o que este arquivo cria à mão, ele
// também limpa à mão — a lista `paraLimpar` existe por isso.

const NUTRI_KEY = 'test-nutri-key';
process.env.NUTRI_API_KEY = NUTRI_KEY;

const PRE = 'ZZZ 017 catalogo';
/** Nome com acento: prova que a busca dobra acento sem depender da TACO. */
const NOME_ACENTUADO = `${PRE} Açaí Polpa Ção`;

let app: INestApplication;
let cenario: Scenario<'CAT'>;
const paraLimpar = { foods: [] as string[], grupos: [] as string[] };

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

const NUTRIENTES = {
  kcalPer100g: 58,
  carbPer100g: 6.2,
  proteinPer100g: 0.8,
  fatPer100g: 3.4,
};

async function criarFood(name: string, extra: object = {}) {
  const res = await post('/nutri/foods', {
    name,
    ...NUTRIENTES,
    ...extra,
  }).expect(201);
  paraLimpar.foods.push(res.body.id as string);
  return res.body as FoodDto;
}

async function criarGrupo(name: string, basis = 'carb') {
  const res = await post('/nutri/substitution-groups', { name, basis }).expect(
    201,
  );
  paraLimpar.grupos.push(res.body.id as string);
  return res.body as { id: string; custom: boolean; basis: string };
}

beforeAll(async () => {
  cenario = await buildScenario<'CAT'>({
    label: PRE,
    foods: { base: { minKcalPer100g: 50 } },
    patients: [
      {
        label: 'cat',
        name: `${PRE} paciente`,
        plans: [
          {
            label: 'p-cat',
            dayTypes: [
              {
                label: 'CAT',
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
          },
        ],
      },
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
  // Ordem reversa de FK, e só o que esta suíte criou.
  if (paraLimpar.grupos.length > 0) {
    await db
      .delete(schema.foodSubstitutionGroup)
      .where(inArray(schema.foodSubstitutionGroup.groupId, paraLimpar.grupos));
  }
  if (paraLimpar.foods.length > 0) {
    await db
      .delete(schema.foodSubstitutionGroup)
      .where(inArray(schema.foodSubstitutionGroup.foodId, paraLimpar.foods));
  }
  if (paraLimpar.grupos.length > 0) {
    await db
      .delete(schema.substitutionGroup)
      .where(inArray(schema.substitutionGroup.id, paraLimpar.grupos));
  }
  if (paraLimpar.foods.length > 0) {
    await db
      .delete(schema.food)
      .where(inArray(schema.food.id, paraLimpar.foods));
  }
});

describe('GET /nutri/foods — a busca que torna a base TACO alcançável', () => {
  it('acha por trecho do nome, insensível a maiúscula', async () => {
    const criado = await criarFood(`${PRE} Arroz Integral`);
    const res = await get(
      `/nutri/foods?q=${encodeURIComponent(`${PRE.toLowerCase()} arroz`)}`,
    ).expect(200);
    expect(res.body.foods.map((f: { id: string }) => f.id)).toContain(
      criado.id,
    );
  });

  it('acha "acai" quando o nome é "Açaí" — dobra o acento', async () => {
    const criado = await criarFood(NOME_ACENTUADO);
    const res = await get(
      `/nutri/foods?q=${encodeURIComponent('acai polpa cao')}`,
    ).expect(200);
    expect(res.body.foods.map((f: { id: string }) => f.id)).toContain(
      criado.id,
    );
  });

  it('q vazio devolve a primeira página, não erro — é o estado inicial da tela', async () => {
    const res = await get('/nutri/foods').expect(200);
    expect(res.body.foods.length).toBeGreaterThan(0);
    expect(res.body.total).toBeGreaterThanOrEqual(res.body.foods.length);
  });

  it('respeita o limit e informa o total de quem casou', async () => {
    const res = await get('/nutri/foods?limit=3').expect(200);
    expect(res.body.foods.length).toBe(3);
    expect(res.body.total).toBeGreaterThan(3);
  });

  it('busca sem resultado devolve lista vazia e total 0', async () => {
    const res = await get('/nutri/foods?q=zzzznaoexistezzzz').expect(200);
    expect(res.body).toEqual({ foods: [], total: 0 });
  });

  it('% do usuário é literal, não curinga', async () => {
    // Sem escapar, "%" casaria com TUDO e a tela mostraria a base inteira como se
    // fosse resultado da busca. Com escape, casa só com quem tem "%" no nome — e
    // a TACO tem: as margarinas trazem "(65% de lipídeos)" no próprio nome. É por
    // isso que a asserção não é "zero resultados".
    const base = await get('/nutri/foods?q=&limit=1').expect(200);
    const res = await get('/nutri/foods?q=%25&limit=600').expect(200);

    expect(res.body.total).toBeGreaterThan(0);
    expect(res.body.total).toBeLessThan(base.body.total);
    for (const f of res.body.foods as { name: string }[]) {
      expect(f.name).toContain('%');
    }
  });

  it('_ do usuário é literal, não curinga de um caractere', async () => {
    const res = await get('/nutri/foods?q=_').expect(200);
    for (const f of res.body.foods as { name: string }[]) {
      expect(f.name).toContain('_');
    }
  });

  it('403 sem a credencial', async () => {
    await req().get('/nutri/foods').expect(403);
  });
});

// 019 — a busca virou fuzzy (subsequência pontuada) e ganhou página.
describe('GET /nutri/foods — fuzzy e paginação (019)', () => {
  const ids = (res: { body: { foods: { id: string }[] } }) =>
    res.body.foods.map((f) => f.id);

  it('acha por subsequência, com pedaço faltando no meio', async () => {
    const criado = await criarFood(`${PRE} Arroz Integral Fuzzy`);
    // "zzz017arrintfuzzy": nenhum trecho contíguo do nome — só a ordem dos
    // caracteres. `like '%trecho%'` não acharia.
    const res = await get('/nutri/foods?q=zzz017arrintfuzzy').expect(200);
    expect(ids(res)).toContain(criado.id);
  });

  it('ordena por relevância: colado e em início de palavra na frente', async () => {
    const colado = await criarFood(`${PRE} Bnn Pura`);
    const espalhado = await criarFood(`${PRE} Banana Nanica`);

    const res = await get('/nutri/foods?q=bnn&limit=600').expect(200);
    const lista = ids(res);
    expect(lista).toContain(colado.id);
    expect(lista).toContain(espalhado.id);
    expect(lista.indexOf(colado.id)).toBeLessThan(lista.indexOf(espalhado.id));
  });

  it('offset percorre as páginas sem repetir nem pular', async () => {
    const p1 = await get('/nutri/foods?limit=5&offset=0').expect(200);
    const p2 = await get('/nutri/foods?limit=5&offset=5').expect(200);
    const dez = await get('/nutri/foods?limit=10&offset=0').expect(200);

    expect(p2.body.total).toBe(p1.body.total);
    expect([...ids(p1), ...ids(p2)]).toEqual(ids(dez));
  });

  it('offset além do total devolve lista vazia, não erro', async () => {
    const base = await get('/nutri/foods?limit=1').expect(200);
    const res = await get(
      `/nutri/foods?limit=5&offset=${base.body.total + 10}`,
    ).expect(200);

    expect(res.body.foods).toEqual([]);
    expect(res.body.total).toBe(base.body.total);
  });

  it('offset fora de forma cai em 0 em vez de derrubar a tela', async () => {
    const zero = await get('/nutri/foods?limit=3&offset=0').expect(200);
    for (const offset of ['abc', '-5', '']) {
      const res = await get(`/nutri/foods?limit=3&offset=${offset}`).expect(
        200,
      );
      expect(ids(res)).toEqual(ids(zero));
    }
  });
});

describe('CRUD de alimento', () => {
  it('cria com origem NÃO-taco, para a ingestão da 008 nunca sobrescrever', async () => {
    const criado = await criarFood(`${PRE} Pão da esquina`, {
      fiberPer100g: 2.5,
    });
    expect(criado.source).not.toBe('taco');

    const [row] = await db
      .select({ tacoId: schema.food.tacoId, source: schema.food.source })
      .from(schema.food)
      .where(eq(schema.food.id, criado.id));
    // Sem `taco_id`, o upsert por taco_id da ingestão não o alcança.
    expect(row).toMatchObject({ tacoId: null });
    expect(row.source).not.toBe('taco');
  });

  it('sódio: ausente é null, e o teto é o do SAL, não o dos macros em grama', async () => {
    // Nulo e não zero: "não sabemos" é diferente de "não tem sódio", e o sumário
    // do plano conta os sem-dado em vez de somá-los como zero.
    const semSodio = await criarFood(`${PRE} Sem sódio`);
    expect(semSodio.sodiumMgPer100g).toBeNull();

    const salgado = await criarFood(`${PRE} Bem salgado`, {
      sodiumMgPer100g: 38758,
    });
    expect(salgado.sodiumMgPer100g).toBe(38758);

    const editado = await patch(`/nutri/foods/${semSodio.id}`, {
      sodiumMgPer100g: 120,
    }).expect(200);
    expect(editado.body.sodiumMgPer100g).toBe(120);

    // O teto de 100 dos macros em grama barraria o sal de cozinha (~39 g/100 g).
    await post('/nutri/foods', {
      name: `${PRE} Impossível`,
      ...NUTRIENTES,
      sodiumMgPer100g: 40001,
    }).expect(400);
  });

  it('aceita nutriente ZERO (água tem 0 kcal)', async () => {
    const res = await post('/nutri/foods', {
      name: `${PRE} Água`,
      kcalPer100g: 0,
      carbPer100g: 0,
      proteinPer100g: 0,
      fatPer100g: 0,
    }).expect(201);
    paraLimpar.foods.push(res.body.id as string);
    expect(res.body.kcalPer100g).toBe(0);
  });

  it('400 em nome vazio, nutriente ausente, negativo ou não-numérico', async () => {
    await post('/nutri/foods', { name: '', ...NUTRIENTES }).expect(400);
    await post('/nutri/foods', { name: 'x' }).expect(400);
    await post('/nutri/foods', {
      name: 'x',
      ...NUTRIENTES,
      carbPer100g: -1,
    }).expect(400);
    await post('/nutri/foods', {
      name: 'x',
      ...NUTRIENTES,
      kcalPer100g: '58',
    }).expect(400);
  });

  it('patch parcial altera só o que veio', async () => {
    const criado = await criarFood(`${PRE} Para editar`);
    const res = await patch(`/nutri/foods/${criado.id}`, {
      kcalPer100g: 99,
    }).expect(200);
    expect(res.body).toMatchObject({
      name: `${PRE} Para editar`,
      kcalPer100g: 99,
      carbPer100g: NUTRIENTES.carbPer100g,
    });
  });

  it('exclui alimento livre', async () => {
    const criado = await criarFood(`${PRE} Descartável`);
    await del(`/nutri/foods/${criado.id}`).expect(204);
    const restante = await db
      .select({ id: schema.food.id })
      .from(schema.food)
      .where(eq(schema.food.id, criado.id));
    expect(restante).toEqual([]);
  });

  it('409 ao excluir alimento usado em algum plano', async () => {
    const res = await del(`/nutri/foods/${cenario.ids.food('base')}`).expect(
      409,
    );
    expect(String(res.body.message)).toMatch(/plano/i);
  });

  it('404 em alimento inexistente', async () => {
    await patch(`/nutri/foods/${UUID_INEXISTENTE}`, {
      kcalPer100g: 1,
    }).expect(404);
    await del(`/nutri/foods/${UUID_INEXISTENTE}`).expect(404);
  });
});

describe('CRUD de grupo de substituição', () => {
  it('lista os grupos do sistema com os alimentos vinculados', async () => {
    const res = await get('/nutri/substitution-groups').expect(200);
    expect(res.body.groups.length).toBeGreaterThan(0);
    const g = res.body.groups[0];
    expect(g).toHaveProperty('basis');
    expect(g).toHaveProperty('custom');
    expect(Array.isArray(g.foods)).toBe(true);
  });

  it('grupo criado pela nutri nasce custom', async () => {
    const g = await criarGrupo(`${PRE} Meus carboidratos`, 'carb');
    expect(g).toMatchObject({ custom: true, basis: 'carb' });
  });

  it('400 em basis fora do conjunto e nome vazio', async () => {
    await post('/nutri/substitution-groups', {
      name: 'x',
      basis: 'vitamina',
    }).expect(400);
    await post('/nutri/substitution-groups', {
      name: '  ',
      basis: 'carb',
    }).expect(400);
  });

  it('patch troca nome e base', async () => {
    const g = await criarGrupo(`${PRE} Para editar`);
    const res = await patch(`/nutri/substitution-groups/${g.id}`, {
      name: `${PRE} Editado`,
      basis: 'protein',
    }).expect(200);
    expect(res.body).toMatchObject({
      name: `${PRE} Editado`,
      basis: 'protein',
    });
  });

  it('vincula alimento com a porção de referência e origem manual', async () => {
    const g = await criarGrupo(`${PRE} Grupo com vínculo`);
    const f = await criarFood(`${PRE} Alimento vinculado`);

    const res = await put(`/nutri/substitution-groups/${g.id}/foods/${f.id}`, {
      referencePortionGrams: 100,
    }).expect(200);

    expect(res.body.foods).toEqual([
      {
        foodId: f.id,
        foodName: `${PRE} Alimento vinculado`,
        referencePortionGrams: 100,
        // Curadoria humana: a auto-classificação (008) nunca sobrescreve manual.
        origin: 'manual',
      },
    ]);
  });

  it('revincular ATUALIZA a porção em vez de duplicar o vínculo', async () => {
    const g = await criarGrupo(`${PRE} Grupo revínculo`);
    const f = await criarFood(`${PRE} Alimento revínculo`);
    const p = `/nutri/substitution-groups/${g.id}/foods/${f.id}`;

    await put(p, { referencePortionGrams: 100 }).expect(200);
    const res = await put(p, { referencePortionGrams: 150 }).expect(200);

    expect(res.body.foods.length).toBe(1);
    expect(res.body.foods[0].referencePortionGrams).toBe(150);
  });

  it('400 em porção de referência ≤ 0', async () => {
    const g = await criarGrupo(`${PRE} Grupo porção inválida`);
    const f = await criarFood(`${PRE} Alimento porção inválida`);
    await put(`/nutri/substitution-groups/${g.id}/foods/${f.id}`, {
      referencePortionGrams: 0,
    }).expect(400);
    await put(`/nutri/substitution-groups/${g.id}/foods/${f.id}`, {}).expect(
      400,
    );
  });

  it('desvincula', async () => {
    const g = await criarGrupo(`${PRE} Grupo desvínculo`);
    const f = await criarFood(`${PRE} Alimento desvínculo`);
    const p = `/nutri/substitution-groups/${g.id}/foods/${f.id}`;

    await put(p, { referencePortionGrams: 100 }).expect(200);
    const res = await del(p).expect(200);
    expect(res.body.foods).toEqual([]);
  });

  it('409 ao desvincular alimento de que um item de plano depende', async () => {
    const g = await criarGrupo(`${PRE} Grupo em uso por item`);
    const foodId = cenario.ids.food('base');
    const p = `/nutri/substitution-groups/${g.id}/foods/${foodId}`;
    await put(p, { referencePortionGrams: 100 }).expect(200);

    const optionId = cenario.ids.meal({
      dayType: 'CAT',
      position: 1,
    }).defaultOptionId;
    const item = (
      await post(`/nutri/options/${optionId}/items`, {
        foodId,
        quantityGrams: 80,
        substitutionGroupId: g.id,
      }).expect(201)
    ).body as { id: string };

    const res = await del(p).expect(409);
    expect(String(res.body.message)).toMatch(/refer|vínculo|vinculo/i);

    // E o grupo também não sai enquanto o item aponta para ele.
    const resGrupo = await del(`/nutri/substitution-groups/${g.id}`).expect(
      409,
    );
    expect(String(resGrupo.body.message)).toMatch(/item|flex/i);

    // Tirando o item, os dois passam.
    await del(`/nutri/items/${item.id}`).expect(204);
    await del(p).expect(200);
    await del(`/nutri/substitution-groups/${g.id}`).expect(204);
  });

  it('exclui grupo livre, levando os vínculos', async () => {
    const g = await criarGrupo(`${PRE} Grupo descartável`);
    const f = await criarFood(`${PRE} Alimento do descartável`);
    await put(`/nutri/substitution-groups/${g.id}/foods/${f.id}`, {
      referencePortionGrams: 100,
    }).expect(200);

    await del(`/nutri/substitution-groups/${g.id}`).expect(204);

    const vinculos = await db
      .select({ id: schema.foodSubstitutionGroup.id })
      .from(schema.foodSubstitutionGroup)
      .where(eq(schema.foodSubstitutionGroup.groupId, g.id));
    expect(vinculos).toEqual([]);
  });

  it('404 em grupo inexistente', async () => {
    await patch(`/nutri/substitution-groups/${UUID_INEXISTENTE}`, {
      name: 'x',
    }).expect(404);
    await del(`/nutri/substitution-groups/${UUID_INEXISTENTE}`).expect(404);
  });
});

describe('excluir alimento leva o vínculo de grupo, não o registro', () => {
  it('vínculo sai junto; o alimento em uso por registro é recusado', async () => {
    const g = await criarGrupo(`${PRE} Grupo do alimento apagado`);
    const f = await criarFood(`${PRE} Alimento a apagar`);
    await put(`/nutri/substitution-groups/${g.id}/foods/${f.id}`, {
      referencePortionGrams: 100,
    }).expect(200);

    await del(`/nutri/foods/${f.id}`).expect(204);

    const vinculos = await db
      .select({ id: schema.foodSubstitutionGroup.id })
      .from(schema.foodSubstitutionGroup)
      .where(
        and(
          eq(schema.foodSubstitutionGroup.groupId, g.id),
          eq(schema.foodSubstitutionGroup.foodId, f.id),
        ),
      );
    expect(vinculos).toEqual([]);
  });
});

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildScenario, everyWeekday, type Scenario } from '@bamboo/db/testing';
import { db, eq, schema } from '@bamboo/db';
import { NutriModule } from '../src/nutri/nutri.module';

// e2e da Feature 017 — a ficha do paciente ganha U e D (US1).
//
// Cenário self-contained com `buildScenario` (013) e `destroy()` no afterAll:
// NUNCA o paciente do seed (lição KI-001). Três pacientes porque as três
// situações de exclusão são diferentes por construção: sem plano, com plano e sem
// registro, e com registro (o único que precisa ser recusado).

const NUTRI_KEY = 'test-nutri-key';
process.env.NUTRI_API_KEY = NUTRI_KEY;

const PRE = 'ZZZ 017 crud';

let app: INestApplication;
// Labels de tipo-de-dia são únicos no cenário INTEIRO (I-5), não por plano: 'L'
// para o paciente sem registro, 'R' para o com registro.
let cenario: Scenario<'L' | 'R'>;

const nutri = () => request(app.getHttpServer());
const get = (p: string) => nutri().get(p).set('x-nutri-key', NUTRI_KEY);
const patch = (p: string, body: object) =>
  nutri().patch(p).set('x-nutri-key', NUTRI_KEY).send(body);
const del = (p: string) => nutri().delete(p).set('x-nutri-key', NUTRI_KEY);

const UUID_INEXISTENTE = '00000000-0000-4000-8000-000000000000';

beforeAll(async () => {
  cenario = await buildScenario<'L' | 'R'>({
    label: PRE,
    foods: { base: { minKcalPer100g: 50 } },
    patients: [
      { label: 'ficha', name: `${PRE} ficha` },
      {
        label: 'limpo',
        name: `${PRE} limpo`,
        plans: [
          {
            label: 'p-limpo',
            dayTypes: [
              {
                label: 'L',
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
            schedule: everyWeekday('L'),
          },
        ],
      },
      {
        label: 'comRegistro',
        name: `${PRE} com registro`,
        plans: [
          {
            label: 'p-registro',
            dayTypes: [
              {
                label: 'R',
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
            schedule: everyWeekday('R'),
          },
        ],
        cycles: [{ label: 'c1', startedDaysAgo: 5, expectedDurationDays: 30 }],
      },
    ],
    // Plano, paciente e tipo-de-dia do evento são DERIVADOS do MealRef — é o
    // ponto do endereçamento por (label, position) da 013.
    events: [
      { meal: { dayType: 'R', position: 1 }, state: 'feito', daysAgo: 1 },
    ],
  });

  const mod = await Test.createTestingModule({
    imports: [NutriModule],
  }).compile();
  app = mod.createNestApplication();
  await app.init();
});

afterAll(async () => {
  await app?.close();
  await cenario?.destroy();
});

describe('GET /nutri/patients/:patientId — a ficha', () => {
  it('devolve os campos que o formulário de edição precisa preencher', async () => {
    const id = cenario.ids.patient('ficha');
    const res = await get(`/nutri/patients/${id}`).expect(200);

    expect(res.body).toEqual({
      id,
      name: `${PRE} ficha`,
      email: null,
      phone: null,
      heightCm: null,
      weightKg: null,
      exposure: 'hidden',
    });
  });

  it('404 em paciente inexistente', async () => {
    await get(`/nutri/patients/${UUID_INEXISTENTE}`).expect(404);
  });

  it('403 sem a credencial', async () => {
    await nutri()
      .get(`/nutri/patients/${cenario.ids.patient('ficha')}`)
      .expect(403);
  });
});

describe('PATCH /nutri/patients/:patientId', () => {
  it('altera o nome e devolve a ficha', async () => {
    const id = cenario.ids.patient('ficha');
    const res = await patch(`/nutri/patients/${id}`, {
      name: `  ${PRE} renomeada  `,
    }).expect(200);

    expect(res.body.name).toBe(`${PRE} renomeada`);
    const relido = await get(`/nutri/patients/${id}`).expect(200);
    expect(relido.body.name).toBe(`${PRE} renomeada`);
  });

  it('patch parcial preserva os campos não enviados', async () => {
    const id = cenario.ids.patient('ficha');
    await patch(`/nutri/patients/${id}`, {
      email: 'ana@exemplo.com',
      phone: '11999990000',
      heightCm: 165,
      weightKg: 62.5,
      exposure: 'macros',
    }).expect(200);

    // Só o peso muda: todo o resto tem de sobreviver.
    const res = await patch(`/nutri/patients/${id}`, {
      weightKg: 61,
    }).expect(200);

    expect(res.body).toMatchObject({
      name: `${PRE} renomeada`,
      email: 'ana@exemplo.com',
      phone: '11999990000',
      heightCm: 165,
      weightKg: 61,
      exposure: 'macros',
    });
  });

  it('null limpa o campo — apagar dado de saúde é um direito, não um erro', async () => {
    const id = cenario.ids.patient('ficha');
    const res = await patch(`/nutri/patients/${id}`, {
      email: null,
      phone: null,
      heightCm: null,
      weightKg: null,
    }).expect(200);

    expect(res.body).toMatchObject({
      email: null,
      phone: null,
      heightCm: null,
      weightKg: null,
      exposure: 'macros', // não foi mandado ⇒ não muda
    });
  });

  it('corpo vazio é no-op, não erro', async () => {
    const id = cenario.ids.patient('ficha');
    const res = await patch(`/nutri/patients/${id}`, {}).expect(200);
    expect(res.body.name).toBe(`${PRE} renomeada`);
  });

  it('400 em exposure fora do enum', async () => {
    await patch(`/nutri/patients/${cenario.ids.patient('ficha')}`, {
      exposure: 'tudo',
    }).expect(400);
  });

  it('400 em nome vazio e em peso/altura inválidos', async () => {
    const id = cenario.ids.patient('ficha');
    await patch(`/nutri/patients/${id}`, { name: '   ' }).expect(400);
    await patch(`/nutri/patients/${id}`, { weightKg: 0 }).expect(400);
    await patch(`/nutri/patients/${id}`, { weightKg: -5 }).expect(400);
    await patch(`/nutri/patients/${id}`, { heightCm: '165' }).expect(400);
  });

  it('404 em paciente inexistente', async () => {
    await patch(`/nutri/patients/${UUID_INEXISTENTE}`, {
      name: 'x',
    }).expect(404);
  });
});

describe('DELETE /nutri/patients/:patientId', () => {
  it('409 quando o paciente tem registro de refeição — histórico não some por clique', async () => {
    const id = cenario.ids.patient('comRegistro');
    const res = await del(`/nutri/patients/${id}`).expect(409);
    expect(String(res.body.message)).toMatch(/registro/i);

    // E nada foi apagado no caminho.
    await get(`/nutri/patients/${id}`).expect(200);
    const eventos = await db
      .select({ id: schema.mealEvent.id })
      .from(schema.mealEvent)
      .where(eq(schema.mealEvent.patientId, id));
    expect(eventos.length).toBe(1);
  });

  it('apaga o paciente e o grafo do plano quando não há registro', async () => {
    const id = cenario.ids.patient('limpo');
    const planId = cenario.ids.plan('p-limpo');

    await del(`/nutri/patients/${id}`).expect(204);
    await get(`/nutri/patients/${id}`).expect(404);

    // O grafo abaixo foi embora junto (cascata para baixo — FR-005).
    const planos = await db
      .select({ id: schema.plan.id })
      .from(schema.plan)
      .where(eq(schema.plan.patientId, id));
    expect(planos).toEqual([]);

    const tipos = await db
      .select({ id: schema.dayType.id })
      .from(schema.dayType)
      .where(eq(schema.dayType.planId, planId));
    expect(tipos).toEqual([]);

    const semana = await db
      .select({ id: schema.daySchedule.id })
      .from(schema.daySchedule)
      .where(eq(schema.daySchedule.planId, planId));
    expect(semana).toEqual([]);
  });

  it('404 em paciente inexistente', async () => {
    await del(`/nutri/patients/${UUID_INEXISTENTE}`).expect(404);
  });
});

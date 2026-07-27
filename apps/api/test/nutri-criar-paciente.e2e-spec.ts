import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, eq, inArray, schema } from '@bamboo/db';
import { NutriModule } from '../src/nutri/nutri.module';

// e2e da Feature 016 — cadastrar paciente.
//
// Esta suíte NÃO usa `buildScenario`: aqui o cenário é o **efeito** da chamada,
// não um fixture. Ela cria pacientes de verdade, então guarda os ids e apaga
// exatamente esses no `afterAll` — nunca um `delete` amplo (lição KI-001: a
// suíte que apaga o que não é dela derruba a próxima).
//
// Nenhuma asserção olha o TAMANHO da lista: o banco tem o paciente do seed e
// pode ter cenário vivo de outra suíte.

const NUTRI_KEY = 'test-nutri-key';
process.env.NUTRI_API_KEY = NUTRI_KEY;

const NOME = 'Paciente 016 — cadastro';

let app: INestApplication;
const criados: string[] = [];

type PacienteBody = {
  id: string;
  name: string;
  cicloAtual: unknown;
};

const nutriPost = (path: string) =>
  request(app.getHttpServer()).post(path).set('x-nutri-key', NUTRI_KEY);

const contar = async (): Promise<{
  patients: number;
  plans: number;
  cycles: number;
  schedules: number;
}> => {
  const [patients, plans, cycles, schedules] = await Promise.all([
    db.select({ id: schema.patient.id }).from(schema.patient),
    db.select({ id: schema.plan.id }).from(schema.plan),
    db.select({ id: schema.cycle.id }).from(schema.cycle),
    db.select({ id: schema.daySchedule.id }).from(schema.daySchedule),
  ]);
  return {
    patients: patients.length,
    plans: plans.length,
    cycles: cycles.length,
    schedules: schedules.length,
  };
};

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [NutriModule],
  }).compile();
  app = moduleRef.createNestApplication();
  await app.init();
});

afterAll(async () => {
  // Só o que esta suíte criou, por id.
  if (criados.length > 0) {
    await db.delete(schema.patient).where(inArray(schema.patient.id, criados));
  }
  await app?.close();
});

describe('POST /nutri/patients — cadastro (016)', () => {
  it('SC-001: sem x-nutri-key → 403, antes de qualquer escrita', async () => {
    const antes = await contar();
    await request(app.getHttpServer())
      .post('/nutri/patients')
      .send({ name: 'Não deve existir' })
      .expect(403);
    expect((await contar()).patients).toBe(antes.patients);
  });

  it('SC-002: nome ausente, vazio, só espaços ou não-string → 400 e nada criado', async () => {
    const antes = await contar();

    await nutriPost('/nutri/patients').send({}).expect(400);
    await nutriPost('/nutri/patients').send({ name: '' }).expect(400);
    await nutriPost('/nutri/patients').send({ name: '   ' }).expect(400);
    await nutriPost('/nutri/patients').send({ name: 42 }).expect(400);
    await nutriPost('/nutri/patients')
      .send({ name: 'x'.repeat(121) })
      .expect(400);

    expect((await contar()).patients).toBe(antes.patients);
  });

  it('SC-001/SC-005: nome válido → 201 na forma do item da listagem, e só `patient` é escrito', async () => {
    const antes = await contar();

    const res = await nutriPost('/nutri/patients')
      .send({ name: NOME })
      .expect(201);

    const body = res.body as PacienteBody;
    criados.push(body.id);

    expect(Object.keys(body).sort()).toEqual(['cicloAtual', 'id', 'name']);
    expect(body.name).toBe(NOME);
    expect(body.cicloAtual).toBeNull();

    const depois = await contar();
    expect(depois.patients).toBe(antes.patients + 1);
    // FR-006: cadastro NÃO inventa plano, ciclo nem programação.
    expect(depois.plans).toBe(antes.plans);
    expect(depois.cycles).toBe(antes.cycles);
    expect(depois.schedules).toBe(antes.schedules);
  });

  it('FR-005: o paciente nasce vinculado à nutricionista responsável', async () => {
    const res = await nutriPost('/nutri/patients')
      .send({ name: `${NOME} (vínculo)` })
      .expect(201);
    const { id } = res.body as PacienteBody;
    criados.push(id);

    const [row] = await db
      .select({ nutritionistId: schema.patient.nutritionistId })
      .from(schema.patient)
      .where(eq(schema.patient.id, id))
      .limit(1);

    const [nutri] = await db
      .select({ id: schema.nutritionist.id })
      .from(schema.nutritionist)
      .limit(1);

    expect(row?.nutritionistId).toBe(nutri?.id);
  });

  it('SC-004: espaços nas pontas são removidos antes de persistir', async () => {
    const res = await nutriPost('/nutri/patients')
      .send({ name: `  ${NOME} (trim)  ` })
      .expect(201);
    const body = res.body as PacienteBody;
    criados.push(body.id);

    expect(body.name).toBe(`${NOME} (trim)`);
  });

  it('SC-006: homônimo é aceito — dois pacientes distintos', async () => {
    const um = await nutriPost('/nutri/patients')
      .send({ name: `${NOME} (homônimo)` })
      .expect(201);
    const dois = await nutriPost('/nutri/patients')
      .send({ name: `${NOME} (homônimo)` })
      .expect(201);

    const a = (um.body as PacienteBody).id;
    const b = (dois.body as PacienteBody).id;
    criados.push(a, b);

    expect(a).not.toBe(b);
  });

  it('SC-003: o paciente criado aparece na listagem com cicloAtual null', async () => {
    const criado = await nutriPost('/nutri/patients')
      .send({ name: `${NOME} (na lista)` })
      .expect(201);
    const { id } = criado.body as PacienteBody;
    criados.push(id);

    const lista = await request(app.getHttpServer())
      .get('/nutri/patients')
      .set('x-nutri-key', NUTRI_KEY)
      .expect(200);

    const encontrado = (
      lista.body as { patients: PacienteBody[] }
    ).patients.find((p) => p.id === id);
    expect(encontrado?.name).toBe(`${NOME} (na lista)`);
    expect(encontrado?.cicloAtual).toBeNull();
  });
});

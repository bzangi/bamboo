import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildScenario, localDate, type Scenario } from '@bamboo/db/testing';
import { NutriModule } from '../src/nutri/nutri.module';

// e2e da Feature 015 — a porta de entrada da visão da nutri.
//
// ⚠️ A listagem é GLOBAL (o papel do stub é "nutri do sistema" — spec, Fora de
// escopo): a resposta inclui o paciente do seed e qualquer cenário vivo de outra
// suíte. Então nenhuma asserção aqui olha o TAMANHO da lista nem posição
// absoluta — só os pacientes deste cenário, achados por id, e a ordem RELATIVA
// entre eles. Asserir `length` seria frágil por construção.
//
// Fixture declarado via `buildScenario` (013). Sem planos: a roster não depende
// de plano nenhum, e o que não é necessário não entra no cenário.

const NUTRI_KEY = 'test-nutri-key';
process.env.NUTRI_API_KEY = NUTRI_KEY;

// Prefixo alto no alfabeto: fixa a ordem RELATIVA dos três sem depender de quem
// mais está no banco.
const PRE = 'ZZZ 015';

let app: INestApplication;
let cenario: Scenario;
let idAberto: string;
let idSemCiclo: string;
let idDoisFechados: string;

type ListaBody = {
  patients: {
    id: string;
    name: string;
    cicloAtual: {
      id: string;
      startedOn: string;
      closedOn: string | null;
      expectedDurationDays: number;
      aberto: boolean;
    } | null;
  }[];
};

const nutriGet = (path: string) =>
  request(app.getHttpServer()).get(path).set('x-nutri-key', NUTRI_KEY);

const acharNaLista = (body: ListaBody, id: string) => {
  const encontrado = body.patients.find((p) => p.id === id);
  if (!encontrado) throw new Error(`paciente ${id} ausente da listagem`);
  return encontrado;
};

beforeAll(async () => {
  cenario = await buildScenario({
    label: 'roster (e2e 015)',
    patients: [
      {
        label: 'aberto',
        name: `${PRE} A — em ciclo`,
        cycles: [
          { label: 'vivo', startedDaysAgo: 12, expectedDurationDays: 30 },
        ],
      },
      { label: 'sem-ciclo', name: `${PRE} B — sem ciclo` },
      {
        label: 'dois-fechados',
        name: `${PRE} C — dois fechados`,
        cycles: [
          {
            label: 'antigo',
            startedDaysAgo: 90,
            closedDaysAgo: 60,
            expectedDurationDays: 30,
          },
          {
            label: 'recente',
            startedDaysAgo: 59,
            closedDaysAgo: 20,
            expectedDurationDays: 40,
          },
        ],
      },
    ],
  });

  idAberto = cenario.ids.patient('aberto');
  idSemCiclo = cenario.ids.patient('sem-ciclo');
  idDoisFechados = cenario.ids.patient('dois-fechados');

  const moduleRef = await Test.createTestingModule({
    imports: [NutriModule],
  }).compile();
  app = moduleRef.createNestApplication();
  await app.init();
});

afterAll(async () => {
  await cenario?.destroy(); // ordem reversa de FK é do construtor (I-9)
  await app?.close();
});

describe('GET /nutri/patients — a porta de entrada (015)', () => {
  it('SC-001: sem x-nutri-key → 403 (fail-closed, mesma via das outras rotas /nutri)', async () => {
    await request(app.getHttpServer()).get('/nutri/patients').expect(403);
  });

  it('SC-001: com a chave errada → 403', async () => {
    await request(app.getHttpServer())
      .get('/nutri/patients')
      .set('x-nutri-key', 'chave-errada')
      .expect(403);
  });

  it('SC-002: paciente com ciclo aberto vem com cicloAtual.aberto e o id do ciclo vivo', async () => {
    const res = await nutriGet('/nutri/patients').expect(200);
    const p = acharNaLista(res.body as ListaBody, idAberto);

    expect(p.name).toBe(`${PRE} A — em ciclo`);
    expect(p.cicloAtual).not.toBeNull();
    expect(p.cicloAtual?.id).toBe(cenario.ids.cycle('vivo'));
    expect(p.cicloAtual?.aberto).toBe(true);
    expect(p.cicloAtual?.closedOn).toBeNull();
    expect(p.cicloAtual?.startedOn).toBe(localDate(12));
    expect(p.cicloAtual?.expectedDurationDays).toBe(30);
  });

  it('SC-002: paciente sem ciclo nenhum vem com cicloAtual null (nunca ausente do campo)', async () => {
    const res = await nutriGet('/nutri/patients').expect(200);
    const p = acharNaLista(res.body as ListaBody, idSemCiclo);

    expect(p.cicloAtual).toBeNull();
  });

  it('SC-003: só ciclos fechados → o de closedOn mais recente (D2)', async () => {
    const res = await nutriGet('/nutri/patients').expect(200);
    const p = acharNaLista(res.body as ListaBody, idDoisFechados);

    expect(p.cicloAtual?.id).toBe(cenario.ids.cycle('recente'));
    expect(p.cicloAtual?.aberto).toBe(false);
    expect(p.cicloAtual?.closedOn).toBe(localDate(20));
    expect(p.cicloAtual?.expectedDurationDays).toBe(40);
  });

  it('FR-003: ordem por nome — a relativa entre os três do cenário é estável', async () => {
    const res = await nutriGet('/nutri/patients').expect(200);
    const nomes = (res.body as ListaBody).patients.map((p) => p.id);

    expect(nomes.indexOf(idAberto)).toBeLessThan(nomes.indexOf(idSemCiclo));
    expect(nomes.indexOf(idSemCiclo)).toBeLessThan(
      nomes.indexOf(idDoisFechados),
    );
  });

  it('FR-004: nenhum dado pessoal além do nome sai na listagem', async () => {
    const res = await nutriGet('/nutri/patients').expect(200);
    const p = acharNaLista(res.body as ListaBody, idAberto);

    expect(Object.keys(p).sort()).toEqual(['cicloAtual', 'id', 'name']);
  });
});

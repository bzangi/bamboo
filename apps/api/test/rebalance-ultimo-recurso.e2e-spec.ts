import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, eq, schema } from '@bamboo/db';
import { buildScenario, everyWeekday, type Scenario } from '@bamboo/db/testing';
import { PlanModule } from '../src/plan/plan.module';
import { RebalanceModule } from '../src/rebalance/rebalance.module';
import { RegistroModule } from '../src/registro/registro.module';

// e2e da Feature 022 / US2 — o gatilho como alavanca de ÚLTIMO RECURSO.
//
// O sintoma reportado: com todas as refeições do dia registradas menos a última,
// escolher outra opção nessa última respondia `recusa-orientada/sem-alavanca` —
// barrando a troca sem ter próxima refeição alguma a proteger.
//
// Calibração EXATA por foods reais da TACO (kcal/100g), régua pinada no paciente:
//   arroz    'Arroz branco cozido'               128.26
//   frango   'Frango, peito, sem pele, grelhado' 159.19
//   macarrao 'Macarrão cozido'                   131.00
//   batata   'Batata doce cozida'                 76.76
//
//   pos 1: arroz 100 g              → 128.26   (será "pulei")
//   pos 2: frango 200 g             → 318.38   (será "feito")
//   pos 3: [default] macarrão 100 g → 131.00
//          [Rap 10]  arroz    100 g → 128.26
//          [Travada] batata   100 g →  76.76   (travada, sem grupo)
//   alvo = 128.26 + 318.38 + 131.00 = 577.64 ; faixa ±10% = [519.88, 635.40]
//
// Escolhendo "Rap 10" com pos 1 pulada e pos 2 feita:
//   totalAtual = 0 + 318.38 + 128.26 = 446.64  → déficit de 131.00 kcal
//   sem alavanca fora do gatilho → o arroz do próprio gatilho absorve:
//   +131.00 / 1.2826 = +102.14 g → 202.14 g

const HOJE_TIPO = 'A';
type Tipo = typeof HOJE_TIPO;

const ARROZ_AJUSTADO = 202.14;

let app: INestApplication;
let cenario: Scenario<Tipo>;
let patientId: string;

type ItemAjustadoDto = {
  itemId: string;
  food: { id: string; name: string };
  gramasNovo: number;
};
type OutcomeBody = {
  outcome: {
    kind: string;
    motivo?: string;
    mensagem?: string;
    totalDepois?: { kcal?: number };
    refeicoesAfetadas?: {
      mealId: string;
      name: string;
      position: number;
      itensAjustados: ItemAjustadoDto[];
    }[];
  };
};

const mealDe = (position: number) =>
  cenario.ids.meal({ dayType: HOJE_TIPO, position });

const registrar = (mealId: string, intent: 'feito' | 'pulei') =>
  request(app.getHttpServer())
    .post(`/patients/${patientId}/registro`)
    .send({ mealId, intent })
    .expect(200);

const escolher = (optionLabel: string) =>
  request(app.getHttpServer())
    .post(`/patients/${patientId}/rebalance/option-choice`)
    .send({
      triggerMealId: mealDe(3).mealId,
      chosenOptionId: mealDe(3).option(optionLabel),
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
    label: 'ultimo-recurso (e2e 022/US2)',
    foods: {
      arroz: { name: 'Arroz branco cozido' },
      frango: { name: 'Frango, peito, sem pele, grelhado' },
      macarrao: { name: 'Macarrão cozido' },
      batata: { name: 'Batata doce cozida' },
    },
    patients: [
      {
        name: 'Cenário Último Recurso (e2e 022)',
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
                        ],
                      },
                    ],
                  },
                  {
                    position: 3,
                    options: [
                      {
                        label: 'Macarrão',
                        isDefault: true,
                        items: [
                          {
                            food: 'macarrao',
                            grams: 100,
                            group: 'Amidos e cereais',
                          },
                        ],
                      },
                      {
                        label: 'Rap 10',
                        items: [
                          {
                            food: 'arroz',
                            grams: 100,
                            group: 'Amidos e cereais',
                          },
                        ],
                      },
                      {
                        label: 'Travada',
                        items: [{ food: 'batata', grams: 100, locked: true }],
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
    imports: [PlanModule, RebalanceModule, RegistroModule],
  }).compile();
  app = moduleRef.createNestApplication();
  await app.init();

  // Todas as refeições registradas MENOS a última; o "pulei" é o que abre saldo.
  await registrar(mealDe(1).mealId, 'pulei');
  await registrar(mealDe(2).mealId, 'feito');
});

afterAll(async () => {
  await cenario?.destroy();
  await app?.close();
});

describe('FR-007 — a última refeição não registrada ajusta a si mesma', () => {
  it('devolve rebalanceado com a PRÓPRIA refeição-gatilho em refeicoesAfetadas', async () => {
    const res = await escolher('Rap 10').expect(200);
    const { outcome } = res.body as OutcomeBody;

    expect(outcome.kind).toBe('rebalanceado');
    expect(outcome.refeicoesAfetadas).toHaveLength(1);
    const afetada = outcome.refeicoesAfetadas![0];
    expect(afetada.mealId).toBe(mealDe(3).mealId);
    expect(afetada.position).toBe(3);
    expect(afetada.itensAjustados).toHaveLength(1);
    expect(afetada.itensAjustados[0].gramasNovo).toBeCloseTo(ARROZ_AJUSTADO, 1);
    expect(outcome.totalDepois?.kcal).toBe(578); // volta ao alvo (577.64)
  });

  // D5 — o mapper resolve o nome do alimento por itemId e faz `continue`
  // SILENCIOSO quando não acha: sem esta asserção, um lookup que não cobrisse os
  // itens do gatilho devolveria `rebalanceado` com lista vazia, e o teste acima
  // é que pegaria — mas só pelo tamanho. Aqui o nome é afirmado de verdade.
  it('o item ajustado vem com o alimento resolvido (não cai no continue do mapper)', async () => {
    const res = await escolher('Rap 10').expect(200);
    const { outcome } = res.body as OutcomeBody;

    const item = outcome.refeicoesAfetadas![0].itensAjustados[0];
    expect(item.food.id).toBe(cenario.ids.food('arroz'));
    expect(item.food.name).toBe('Arroz branco cozido');
  });
});

describe('FR-010 — gatilho sem item elegível continua orientando', () => {
  it('opção só com item travado → recusa-orientada/sem-alavanca, com 200', async () => {
    const res = await escolher('Travada').expect(200);
    const { outcome } = res.body as OutcomeBody;

    expect(outcome.kind).toBe('recusa-orientada');
    expect(outcome.motivo).toBe('sem-alavanca');
    expect(outcome.mensagem).toBeTruthy();
  });
});

describe('FR-012/SC-005 — a prévia não grava nada', () => {
  it('contagem de meal_event idêntica antes e depois das prévias', async () => {
    const antes = await contarEventos();

    await escolher('Rap 10').expect(200);
    await escolher('Travada').expect(200);

    expect(await contarEventos()).toBe(antes);
  });
});

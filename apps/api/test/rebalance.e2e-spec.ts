import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, asc, eq, db, pool, schema } from '@bamboo/db';
import { RebalanceModule } from '../src/rebalance/rebalance.module';
import { RegistroModule } from '../src/registro/registro.module';

// e2e US1 — POST /patients/:id/rebalance/option-choice (gatilho P1).
// IDs por query (o seed gera UUIDs novos a cada run; resolve o day_type de hoje).
describe('POST /patients/:id/rebalance/option-choice (US1)', () => {
  let app: INestApplication;
  let patientId: string;
  let exposure: string;
  let triggerMealId: string;
  let triggerPosition: number;
  let defaultOptionId: string;
  let heavierOptionId: string;
  let foreignOptionId: string; // opção de OUTRA refeição (pra testar 422)

  beforeAll(async () => {
    const [pat] = await db
      .select({ id: schema.patient.id, exposure: schema.patient.exposure })
      .from(schema.patient)
      .limit(1);
    patientId = pat.id;
    exposure = pat.exposure;

    const [pln] = await db
      .select({ id: schema.plan.id })
      .from(schema.plan)
      .where(
        and(
          eq(schema.plan.patientId, patientId),
          eq(schema.plan.isActive, true),
        ),
      )
      .limit(1);
    const weekday = new Date().getDay();
    const [sched] = await db
      .select({ dayTypeId: schema.daySchedule.dayTypeId })
      .from(schema.daySchedule)
      .where(
        and(
          eq(schema.daySchedule.planId, pln.id),
          eq(schema.daySchedule.weekday, weekday),
        ),
      )
      .limit(1);

    const meals = await db
      .select({ id: schema.meal.id, position: schema.meal.position })
      .from(schema.meal)
      .where(eq(schema.meal.dayTypeId, sched.dayTypeId))
      .orderBy(asc(schema.meal.position));

    // Acha uma refeição com >1 opção (trigger) e uma opção de outra refeição.
    for (const m of meals) {
      const opts = await db
        .select({
          id: schema.mealOption.id,
          isDefault: schema.mealOption.isDefault,
        })
        .from(schema.mealOption)
        .where(eq(schema.mealOption.mealId, m.id));
      if (!triggerMealId && opts.length > 1) {
        triggerMealId = m.id;
        triggerPosition = m.position;
        defaultOptionId = (opts.find((o) => o.isDefault) ?? opts[0]).id;
        heavierOptionId = opts.find((o) => !o.isDefault)!.id;
      } else if (!foreignOptionId && opts[0]) {
        foreignOptionId = opts[0].id;
      }
    }

    const moduleRef = await Test.createTestingModule({
      imports: [RebalanceModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    // Só fecha a app desta suíte; o `pool` (módulo @bamboo/db) é COMPARTILHADO
    // com a suíte US1-registro abaixo (mesmo arquivo/processo). O pool.end()
    // único migrou para o afterAll da última suíte.
    await app?.close();
  });

  it('opção igual à default → sem-acao (cabe na faixa)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/patients/${patientId}/rebalance/option-choice`)
      .send({ triggerMealId, chosenOptionId: defaultOptionId })
      .expect(200);
    expect(res.body.outcome.kind).toBe('sem-acao');
  });

  it('opção mais pesada → rebalanceado (seguintes) ou recusa-orientada (200, nunca barra)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/patients/${patientId}/rebalance/option-choice`)
      .send({ triggerMealId, chosenOptionId: heavierOptionId })
      .expect(200);

    const outcome = res.body.outcome;
    expect(['rebalanceado', 'recusa-orientada']).toContain(outcome.kind);

    if (outcome.kind === 'rebalanceado') {
      expect(Array.isArray(outcome.refeicoesAfetadas)).toBe(true);
      for (const r of outcome.refeicoesAfetadas as Array<{
        position: number;
        itensAjustados: Array<{
          food: { id: string; name: string };
          gramasNovo: number;
        }>;
      }>) {
        expect(r.position).not.toBe(triggerPosition); // qualquer refeição não-gatilho (não registrada)
        for (const it of r.itensAjustados) {
          expect(typeof it.food.name).toBe('string');
          expect(it.gramasNovo).toBeGreaterThan(0);
        }
      }
      // exposição = macros → totalDepois traz macros, sem kcal cheio.
      if (exposure === 'macros') {
        expect(typeof outcome.totalDepois.carb).toBe('number');
        expect(outcome.totalDepois.kcal).toBeUndefined();
      }
    } else {
      expect(['estoura-piso', 'sem-alavanca']).toContain(outcome.motivo);
      expect(typeof outcome.mensagem).toBe('string');
    }
  });

  it('opção que não pertence à refeição do gatilho → 422', async () => {
    await request(app.getHttpServer())
      .post(`/patients/${patientId}/rebalance/option-choice`)
      .send({ triggerMealId, chosenOptionId: foreignOptionId })
      .expect(422);
  });

  it('paciente inexistente → 404', async () => {
    await request(app.getHttpServer())
      .post(
        `/patients/00000000-0000-0000-0000-000000000000/rebalance/option-choice`,
      )
      .send({ triggerMealId, chosenOptionId: defaultOptionId })
      .expect(404);
  });

  it('corpo inválido (triggerMealId não-uuid) → 400', async () => {
    await request(app.getHttpServer())
      .post(`/patients/${patientId}/rebalance/option-choice`)
      .send({ triggerMealId: 'nope', chosenOptionId: defaultOptionId })
      .expect(400);
  });

  it('patientId não-uuid → 400 (ParseUUIDPipe na borda)', async () => {
    await request(app.getHttpServer())
      .post(`/patients/not-a-uuid/rebalance/option-choice`)
      .send({ triggerMealId, chosenOptionId: defaultOptionId })
      .expect(400);
  });
});

// e2e US1 (Fase 4, test-first) — "não recalcular o que já foi feito".
// A casca lê o registro do dia (helper registro-consumo): refeição registrada
// (≠ gatilho) entra no totalAtual com o CONSUMO REAL, mas SAI das alavancas
// (isRegistered:true → o motor não a ajusta). SC-001/FR-001/002/003/004.
//
// Importa RegistroModule (cria o consumo via POST /registro) + RebalanceModule.
// Isolamento append-only: cada caso DESFAZ (intent:'desfazer') o que registrou
// num try/finally — eventos são append-only no banco e poluiriam as vizinhas.
// Esta é a ÚLTIMA suíte do arquivo → o pool.end() único vive no seu afterAll.
describe('POST .../rebalance/option-choice (US1 Fase 4) — não recalcula o registrado', () => {
  let app: INestApplication;
  let patientId: string;
  let triggerMealId: string;
  let triggerPosition: number;
  let heavierOptionId: string;
  let priorMealId: string; // refeição de posição MENOR que o gatilho (registrável)
  let priorPosition: number;
  let allMealIds: string[]; // todas as refeições do dia (ordem por position)

  beforeAll(async () => {
    const [pat] = await db
      .select({ id: schema.patient.id })
      .from(schema.patient)
      .limit(1);
    patientId = pat.id;

    const [pln] = await db
      .select({ id: schema.plan.id })
      .from(schema.plan)
      .where(
        and(
          eq(schema.plan.patientId, patientId),
          eq(schema.plan.isActive, true),
        ),
      )
      .limit(1);
    const weekday = new Date().getDay();
    const [sched] = await db
      .select({ dayTypeId: schema.daySchedule.dayTypeId })
      .from(schema.daySchedule)
      .where(
        and(
          eq(schema.daySchedule.planId, pln.id),
          eq(schema.daySchedule.weekday, weekday),
        ),
      )
      .limit(1);

    const meals = await db
      .select({ id: schema.meal.id, position: schema.meal.position })
      .from(schema.meal)
      .where(eq(schema.meal.dayTypeId, sched.dayTypeId))
      .orderBy(asc(schema.meal.position));
    allMealIds = meals.map((m) => m.id);

    // Gatilho = refeição com >1 opção (Almoço, position 2 no seed). heavier =
    // a opção NÃO-default (mais pesada → desequilibra → dispara rebalanceamento).
    for (const m of meals) {
      const opts = await db
        .select({
          id: schema.mealOption.id,
          isDefault: schema.mealOption.isDefault,
        })
        .from(schema.mealOption)
        .where(eq(schema.mealOption.mealId, m.id));
      if (opts.length > 1) {
        triggerMealId = m.id;
        triggerPosition = m.position;
        heavierOptionId = opts.find((o) => !o.isDefault)!.id;
        break;
      }
    }
    if (!triggerMealId) throw new Error('seed sem refeição com >1 opção');

    // Refeição ANTERIOR ao gatilho (position menor) — alvo do registro.
    const prior = meals.find((m) => m.position < triggerPosition);
    if (!prior) throw new Error('seed sem refeição anterior ao gatilho');
    priorMealId = prior.id;
    priorPosition = prior.position;

    const moduleRef = await Test.createTestingModule({
      imports: [RebalanceModule, RegistroModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    // pool.end() único do arquivo: esta é a última suíte do e2e-spec.
    await pool.end();
  });

  const registrar = (mealId: string, intent: 'feito' | 'pulei' | 'desfazer') =>
    request(app.getHttpServer())
      .post(`/patients/${patientId}/registro`)
      .send({ mealId, intent })
      .expect(200);

  const optionChoice = () =>
    request(app.getHttpServer())
      .post(`/patients/${patientId}/rebalance/option-choice`)
      .send({ triggerMealId, chosenOptionId: heavierOptionId })
      .expect(200);

  type Afetada = { position: number; itensAjustados: unknown[] };
  const positionsAfetadas = (body: {
    outcome: { kind: string; refeicoesAfetadas?: Afetada[] };
  }): number[] =>
    body.outcome.kind === 'rebalanceado'
      ? (body.outcome.refeicoesAfetadas ?? []).map((r) => r.position)
      : [];

  it('SC-001 / FR-001/002: refeição ANTERIOR registrada como feito não aparece nos ajustes', async () => {
    try {
      await registrar(priorMealId, 'feito');

      const res = await optionChoice();
      const positions = positionsAfetadas(res.body);

      // a registrada (anterior) NÃO está entre as afetadas (fica intacta).
      expect(positions).not.toContain(priorPosition);
      // o gatilho nunca é alavanca (a escolha o fixou).
      expect(positions).not.toContain(triggerPosition);
    } finally {
      await registrar(priorMealId, 'desfazer');
    }
  });

  it('FR-003 desfazer: registrada sai das alavancas; após desfazer, volta a poder ser alavanca', async () => {
    // 1) registra a anterior e captura que ela NÃO é alavanca.
    await registrar(priorMealId, 'feito');
    const comRegistro = positionsAfetadas((await optionChoice()).body);
    expect(comRegistro).not.toContain(priorPosition);

    // 2) desfaz e captura que ela VOLTA a poder ser alavanca.
    await registrar(priorMealId, 'desfazer');
    const semRegistro = positionsAfetadas((await optionChoice()).body);

    // Diferença observável: a refeição anterior é alavanca de novo. (Ela tem
    // item flexível com grupo no seed → entra como alavanca quando há excesso.)
    expect(semRegistro).toContain(priorPosition);
    expect(semRegistro).not.toEqual(comRegistro);
  });

  it('FR-004 recusa: todas as refeições do dia MENOS o gatilho registradas → sem-alavanca', async () => {
    const outras = allMealIds.filter((id) => id !== triggerMealId);
    try {
      for (const id of outras) await registrar(id, 'feito');

      const res = await optionChoice();
      expect(res.body.outcome.kind).toBe('recusa-orientada');
      expect(res.body.outcome.motivo).toBe('sem-alavanca');
      expect(typeof res.body.outcome.mensagem).toBe('string');
      expect(res.body.outcome.mensagem.length).toBeGreaterThan(0);
    } finally {
      for (const id of outras) await registrar(id, 'desfazer');
    }
  });
});

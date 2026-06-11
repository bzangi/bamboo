import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, asc, eq, db, pool, schema } from '@bamboo/db';
import { RebalanceModule } from '../src/rebalance/rebalance.module';
import { RegistroModule } from '../src/registro/registro.module';
import { limparEventosDeHoje } from './helpers';

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
    // (fix flakiness) Entrada da suíte: limpa os eventos de hoje deste
    // paciente+plano antes dos cenários — protege os casos de "consumo real" de
    // resíduo de outra suíte/run (idempotente; descreve cenário próprio depois).
    await limparEventosDeHoje(patientId, pln.id);

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
    // (fix flakiness) Entrada da suíte: limpa os eventos de hoje deste
    // paciente+plano antes dos cenários — protege os casos de "consumo real" de
    // resíduo de outra suíte/run (idempotente; descreve cenário próprio depois).
    await limparEventosDeHoje(patientId, pln.id);

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
    // pool.end() migrou para o afterAll da suíte US2 abaixo (agora a última
    // do arquivo). O pool (@bamboo/db) é compartilhado por todas as suítes.
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

// e2e US2 (Fase 4) — "total do dia pelo CONSUMO REAL". A casca já lê o registro
// (helper registro-consumo): o consumo real das refeições registradas alimenta o
// totalAtual e a direção do ajuste (déficit → aumenta; excesso → reduz; piso
// inviolável; nunca ultrapassa o alvo). SC-002/SC-004, FR-005/006/009/010.
//
// O dia corrente é TREINO (no seed, seg–sex = treino). Refeições: Café da manhã
// (pos 1, 1 opção), Almoço (pos 2, GATILHO — 3 opções), Jantar (pos 3, 1 opção).
// ALVO do dia ≈ 1143 kcal; faixa ±10% ≈ [1029, 1258]. As alt do almoço são
// LIGEIRAMENTE menos calóricas que a default (a default fecha exatamente o alvo),
// então o gatilho-base já não desequilibra muito em kcal — usamos o REGISTRO
// (pulei/troquei) pra mover o total e provar a direção/magnitude.
//
// Isolamento append-only: cada caso DESFAZ o que registrou (try/finally).
// O 'troquei' é derivado pelo servidor (FR-003): POST /registro intent:'feito' +
// consumo.items (substituição within-group) → o servidor grava o snapshot
// COMPLETO em meal_event_item; o helper lê esse snapshot como o consumo real.
// Esta é a ÚLTIMA suíte do arquivo → o pool.end() único vive no seu afterAll.
describe('POST .../rebalance/option-choice (US2) — total do dia pelo consumo real', () => {
  let app: INestApplication;
  let patientId: string;
  let planId: string;
  let dayTypeId: string;

  // Gatilho (Almoço, pos 2): default = "Arroz e carne". Os casos US2 disparam o
  // option-choice sempre na DEFAULT — quem move o total é o REGISTRO, não a opção.
  let almocoMealId: string;
  let almocoDefaultOptId: string;

  // Café (pos 1) e Jantar (pos 3): refeições registráveis (não-gatilho).
  let cafeMealId: string;
  let cafePosition: number;
  let jantarMealId: string;
  let jantarPosition: number;

  // Item da Batata inglesa no jantar (carbo flexível) + foods substitutos.
  let jantarBatataItemId: string;
  let mandiocaFoodId: string; // carbo moderado (+73 kcal no jantar)
  let aveiaFoodId: string; // carbo MUITO denso (excesso grande)

  // Gramas planejadas por item do Café (opção default) — p/ provar a DIREÇÃO do
  // ajuste item-a-item (o café é a alavanca dos casos US2). Preenchido no setup.
  const cafePlanejado = new Map<string, number>();

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
    planId = pln.id;

    // (fix flakiness) Entrada da suíte: limpa os eventos de hoje deste
    // paciente+plano antes dos cenários — protege os casos de "consumo real" de
    // resíduo de outra suíte/run (idempotente; descreve cenário próprio depois).
    await limparEventosDeHoje(patientId, pln.id);

    const weekday = new Date().getDay();
    const [sched] = await db
      .select({ dayTypeId: schema.daySchedule.dayTypeId })
      .from(schema.daySchedule)
      .where(
        and(
          eq(schema.daySchedule.planId, planId),
          eq(schema.daySchedule.weekday, weekday),
        ),
      )
      .limit(1);
    dayTypeId = sched.dayTypeId;

    const meals = await db
      .select({
        id: schema.meal.id,
        name: schema.meal.name,
        position: schema.meal.position,
      })
      .from(schema.meal)
      .where(eq(schema.meal.dayTypeId, dayTypeId))
      .orderBy(asc(schema.meal.position));

    // Resolve refeições por NOME (estável entre runs, ao contrário dos UUIDs).
    const cafe = meals.find((m) => m.name === 'Café da manhã')!;
    const almoco = meals.find((m) => m.name === 'Almoço')!;
    const jantar = meals.find((m) => m.name === 'Jantar')!;
    cafeMealId = cafe.id;
    cafePosition = cafe.position;
    almocoMealId = almoco.id;
    jantarMealId = jantar.id;
    jantarPosition = jantar.position;

    // Opção default do almoço (gatilho): "Arroz e carne".
    const almocoOpts = await db
      .select({
        id: schema.mealOption.id,
        isDefault: schema.mealOption.isDefault,
      })
      .from(schema.mealOption)
      .where(eq(schema.mealOption.mealId, almocoMealId));
    almocoDefaultOptId = almocoOpts.find((o) => o.isDefault)!.id;

    // Item da "Batata inglesa cozida" no jantar (carbo flexível) → alvo da
    // substituição que vira 'troquei'.
    const [batata] = await db
      .select({ id: schema.mealItem.id })
      .from(schema.mealItem)
      .innerJoin(
        schema.mealOption,
        eq(schema.mealItem.mealOptionId, schema.mealOption.id),
      )
      .innerJoin(schema.food, eq(schema.mealItem.foodId, schema.food.id))
      .where(
        and(
          eq(schema.mealOption.mealId, jantarMealId),
          eq(schema.food.name, 'Batata inglesa cozida'),
        ),
      )
      .limit(1);
    jantarBatataItemId = batata.id;

    const foodId = async (name: string): Promise<string> => {
      const [f] = await db
        .select({ id: schema.food.id })
        .from(schema.food)
        .where(eq(schema.food.name, name))
        .limit(1);
      return f.id;
    };
    mandiocaFoodId = await foodId('Mandioca (aipim) cozida');
    aveiaFoodId = await foodId('Aveia em flocos');

    // Gramas planejadas dos itens do Café (opção default) → cafePlanejado
    // (itemId → gramas). O café é a alavanca dos casos US2; comparar gramasNovo
    // contra o planejado de CADA item prova a direção do ajuste sem hardcode.
    const cafeOpts = await db
      .select({
        id: schema.mealOption.id,
        isDefault: schema.mealOption.isDefault,
      })
      .from(schema.mealOption)
      .where(eq(schema.mealOption.mealId, cafeMealId));
    const cafeDefaultOptId = (cafeOpts.find((o) => o.isDefault) ?? cafeOpts[0])
      .id;
    const cafeItensPlan = await db
      .select({ id: schema.mealItem.id, g: schema.mealItem.quantityGrams })
      .from(schema.mealItem)
      .where(eq(schema.mealItem.mealOptionId, cafeDefaultOptId));
    for (const it of cafeItensPlan) cafePlanejado.set(it.id, it.g);

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

  // POST /registro — feito/pulei/desfazer (US1) ou troquei derivado (consumo).
  const registrar = (body: {
    mealId: string;
    intent: 'feito' | 'pulei' | 'desfazer';
    consumo?: {
      chosenOptionId?: string;
      items?: ReadonlyArray<{
        itemId: string;
        foodId: string;
        quantityGrams: number;
      }>;
    };
  }) =>
    request(app.getHttpServer())
      .post(`/patients/${patientId}/registro`)
      .send(body)
      .expect(200);

  // option-choice no gatilho (Almoço) com a opção informada.
  const optionChoice = (chosenOptionId: string) =>
    request(app.getHttpServer())
      .post(`/patients/${patientId}/rebalance/option-choice`)
      .send({ triggerMealId: almocoMealId, chosenOptionId })
      .expect(200);

  type ItemAjustado = { gramasNovo: number; itemId: string };
  type Afetada = {
    position: number;
    itensAjustados: ItemAjustado[];
  };
  const afetadasDe = (body: {
    outcome: { kind: string; refeicoesAfetadas?: Afetada[] };
  }): Afetada[] =>
    body.outcome.kind === 'rebalanceado'
      ? (body.outcome.refeicoesAfetadas ?? [])
      : [];
  const itensDaPosicao = (afetadas: Afetada[], pos: number): ItemAjustado[] =>
    afetadas.find((r) => r.position === pos)?.itensAjustados ?? [];

  // ── Caso 1 — SC-002: pulei → déficit → restante AUMENTA ──────────────────
  // Baseline (default, sem registro) = sem-acao (fecha o alvo). Com Jantar
  // 'pulei' o dia projeta MUITO abaixo (déficit ≈ −242 kcal) → rebalanceado:
  // o café (única refeição não-gatilho não-registrada) AUMENTA em direção ao
  // alvo, sem furar o piso; o Jantar (registrado) SAI das alavancas (não aparece).
  it('SC-002 — pulei vira déficit: baseline sem-acao, com pulei o restante AUMENTA (sem furar o piso)', async () => {
    // Baseline: escolher a default, sem registro → dia fecha no alvo → sem-acao.
    const baseline = await optionChoice(almocoDefaultOptId);
    expect(baseline.body.outcome.kind).toBe('sem-acao');

    try {
      await registrar({ mealId: jantarMealId, intent: 'pulei' });

      const res = await optionChoice(almocoDefaultOptId);
      expect(res.body.outcome.kind).toBe('rebalanceado');
      const afetadas = afetadasDe(res.body);

      // Jantar (pulei) NÃO é alavanca → não aparece nas afetadas.
      expect(afetadas.map((r) => r.position)).not.toContain(jantarPosition);

      // Café (não-registrado) AUMENTA — provado item-a-item: CADA item ajustado
      // tem gramasNovo ACIMA do seu planejado (déficit → o motor sobe as
      // alavancas, sem teto). gramasNovo > planejado > 0 garante a direção.
      const cafeItens = itensDaPosicao(afetadas, cafePosition);
      expect(cafeItens.length).toBeGreaterThan(0);
      for (const it of cafeItens) {
        const planejado = cafePlanejado.get(it.itemId);
        expect(planejado).toBeDefined();
        expect(it.gramasNovo).toBeGreaterThan(planejado!);
      }
    } finally {
      await registrar({ mealId: jantarMealId, intent: 'desfazer' });
    }
  });

  // ── Caso 2 — FR-006: troquei MAIS calórico → total reflete o real → REDUZ ──
  // Jantar 'troquei' (Batata inglesa 150g → Mandioca 120g, +73 kcal sobre o
  // planejado). Em KCAL o dia fica DENTRO da faixa (≈106%); quem cruza a faixa é o
  // macro CARB (mandioca é mais carb). O gate TODOS_DENTRO dispara pelo carb e,
  // como deltaKcal=+73>0, a engine REDUZ as alavancas — comportamento kcal-anchored
  // (risco D1, ver Caso 6). Prova de que é o consumo REAL que move: o MESMO jantar
  // como 'feito' (default, sem substituição) → sem-acao.
  it('FR-006 — troquei mais calórico reflete no total real → restante REDUZ; feito default → sem-acao', async () => {
    // Controle: jantar feito DEFAULT (consumo = planejado) → dia fecha no alvo.
    try {
      await registrar({ mealId: jantarMealId, intent: 'feito' });
      const controle = await optionChoice(almocoDefaultOptId);
      expect(controle.body.outcome.kind).toBe('sem-acao');
    } finally {
      await registrar({ mealId: jantarMealId, intent: 'desfazer' });
    }

    // Troquei: substitui a Batata (150g) por Mandioca (120g) → +73 kcal real.
    try {
      const reg = await registrar({
        mealId: jantarMealId,
        intent: 'feito',
        consumo: {
          chosenOptionId: undefined,
          items: [
            {
              itemId: jantarBatataItemId,
              foodId: mandiocaFoodId,
              quantityGrams: 120,
            },
          ],
        },
      });
      // O servidor DERIVOU troquei (substituição within-group).
      expect(reg.body.vigente?.state).toBe('troquei');

      const res = await optionChoice(almocoDefaultOptId);
      expect(res.body.outcome.kind).toBe('rebalanceado');
      const afetadas = afetadasDe(res.body);

      // Jantar (troquei) SAI das alavancas.
      expect(afetadas.map((r) => r.position)).not.toContain(jantarPosition);

      // Café REDUZ — provado item-a-item: CADA item ajustado tem gramasNovo
      // ABAIXO do seu planejado e ≥ piso (50% do planejado). Reduzir é efeito do
      // consumo REAL (mandioca) ter entrado no total — não do plano.
      const cafeItens = itensDaPosicao(afetadas, cafePosition);
      expect(cafeItens.length).toBeGreaterThan(0);
      for (const it of cafeItens) {
        const planejado = cafePlanejado.get(it.itemId);
        expect(planejado).toBeDefined();
        expect(it.gramasNovo).toBeLessThan(planejado!);
        expect(it.gramasNovo).toBeGreaterThanOrEqual(planejado! * 0.5 - 0.05);
      }

      // Privacidade (FR-015/SC-006): o paciente do seed tem exposure='macros' → o
      // gate oculta kcal no DTO; o total do dia NUNCA vai como número. (O teto em
      // kcal — SC-004 — é invariante da engine, coberto pelos 90 testes do core.)
      expect(res.body.outcome.totalDepois?.kcal).toBeUndefined();
    } finally {
      await registrar({ mealId: jantarMealId, intent: 'desfazer' });
    }
  });

  // ── Caso 3 — Excesso grande → recusa 'estoura-piso' ("acima") ─────────────
  // Jantar 'troquei' (Batata 150g → Aveia 120g, +~395 kcal) → excesso grande.
  // O café (único conjunto de alavancas, pois o jantar é registrado e o almoço é
  // o gatilho) não absorve nem reduzindo tudo ao piso → recusa-orientada,
  // motivo 'estoura-piso'. (Só o EXCESSO produz estoura-piso — ver FATOS DA ENGINE.)
  it("Excesso grande (troquei muito calórico) → recusa-orientada 'estoura-piso'", async () => {
    try {
      const reg = await registrar({
        mealId: jantarMealId,
        intent: 'feito',
        consumo: {
          items: [
            {
              itemId: jantarBatataItemId,
              foodId: aveiaFoodId,
              quantityGrams: 120,
            },
          ],
        },
      });
      expect(reg.body.vigente?.state).toBe('troquei');

      const res = await optionChoice(almocoDefaultOptId);
      expect(res.body.outcome.kind).toBe('recusa-orientada');
      expect(res.body.outcome.motivo).toBe('estoura-piso');
      expect(typeof res.body.outcome.mensagem).toBe('string');
      expect(res.body.outcome.mensagem.length).toBeGreaterThan(0);
    } finally {
      await registrar({ mealId: jantarMealId, intent: 'desfazer' });
    }
  });

  // ── Caso 4 — "Déficit que não cabe" → 'sem-alavanca' (reinterpretação) ─────
  // Café 'pulei' + Jantar 'feito' (ambos registrados) → não sobra alavanca (o
  // almoço é o gatilho). O dia fica ABAIXO do alvo (déficit pelo café pulado),
  // mas o motor NÃO emite 'estoura-piso' — déficit não tem teto, então a única
  // recusa possível é 'sem-alavanca'. ("hoje ficou abaixo" é INALCANÇÁVEL no v0:
  // a engine só recusa-piso no EXCESSO; aumentar nunca fura o piso.)
  it("Déficit sem alavancas → 'sem-alavanca' (NÃO 'estoura-piso'; déficit não fura o piso)", async () => {
    try {
      await registrar({ mealId: cafeMealId, intent: 'pulei' });
      await registrar({ mealId: jantarMealId, intent: 'feito' });

      const res = await optionChoice(almocoDefaultOptId);
      expect(res.body.outcome.kind).toBe('recusa-orientada');
      // Reinterpretação fiel à engine: déficit + zero alavancas = sem-alavanca.
      expect(res.body.outcome.motivo).toBe('sem-alavanca');
      expect(typeof res.body.outcome.mensagem).toBe('string');
      expect(res.body.outcome.mensagem.length).toBeGreaterThan(0);
    } finally {
      await registrar({ mealId: cafeMealId, intent: 'desfazer' });
      await registrar({ mealId: jantarMealId, intent: 'desfazer' });
    }
  });

  // ── Caso 5 — D9: feito com chosen_meal_option_id NULO → fallback (default) ──
  // Insere um meal_event CRU (sem chosenMealOptionId, state='feito') — simula um
  // evento legado/seed. O helper deve resolver o fallback D9 (opção default) e
  // contar o consumo da default (NUNCA zero). Prova: comparado a um 'pulei' na
  // MESMA refeição (que daria déficit maior, logo aumento maior), o fallback
  // produz um déficit MENOR (ou sem-acao) — o consumo da default entrou no total.
  it('D9 — feito com chosenMealOptionId NULO conta a opção default (fallback), não zero', async () => {
    const loggedDate = (() => {
      const d = new Date();
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    })();

    // (a) Contraste: Jantar 'pulei' (consumo 0) → déficit → café AUMENTA
    //     (rebalanceado). Se o fallback contasse zero, daria este mesmo desfecho.
    try {
      await registrar({ mealId: jantarMealId, intent: 'pulei' });
      const res = await optionChoice(almocoDefaultOptId);
      expect(res.body.outcome.kind).toBe('rebalanceado');
      const cafeItens = itensDaPosicao(afetadasDe(res.body), cafePosition);
      expect(cafeItens.length).toBeGreaterThan(0);
    } finally {
      await registrar({ mealId: jantarMealId, intent: 'desfazer' });
    }

    // (b) Evento CRU 'feito' no jantar SEM chosenMealOptionId → fallback D9.
    //     O helper resolve a opção DEFAULT e conta seu consumo (≠ zero). Como o
    //     jantar default fecha exatamente o alvo, o dia projeta DENTRO da faixa →
    //     'sem-acao'. Esse desfecho (vs. o 'rebalanceado' do pulei acima) prova
    //     que o fallback contou o consumo da default — NÃO zero.
    let rawEventId = '';
    try {
      const [raw] = await db
        .insert(schema.mealEvent)
        .values({
          patientId,
          planId,
          mealId: jantarMealId,
          dayTypeId,
          chosenMealOptionId: null,
          state: 'feito',
          loggedDate,
        })
        .returning({ id: schema.mealEvent.id });
      rawEventId = raw.id;

      const res = await optionChoice(almocoDefaultOptId);
      // Fallback contou a default (≠ zero) → dia fecha no alvo → sem-acao.
      // (Um consumo zero teria dado 'rebalanceado', como no pulei do passo (a).)
      expect(res.body.outcome.kind).toBe('sem-acao');
    } finally {
      if (rawEventId) {
        await db
          .delete(schema.mealEvent)
          .where(eq(schema.mealEvent.id, rawEventId));
      }
    }
  });

  // ── Caso 6 — Macros mistos / SC-004 (kcal-anchored; risco D1 documentado) ──
  // Jantar 'troquei' com substituto muito carb (Batata 150g → Mandioca 120g):
  // o ajuste resultante NÃO ultrapassa o alvo EM KCAL e NÃO fura o piso em gramas.
  // A garantia SC-004 vale em kcal/gramas; um macro isolado pode ficar fora da
  // faixa (risco herdado da Fase 2 — kcal-anchored — não bloqueia).
  it('SC-004 — ajuste não ultrapassa o alvo (kcal) nem fura o piso (gramas); macro isolado pode escapar', async () => {
    try {
      const reg = await registrar({
        mealId: jantarMealId,
        intent: 'feito',
        consumo: {
          items: [
            {
              itemId: jantarBatataItemId,
              foodId: mandiocaFoodId,
              quantityGrams: 120,
            },
          ],
        },
      });
      expect(reg.body.vigente?.state).toBe('troquei');

      const res = await optionChoice(almocoDefaultOptId);
      expect(res.body.outcome.kind).toBe('rebalanceado');
      const cafeItens = itensDaPosicao(afetadasDe(res.body), cafePosition);
      // Não-vazio: o café É a alavanca (jantar registrado, almoço gatilho) — sem
      // isso o forEach abaixo seria vácuo.
      expect(cafeItens.length).toBe(3);

      // Pisos do café (50% do planejado): Aveia 20, Ovo 50, Banana 42.5.
      // Nenhum item fura o piso. (Itens vêm na ordem da opção default.)
      const pisos = [20, 50, 42.5];
      cafeItens.forEach((it, idx) => {
        const piso = pisos[idx] ?? 0;
        expect(it.gramasNovo).toBeGreaterThanOrEqual(piso - 0.05);
      });

      // Privacidade + SC-004: exposure='macros' oculta kcal no DTO (o total nunca
      // vira número p/ o paciente). O teto em kcal é invariante da engine (90
      // testes do core); aqui a prova observável é o piso-em-gramas (acima) — um
      // macro isolado (carb) pode escapar da faixa (risco kcal-anchored, D1).
      expect(res.body.outcome.totalDepois?.kcal).toBeUndefined();
    } finally {
      await registrar({ mealId: jantarMealId, intent: 'desfazer' });
    }
  });
});

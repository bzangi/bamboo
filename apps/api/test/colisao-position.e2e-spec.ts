import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { eq, gt, inArray, db, schema } from '@bamboo/db';
import { CicloModule } from '../src/ciclo/ciclo.module';
import { PlanModule } from '../src/plan/plan.module';
import { RebalanceModule } from '../src/rebalance/rebalance.module';
import { RelatorioModule } from '../src/relatorio/relatorio.module';

// e2e de CARACTERIZAÇÃO do KI-002 — o "teste de colisão" que o ADR-0001 exige
// como precondição para reabrir a decisão da chave de pareamento sob override.
//
// ⚠️ NADA AQUI É O COMPORTAMENTO DESEJADO. Este arquivo pina o comportamento
// ATUAL, incluindo os bugs, para que a eventual correção tenha um oráculo e para
// que a suíte pare de ser cega ao eixo "dois tipos-de-dia com mesma position"
// (hoje `relatorio.e2e` tem 1 tipo-de-dia e `adesao.e2e` só o plano ativo).
// Quando a decisão de produto vier, as asserções marcadas **[BUG]** devem ser
// invertidas de propósito — falhar aqui é o sinal de que a correção pegou.
//
// O repro publicado no KI-002 (`docs/known-issues.md`) NÃO demonstra o Sintoma A:
// ele registra `pulei` também na pos 2 do tipo exibido, que casa por `mealId`,
// sai das alavancas e mascara o efeito. O repro limpo é **um único** registro
// sob override, e é o que os testes abaixo fazem.
//
// Self-contained (lição a2894f3/KI-001): paciente-cenário próprio, cleanup total
// em ordem reversa de FK. Não chama `pool.end()` (pool singleton).

const NUTRI_KEY = 'test-nutri-key';
process.env.NUTRI_API_KEY = NUTRI_KEY;

const isoDaysAgo = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
};
const HOJE = isoDaysAgo(0);

let app: INestApplication;
let patientId: string;
let planId: string;
let cycleId: string;

// Tipo A = programado em todo weekday (o "dia real"). Tipo B = alvo do override.
let dtAId: string;
let dtBId: string;
const mealAPorPos = new Map<number, string>();
const mealBPorPos = new Map<number, string>();
const optDefaultAPorPos = new Map<number, string>();
const optDefaultBPorPos = new Map<number, string>();
let optAltA2Id: string; // opção NÃO-default da pos 2 do tipo A — o gatilho

const optionIds: string[] = [];
const mealIds: string[] = [];
const dayTypeIds: string[] = [];
const eventIdsEfemeros: string[] = [];

const nutriGet = (path: string) =>
  request(app.getHttpServer()).get(path).set('x-nutri-key', NUTRI_KEY);

const postOptionChoice = (triggerMealId: string, chosenOptionId: string) =>
  request(app.getHttpServer())
    .post(`/patients/${patientId}/rebalance/option-choice`)
    .send({ triggerMealId, chosenOptionId });

// Insere um evento de registro e devolve o id (registrado para cleanup).
const registrar = async (args: {
  mealId: string;
  dayTypeId: string;
  state: 'feito' | 'pulei';
  chosenMealOptionId: string | null;
  hora: string;
}): Promise<string> => {
  const [ev] = await db
    .insert(schema.mealEvent)
    .values({
      patientId,
      planId,
      mealId: args.mealId,
      dayTypeId: args.dayTypeId,
      chosenMealOptionId: args.chosenMealOptionId,
      state: args.state,
      loggedDate: HOJE,
      createdAt: new Date(`${HOJE}T${args.hora}`),
    })
    .returning({ id: schema.mealEvent.id });
  eventIdsEfemeros.push(ev.id);
  return ev.id;
};

beforeAll(async () => {
  const [n] = await db
    .select({ id: schema.nutritionist.id })
    .from(schema.nutritionist)
    .limit(1);
  const [food] = await db
    .select({ id: schema.food.id })
    .from(schema.food)
    .where(gt(schema.food.kcalPer100g, 200))
    .limit(1);
  // Grupo qualquer: o motor só exige `groupId != null` + `isLocked: false` para
  // o item ser alavanca; não consulta pertinência de grupo (isso é substituição).
  const [grupo] = await db
    .select({ id: schema.substitutionGroup.id })
    .from(schema.substitutionGroup)
    .limit(1);

  const [pat] = await db
    .insert(schema.patient)
    .values({
      nutritionistId: n.id,
      name: 'Cenário Colisão (e2e KI-002)',
      exposure: 'full_kcal',
    })
    .returning({ id: schema.patient.id });
  patientId = pat.id;

  const [pln] = await db
    .insert(schema.plan)
    .values({ patientId, name: 'Plano (e2e KI-002)', isActive: true })
    .returning({ id: schema.plan.id });
  planId = pln.id;

  const [dtA, dtB] = await db
    .insert(schema.dayType)
    .values([
      { planId, name: 'A (programado)' },
      { planId, name: 'B (override)' },
    ])
    .returning({ id: schema.dayType.id });
  dtAId = dtA.id;
  dtBId = dtB.id;
  dayTypeIds.push(dtAId, dtBId);

  // Positions 1..3 nos DOIS tipos — é a colisão que a suíte nunca montou.
  const meals = await db
    .insert(schema.meal)
    .values([
      { dayTypeId: dtAId, name: 'A pos1', position: 1 },
      { dayTypeId: dtAId, name: 'A pos2', position: 2 },
      { dayTypeId: dtAId, name: 'A pos3', position: 3 },
      { dayTypeId: dtBId, name: 'B pos1', position: 1 },
      { dayTypeId: dtBId, name: 'B pos2', position: 2 },
      { dayTypeId: dtBId, name: 'B pos3', position: 3 },
    ])
    .returning({
      id: schema.meal.id,
      dayTypeId: schema.meal.dayTypeId,
      position: schema.meal.position,
    });
  mealIds.push(...meals.map((m) => m.id));
  for (const m of meals) {
    (m.dayTypeId === dtAId ? mealAPorPos : mealBPorPos).set(m.position, m.id);
  }

  // Uma opção default por refeição + uma ALTERNATIVA mais pesada na pos 2 do
  // tipo A. A gramatura da alternativa é calibrada (160g vs 100g) para o desvio
  // cair na janela em que o motor devolve `rebalanceado`: com alvo de 300g,
  // tolerância 10% (faixa 270–330) e piso 50%, o excesso de 60g sai da faixa
  // (>30) e cabe nas 2 alavancas restantes (200g, podem encolher 100g no total).
  // 300g daria `recusa-orientada`, cujo corpo NÃO depende do consumo — e aí as
  // comparações abaixo passariam por vacuidade, sem poder de detecção.
  const opcoes = await db
    .insert(schema.mealOption)
    .values([
      ...meals.map((m) => ({ mealId: m.id, label: 'Padrão', isDefault: true })),
      {
        mealId: mealAPorPos.get(2)!,
        label: 'Alternativa pesada',
        isDefault: false,
      },
    ])
    .returning({
      id: schema.mealOption.id,
      mealId: schema.mealOption.mealId,
      isDefault: schema.mealOption.isDefault,
    });
  optionIds.push(...opcoes.map((o) => o.id));
  for (const o of opcoes) {
    if (!o.isDefault) {
      optAltA2Id = o.id;
      continue;
    }
    for (const [pos, mealId] of mealAPorPos) {
      if (o.mealId === mealId) optDefaultAPorPos.set(pos, o.id);
    }
    for (const [pos, mealId] of mealBPorPos) {
      if (o.mealId === mealId) optDefaultBPorPos.set(pos, o.id);
    }
  }

  await db.insert(schema.mealItem).values([
    ...opcoes
      .filter((o) => o.isDefault)
      .map((o) => ({
        mealOptionId: o.id,
        foodId: food.id,
        quantityGrams: 100,
        isLocked: false,
        substitutionGroupId: grupo.id,
      })),
    {
      mealOptionId: optAltA2Id,
      foodId: food.id,
      quantityGrams: 160, // ver a calibração no comentário acima
      isLocked: false,
      substitutionGroupId: grupo.id,
    },
  ]);

  // Tipo A programado em TODO weekday — cenário independente do calendário.
  await db.insert(schema.daySchedule).values(
    [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      planId,
      weekday,
      dayTypeId: dtAId,
    })),
  );

  const [cy] = await db
    .insert(schema.cycle)
    .values({
      patientId,
      startedOn: isoDaysAgo(3),
      closedOn: null,
      expectedDurationDays: 30,
    })
    .returning({ id: schema.cycle.id });
  cycleId = cy.id;
  await db.insert(schema.cyclePlanVigencia).values({
    cycleId,
    planId,
    validFrom: isoDaysAgo(3),
    validTo: null,
  });

  const moduleRef = await Test.createTestingModule({
    imports: [PlanModule, RebalanceModule, CicloModule, RelatorioModule],
  }).compile();
  app = moduleRef.createNestApplication();
  await app.init();
});

// Cada teste monta seus próprios eventos e os remove — a ordem dos testes não
// pode importar (o motor lê o registro, então evento vazado muda resultado).
afterEach(async () => {
  if (eventIdsEfemeros.length === 0) return;
  await db
    .delete(schema.mealEventItem)
    .where(inArray(schema.mealEventItem.mealEventId, eventIdsEfemeros));
  await db
    .delete(schema.mealEvent)
    .where(inArray(schema.mealEvent.id, eventIdsEfemeros));
  eventIdsEfemeros.length = 0;
});

afterAll(async () => {
  if (cycleId) {
    await db
      .delete(schema.cyclePlanVigencia)
      .where(eq(schema.cyclePlanVigencia.cycleId, cycleId));
    await db.delete(schema.cycle).where(eq(schema.cycle.id, cycleId));
  }
  if (optionIds.length > 0) {
    await db
      .delete(schema.mealItem)
      .where(inArray(schema.mealItem.mealOptionId, optionIds));
    await db
      .delete(schema.mealOption)
      .where(inArray(schema.mealOption.id, optionIds));
  }
  if (mealIds.length > 0) {
    await db.delete(schema.meal).where(inArray(schema.meal.id, mealIds));
  }
  if (planId) {
    await db
      .delete(schema.daySchedule)
      .where(eq(schema.daySchedule.planId, planId));
  }
  if (dayTypeIds.length > 0) {
    await db
      .delete(schema.dayType)
      .where(inArray(schema.dayType.id, dayTypeIds));
  }
  if (planId) {
    await db.delete(schema.plan).where(eq(schema.plan.id, planId));
  }
  if (patientId) {
    await db.delete(schema.patient).where(eq(schema.patient.id, patientId));
  }
  await app?.close();
});

// ───────── o cenário é sensível ao consumo (pré-condição do resto) ─────────

describe('KI-002 pré-condição — o cenário produz rebalanceamento de verdade', () => {
  it('escolher a alternativa pesada da pos 2 rebalanceia (senão o resto não detecta nada)', async () => {
    const res = await postOptionChoice(mealAPorPos.get(2)!, optAltA2Id).expect(
      200,
    );
    // Se este dia ficasse DENTRO da faixa, o outcome seria `sem-acao` e o corpo
    // não dependeria do consumo — as comparações abaixo passariam por vacuidade.
    expect(res.body.outcome.kind).toBe('rebalanceado');
    expect(res.body.outcome.refeicoesAfetadas.length).toBeGreaterThan(0);
  });
});

// ───────── Sintoma A do KI-002, repro limpo ─────────

describe('KI-002 Sintoma A — registro sob override é INVISÍVEL ao rebalanceamento', () => {
  it('[BUG] registro na pos 1 do tipo B não muda NADA na prévia do tipo A', async () => {
    const semRegistro = await postOptionChoice(
      mealAPorPos.get(2)!,
      optAltA2Id,
    ).expect(200);

    // Um único registro, sob override (mealId e dayTypeId ambos do tipo B) —
    // exatamente o que `POST /registro` grava quando o app está com o picker em B.
    await registrar({
      mealId: mealBPorPos.get(1)!,
      dayTypeId: dtBId,
      state: 'pulei',
      chosenMealOptionId: null,
      hora: '08:00:00',
    });

    const comRegistro = await postOptionChoice(
      mealAPorPos.get(2)!,
      optAltA2Id,
    ).expect(200);

    // [BUG] Corpo IDÊNTICO: o motor pareia por `mealId` (rebalance.service.ts:285),
    // o evento tem mealId do tipo B, e o roster é o do tipo A (`:177`) — então a
    // refeição pulada continua alavanca, com grama planejada, e seu consumo real
    // (zero, no caso do `pulei`) não entra no total. Quando a decisão de produto
    // vier e o pareamento virar por `position`, esta asserção DEVE falhar.
    expect(comRegistro.body).toEqual(semRegistro.body);
  });

  it('CONTROLE — registro na pos 1 do tipo A (mesmo position!) muda a prévia', async () => {
    const semRegistro = await postOptionChoice(
      mealAPorPos.get(2)!,
      optAltA2Id,
    ).expect(200);

    await registrar({
      mealId: mealAPorPos.get(1)!, // MESMA position 1, tipo exibido
      dayTypeId: dtAId,
      state: 'pulei',
      chosenMealOptionId: null,
      hora: '08:00:00',
    });

    const comRegistro = await postOptionChoice(
      mealAPorPos.get(2)!,
      optAltA2Id,
    ).expect(200);

    // Prova que o teste TEM poder de detecção: o mesmo fato de domínio ("a
    // refeição da posição 1 foi pulada"), gravado no tipo exibido, muda a
    // resposta. A diferença entre os dois testes é só o tipo-de-dia do evento.
    expect(comRegistro.body).not.toEqual(semRegistro.body);
  });
});

// ───────── o bug NÃO catalogado: a prévia morre sob override ─────────

describe('KI-005 — prévia de rebalanceamento é inalcançável sob override (404)', () => {
  it('[BUG] gatilho numa refeição do tipo B → 404, com ou sem registro', async () => {
    const res = await postOptionChoice(
      mealBPorPos.get(2)!,
      optDefaultBPorPos.get(2)!,
    ).expect(404);
    expect(res.body.message).toBe(
      'refeição do gatilho não está no dia corrente',
    );
  });

  it('[BUG] o app alcança esse estado: os chips de opção não são gateados por override', async () => {
    // `HomeScreen.tsx` renderiza `meal.options.map(...)` sem consultar
    // `overrideActive` (só o desfazer do registro é gateado), e o `triggerMealId`
    // enviado é o `meal.id` do cardápio EXIBIDO. Sob `?dayTypeId=B`, todo
    // `meal.id` da tela é do tipo B — logo todo toque em chip cai no 404 acima.
    const today = await request(app.getHttpServer())
      .get(`/patients/${patientId}/today`)
      .query({ dayTypeId: dtBId })
      .expect(200);

    const mealsExibidas = today.body.meals as { id: string }[];
    expect(mealsExibidas.length).toBeGreaterThan(0);
    // Toda refeição exibida sob override é inalcançável pelo rebalanceamento.
    for (const m of mealsExibidas) {
      expect(
        mealBPorPos.get(1) === m.id ||
          mealBPorPos.get(2) === m.id ||
          mealBPorPos.get(3) === m.id,
      ).toBe(true);
    }
  });
});

// ───────── a divergência na MESMA tela ─────────

describe('KI-002 — /today e o motor discordam sobre o mesmo evento', () => {
  it('[BUG] /today?dayTypeId=A mostra o badge por position; o motor ignora o mesmo evento', async () => {
    await registrar({
      mealId: mealBPorPos.get(1)!,
      dayTypeId: dtBId,
      state: 'pulei',
      chosenMealOptionId: null,
      hora: '08:00:00',
    });

    // `/today` COM override pareia por position (009/FR-002) → o badge aparece
    // na pos 1 do tipo A, mesmo o evento sendo do tipo B.
    const comOverride = await request(app.getHttpServer())
      .get(`/patients/${patientId}/today`)
      .query({ dayTypeId: dtAId })
      .expect(200);
    const porPos = new Map(
      (comOverride.body.meals as { position: number; registro: unknown }[]).map(
        (m) => [m.position, m.registro],
      ),
    );
    expect(porPos.get(1)).toEqual({ state: 'pulei' });

    // ...e o motor, na MESMA tela, ignora o mesmo evento (asserido acima). A
    // tela diz "pos 1 pulada"; o rebalanceamento diz "pos 1 é alavanca".
    const rebal = await postOptionChoice(
      mealAPorPos.get(2)!,
      optAltA2Id,
    ).expect(200);
    const afetadas = rebal.body.outcome.refeicoesAfetadas as {
      position: number;
    }[];
    expect(afetadas.some((r) => r.position === 1)).toBe(true);
  });

  it('/today SEM override ignora o evento do tipo B (FR-013a — o padrão nunca auto-ajusta)', async () => {
    await registrar({
      mealId: mealBPorPos.get(1)!,
      dayTypeId: dtBId,
      state: 'pulei',
      chosenMealOptionId: null,
      hora: '08:00:00',
    });

    const res = await request(app.getHttpServer())
      .get(`/patients/${patientId}/today`)
      .expect(200);
    // Sem override o pareamento é por `mealId` (o evento é filtrado fora) —
    // aqui `/today` e o motor CONCORDAM, e é requisito (004/FR-013a).
    for (const m of res.body.meals as { registro: unknown }[]) {
      expect(m.registro).toBeNull();
    }
  });
});

// ───────── Sintoma B: colisão de position nas duas rotas da nutri ─────────

describe('KI-002 Sintoma B — colisão de position: as duas rotas da nutri contam diferente', () => {
  it('[BUG] detalhe do ciclo conta 2 registros na pos 1; o relatório conta 1 e perde um estado', async () => {
    // Dois eventos vigentes no MESMO dia e na MESMA position, em tipos-de-dia
    // diferentes. Alcançável: `registro.service` escopa o histórico por `mealId`,
    // então os dois coexistem sem se anular.
    await registrar({
      mealId: mealAPorPos.get(1)!,
      dayTypeId: dtAId,
      state: 'feito',
      chosenMealOptionId: optDefaultAPorPos.get(1)!,
      hora: '08:00:00',
    });
    await registrar({
      mealId: mealBPorPos.get(1)!,
      dayTypeId: dtBId,
      state: 'pulei',
      chosenMealOptionId: null,
      hora: '09:00:00',
    });

    const detalhe = await nutriGet(
      `/nutri/patients/${patientId}/cycles/${cycleId}`,
    ).expect(200);
    const naPos1 = (
      detalhe.body.registros as { date: string; position: number }[]
    ).filter((r) => r.date === HOJE && r.position === 1);
    // Retrato cru por evento: preserva `mealId`, conta os DOIS.
    expect(naPos1).toHaveLength(2);

    const report = await nutriGet(
      `/nutri/patients/${patientId}/cycles/${cycleId}/report`,
    ).expect(200);
    const totais = report.body.registro.totais as {
      feito: number;
      troquei: number;
      pulei: number;
      semRegistro: number;
    };
    // Agregado colapsa por position (último-ganha em `relatorio.loader.ts`):
    // conta UM. E o estado perdido não vira `semRegistro` — desaparece dos
    // totais. É o "descarte silencioso": 2 fatos entram, 1 sai.
    expect(totais.feito + totais.troquei + totais.pulei).toBe(1);
  });
});

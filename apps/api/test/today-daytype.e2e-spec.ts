import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, asc, eq, inArray, ne, db, pool, schema } from '@bamboo/db';
import { PlanModule } from '../src/plan/plan.module';
import { RegistroModule } from '../src/registro/registro.module';

// Data-calendário local do servidor "YYYY-MM-DD" — MESMA fonte do service
// (local-date.localToday) e do registro. Não usar UTC: divergiria na virada de
// meia-noite e o evento "sumiria" da consulta type-agnostic do helper.
const localTodayStr = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// e2e US3 — GET /today?dayTypeId: troca de tipo-de-dia.
//
// Fase 2 (exibição, FR-021): com override `?dayTypeId` o cardápio exibido é o do
// tipo pedido e "o agora" re-ancora na 1ª NÃO-registrada.
//
// Fase 4 (FR-011/012/013/013a/013b, SC-003): com override ATIVO + consumo HOJE,
// o servidor recalcula as gramas do NOVO tipo pelo CONSUMIDO real (helper
// registro-consumo + previewTrocaTipoDia), pareando slots por position (sem
// double-count). Sem override (tipo padrão por weekday): NUNCA auto-ajusta (Q1).
describe('GET /patients/:id/today?dayTypeId (US3 — troca de tipo-de-dia)', () => {
  let app: INestApplication;
  let patientId: string;
  let planId: string;

  // Tipo "original" = o que o weekday do servidor resolve hoje (default sem
  // override). Tipo "outro" = o outro dayType do plano (o alvo da troca).
  let originalDayTypeId: string;
  let otherDayTypeId: string;
  let otherDayTypeName: string;

  // Café do tipo ORIGINAL (position 1) — o slot que registramos pra criar desvio.
  let originalCafeMealId: string;

  // Itens da opção default do NOVO tipo (descanso), por position. Pra comparar
  // gramas ajustadas vs planejadas e provar onde o ajuste cai.
  type PlanItem = {
    id: string;
    quantityGrams: number;
    isLocked: boolean;
    groupId: string | null;
  };
  const otherDefaultItemsByPosition = new Map<number, PlanItem[]>();
  let otherCafePosition: number; // position do café do novo tipo (slot registrado → não ajusta)

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

    // Tipo ORIGINAL = o que o weekday do servidor resolve (mesma regra do service).
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
    originalDayTypeId = sched.dayTypeId;

    // Tipo OUTRO = o outro dayType do plano (≠ original) → alvo da troca.
    const [other] = await db
      .select({ id: schema.dayType.id, name: schema.dayType.name })
      .from(schema.dayType)
      .where(
        and(
          eq(schema.dayType.planId, planId),
          ne(schema.dayType.id, originalDayTypeId),
        ),
      )
      .limit(1);
    otherDayTypeId = other.id;
    otherDayTypeName = other.name;

    // Café (position 1) do tipo ORIGINAL → o slot a registrar.
    const [origCafe] = await db
      .select({ id: schema.meal.id })
      .from(schema.meal)
      .where(
        and(
          eq(schema.meal.dayTypeId, originalDayTypeId),
          eq(schema.meal.position, 1),
        ),
      )
      .limit(1);
    originalCafeMealId = origCafe.id;

    // Itens da opção default de CADA refeição do NOVO tipo, por position.
    const otherMeals = await db
      .select({
        id: schema.meal.id,
        name: schema.meal.name,
        position: schema.meal.position,
      })
      .from(schema.meal)
      .where(eq(schema.meal.dayTypeId, otherDayTypeId))
      .orderBy(asc(schema.meal.position));
    for (const m of otherMeals) {
      if (m.position === 1) otherCafePosition = m.position;
      const opts = await db
        .select({
          id: schema.mealOption.id,
          isDefault: schema.mealOption.isDefault,
        })
        .from(schema.mealOption)
        .where(eq(schema.mealOption.mealId, m.id));
      const defOpt = opts.find((o) => o.isDefault) ?? opts[0];
      const items = await db
        .select({
          id: schema.mealItem.id,
          quantityGrams: schema.mealItem.quantityGrams,
          isLocked: schema.mealItem.isLocked,
          groupId: schema.mealItem.substitutionGroupId,
        })
        .from(schema.mealItem)
        .where(eq(schema.mealItem.mealOptionId, defOpt.id));
      otherDefaultItemsByPosition.set(m.position, items);
    }

    const moduleRef = await Test.createTestingModule({
      // PlanModule p/ o GET /today; RegistroModule p/ criar consumo via POST.
      imports: [PlanModule, RegistroModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    // ISOLAMENTO: o helper de consumo é type-agnostic por (paciente, plano,
    // localToday) — eventos deixados por OUTRAS suítes do dia (ex.: a US1 do
    // registro.e2e marca todas as refeições do treino como 'feito' e NÃO desfaz)
    // vazariam no `consumido` desta suíte e quebrariam o cenário de déficit
    // controlado. Limpa todos os meal_event de HOJE do paciente+plano antes de
    // começar (filhas → pais por FK).
    await limparEventosDeHoje();
  });

  afterAll(async () => {
    await limparEventosDeHoje();
    await app?.close();
    await pool.end();
  });

  // Remove TODOS os meal_event (+ filhas) de HOJE do paciente+plano. Direto no
  // banco (como o Caso 5 do rebalance.e2e) — controla o estado consumido.
  const limparEventosDeHoje = async (): Promise<void> => {
    const loggedDate = localTodayStr();
    const eventos = await db
      .select({ id: schema.mealEvent.id })
      .from(schema.mealEvent)
      .where(
        and(
          eq(schema.mealEvent.patientId, patientId),
          eq(schema.mealEvent.planId, planId),
          eq(schema.mealEvent.loggedDate, loggedDate),
        ),
      );
    const ids = eventos.map((e) => e.id);
    if (ids.length === 0) return;
    await db
      .delete(schema.mealEventItem)
      .where(inArray(schema.mealEventItem.mealEventId, ids));
    await db.delete(schema.mealEvent).where(inArray(schema.mealEvent.id, ids));
  };

  // Helpers ----------------------------------------------------------------
  const getToday = (dayTypeId?: string) => {
    const r = request(app.getHttpServer()).get(`/patients/${patientId}/today`);
    return dayTypeId ? r.query({ dayTypeId }) : r;
  };

  const registrar = (mealId: string, intent: 'feito' | 'pulei' | 'desfazer') =>
    request(app.getHttpServer())
      .post(`/patients/${patientId}/registro`)
      .send({ mealId, intent })
      .expect(200);

  type ItemDto = {
    id: string;
    quantityGrams: number;
    substitutable: boolean;
  };
  type OptionDto = { id: string; isDefault: boolean; items: ItemDto[] };
  type MealDto = {
    id: string;
    position: number;
    defaultOption: OptionDto;
    options: OptionDto[];
    registro: { state: string } | null;
    rebalanceado: boolean;
  };
  type TodayBody = { dayType: { id: string }; meals: MealDto[] };
  const mealsOf = (body: TodayBody): MealDto[] => body.meals;
  const byPosition = (body: TodayBody, pos: number): MealDto =>
    mealsOf(body).find((m) => m.position === pos)!;

  // ── Caso 1 (SC-003 baseline) — SEM consumo: novo tipo no PLANEJADO ─────────
  it('SC-003 baseline — sem consumo: GET /today?dayTypeId=<outro> mostra o novo tipo no planejado', async () => {
    const res = await getToday(otherDayTypeId).expect(200);

    expect(res.body.dayType.id).toBe(otherDayTypeId);
    expect(res.body.dayType.label).toBe(otherDayTypeName);

    // Cada item da opção default vem com a grama PLANEJADA (sem ajuste).
    for (const [pos, planItems] of otherDefaultItemsByPosition) {
      const meal = byPosition(res.body, pos);
      for (const planned of planItems) {
        const got = meal.defaultOption.items.find((i) => i.id === planned.id)!;
        expect(got.quantityGrams).toBe(planned.quantityGrams);
      }
    }
  });

  // ── Caso 2 (SC-003 ajuste + FR-013b single-count) ─────────────────────────
  // Registra o CAFÉ do tipo ORIGINAL como 'pulei' (consumido daquele slot = 0).
  // Trocar p/ o OUTRO tipo: o dia projeta abaixo do alvo (déficit) → as refeições
  // RESTANTES (slots NÃO registrados) do novo tipo AUMENTAM; o slot do café
  // (position registrada) do novo tipo NÃO é ajustado (planejado) → single-count.
  it('SC-003 ajuste — pulei no café original → itens flexíveis do NOVO tipo AUMENTAM nos slots não registrados; café NÃO ajusta (single-count)', async () => {
    // Baseline planejado (sem consumo) p/ comparar.
    const baseline = (await getToday(otherDayTypeId).expect(200))
      .body as TodayBody;

    try {
      await registrar(originalCafeMealId, 'pulei');

      const res = await getToday(otherDayTypeId).expect(200);
      expect(res.body.dayType.id).toBe(otherDayTypeId);

      // Slots NÃO registrados (≠ café position 1): os itens FLEXÍVEIS da opção
      // default têm grama AJUSTADA (> planejado, déficit) respeitando o piso (50%).
      // Os itemIds ajustados pertencem à opção default do NOVO tipo.
      let algumAjustado = false;
      for (const [pos, planItems] of otherDefaultItemsByPosition) {
        if (pos === otherCafePosition) continue; // café = slot registrado
        const meal = byPosition(res.body, pos);
        const base = byPosition(baseline, pos);
        for (const planned of planItems) {
          const got = meal.defaultOption.items.find(
            (i) => i.id === planned.id,
          )!;
          const flex = !planned.isLocked && planned.groupId != null;
          if (flex) {
            // déficit → aumenta; difere do planejado e do baseline.
            expect(got.quantityGrams).toBeGreaterThan(planned.quantityGrams);
            const baseGot = base.defaultOption.items.find(
              (i) => i.id === planned.id,
            )!;
            expect(got.quantityGrams).not.toBe(baseGot.quantityGrams);
            // piso: nunca abaixo de 50% do planejado.
            expect(got.quantityGrams).toBeGreaterThanOrEqual(
              planned.quantityGrams * 0.5 - 0.05,
            );
            algumAjustado = true;
          } else {
            // travado → inalterado.
            expect(got.quantityGrams).toBe(planned.quantityGrams);
          }
        }
      }
      expect(algumAjustado).toBe(true);

      // SINGLE-COUNT (FR-013b): o café do NOVO tipo (slot registrado por position)
      // NÃO é ajustado — todos os itens seguem o planejado.
      const cafeNovo = byPosition(res.body, otherCafePosition);
      const cafePlan = otherDefaultItemsByPosition.get(otherCafePosition)!;
      for (const planned of cafePlan) {
        const got = cafeNovo.defaultOption.items.find(
          (i) => i.id === planned.id,
        )!;
        expect(got.quantityGrams).toBe(planned.quantityGrams);
      }
    } finally {
      await registrar(originalCafeMealId, 'desfazer');
    }
  });

  // ── Caso 3 (FR-013a) — override ATIVO no reload → segue ajustado, idempotente ─
  it('FR-013a — reload com override ativo: registrar e recarregar GET /today?dayTypeId=<mesmo> segue ajustado (idempotente)', async () => {
    try {
      await registrar(originalCafeMealId, 'pulei');

      const r1 = (await getToday(otherDayTypeId).expect(200)).body as TodayBody;
      const r2 = (await getToday(otherDayTypeId).expect(200)).body as TodayBody;

      // 2 chamadas → mesmo resultado (override ativo sempre ajusta, idempotente).
      for (const [pos] of otherDefaultItemsByPosition) {
        if (pos === otherCafePosition) continue;
        const m1 = byPosition(r1, pos);
        const m2 = byPosition(r2, pos);
        for (const it1 of m1.defaultOption.items) {
          const it2 = m2.defaultOption.items.find((i) => i.id === it1.id)!;
          expect(it2.quantityGrams).toBe(it1.quantityGrams);
        }
      }
      // e o ajuste de fato aconteceu (pelo menos um flex acima do planejado).
      const planPos2 = [...otherDefaultItemsByPosition.entries()].find(
        ([p]) => p !== otherCafePosition,
      )!;
      const meal = byPosition(r1, planPos2[0]);
      const flexPlanned = planPos2[1].find(
        (p) => !p.isLocked && p.groupId != null,
      )!;
      const flexGot = meal.defaultOption.items.find(
        (i) => i.id === flexPlanned.id,
      )!;
      expect(flexGot.quantityGrams).toBeGreaterThan(flexPlanned.quantityGrams);
    } finally {
      await registrar(originalCafeMealId, 'desfazer');
    }
  });

  // ── Caso 4 (Q1 / FR-013a) — tipo PADRÃO (sem dayTypeId) NÃO auto-ajusta ─────
  it('Q1 — após consumo, GET /today SEM dayTypeId (tipo padrão) mostra o PLANEJADO + badge de registro; nada ajustado', async () => {
    try {
      await registrar(originalCafeMealId, 'pulei');

      const res = await getToday().expect(200); // SEM dayTypeId → tipo padrão (treino)
      expect(res.body.dayType.id).toBe(originalDayTypeId);

      // Itens da opção default do tipo padrão = grama PLANEJADA (sem ajuste).
      const origMeals = await db
        .select({ id: schema.meal.id, position: schema.meal.position })
        .from(schema.meal)
        .where(eq(schema.meal.dayTypeId, originalDayTypeId));
      for (const m of origMeals) {
        const opts = await db
          .select({
            id: schema.mealOption.id,
            isDefault: schema.mealOption.isDefault,
          })
          .from(schema.mealOption)
          .where(eq(schema.mealOption.mealId, m.id));
        const defOpt = opts.find((o) => o.isDefault) ?? opts[0];
        const planItems = await db
          .select({
            id: schema.mealItem.id,
            quantityGrams: schema.mealItem.quantityGrams,
          })
          .from(schema.mealItem)
          .where(eq(schema.mealItem.mealOptionId, defOpt.id));
        const meal = byPosition(res.body, m.position);
        for (const planned of planItems) {
          const got = meal.defaultOption.items.find(
            (i) => i.id === planned.id,
          )!;
          expect(got.quantityGrams).toBe(planned.quantityGrams);
        }
      }

      // O café registrado mostra o badge (state='pulei'), mas nada de ajuste.
      const cafe = mealsOf(res.body).find((m) => m.id === originalCafeMealId)!;
      expect(cafe.registro).toEqual({ state: 'pulei' });
    } finally {
      await registrar(originalCafeMealId, 'desfazer');
    }
  });

  // ── Caso 5 (SC-003 + type-agnostic, consumido>0) ──────────────────────────
  // Registra o café do tipo ORIGINAL como 'feito' (consumo REAL > 0, vindo de um
  // tipo DIFERENTE do exibido). Trocar p/ o outro tipo: o consumido real entra no
  // projetado (type-agnostic) → ajuste nos slots NÃO registrados; o café do novo
  // tipo (slot registrado) segue planejado (single-count). A DIREÇÃO não é
  // asserida de propósito — o gatilho pode ser kcal OU um macro isolado
  // (comportamento kcal-anchored, D1); o que provamos é que um consumido>0 de
  // OUTRO tipo de fato ajusta o novo cardápio (≠ baseline), respeitando o piso.
  it('SC-003 type-agnostic — feito (consumido>0) no café original ajusta o NOVO tipo nos slots não registrados; café NÃO ajusta', async () => {
    const baseline = (await getToday(otherDayTypeId).expect(200))
      .body as TodayBody;
    try {
      await registrar(originalCafeMealId, 'feito');

      const res = await getToday(otherDayTypeId).expect(200);
      expect(res.body.dayType.id).toBe(otherDayTypeId);

      // Algum item flexível de um slot NÃO registrado difere do baseline planejado
      // → o consumido REAL (>0) de um tipo DIFERENTE alimentou o recálculo. Piso ok.
      let algumAjustado = false;
      for (const [pos, planItems] of otherDefaultItemsByPosition) {
        if (pos === otherCafePosition) continue;
        const meal = byPosition(res.body, pos);
        const base = byPosition(baseline, pos);
        for (const planned of planItems) {
          if (planned.isLocked || planned.groupId == null) continue; // só flex
          const got = meal.defaultOption.items.find(
            (i) => i.id === planned.id,
          )!;
          const baseGot = base.defaultOption.items.find(
            (i) => i.id === planned.id,
          )!;
          if (got.quantityGrams !== baseGot.quantityGrams) algumAjustado = true;
          expect(got.quantityGrams).toBeGreaterThanOrEqual(
            planned.quantityGrams * 0.5 - 0.05,
          );
        }
      }
      expect(algumAjustado).toBe(true);

      // SINGLE-COUNT: o café do NOVO tipo (slot registrado) segue planejado.
      const cafeNovo = byPosition(res.body, otherCafePosition);
      for (const planned of otherDefaultItemsByPosition.get(
        otherCafePosition,
      )!) {
        const got = cafeNovo.defaultOption.items.find(
          (i) => i.id === planned.id,
        )!;
        expect(got.quantityGrams).toBe(planned.quantityGrams);
      }
    } finally {
      await registrar(originalCafeMealId, 'desfazer');
    }
  });

  // ── 009 US1 — badge pareado por posição (feito) ───────────────────────────
  it('009/US1 — feito no café original → café do NOVO tipo vem registrado (feito), no planejado, sem rebalanceado', async () => {
    try {
      await registrar(originalCafeMealId, 'feito');
      const res = await getToday(otherDayTypeId).expect(200);

      const cafeNovo = byPosition(res.body, otherCafePosition);
      // Badge pareado por posição: o café comido aparece registrado no novo tipo.
      expect(cafeNovo.registro).toEqual({ state: 'feito' });
      // É a registrada (single-count): não recebe sinal e segue no planejado.
      expect(cafeNovo.rebalanceado).toBe(false);
      for (const planned of otherDefaultItemsByPosition.get(
        otherCafePosition,
      )!) {
        const got = cafeNovo.defaultOption.items.find(
          (i) => i.id === planned.id,
        )!;
        expect(got.quantityGrams).toBe(planned.quantityGrams);
      }
    } finally {
      await registrar(originalCafeMealId, 'desfazer');
    }
  });

  it('009/US1 — pulei no café original → café do NOVO tipo vem registrado (pulei)', async () => {
    try {
      await registrar(originalCafeMealId, 'pulei');
      const res = await getToday(otherDayTypeId).expect(200);
      expect(byPosition(res.body, otherCafePosition).registro).toEqual({
        state: 'pulei',
      });
    } finally {
      await registrar(originalCafeMealId, 'desfazer');
    }
  });

  // ── 009 US2 — flag `rebalanceado` só nas reconciliadas ────────────────────
  it('009/US2 — após consumo + troca, refeições recalculadas vêm rebalanceado=true; a registrada vem false', async () => {
    const baseline = (await getToday(otherDayTypeId).expect(200))
      .body as TodayBody;
    try {
      await registrar(originalCafeMealId, 'pulei'); // déficit → restantes aumentam
      const res = await getToday(otherDayTypeId).expect(200);

      // INV-1: a registrada (café) não sinaliza.
      expect(byPosition(res.body, otherCafePosition).rebalanceado).toBe(false);

      // INV-2: rebalanceado=true exatamente onde a grama mudou vs baseline.
      for (const [pos, planItems] of otherDefaultItemsByPosition) {
        if (pos === otherCafePosition) continue;
        const meal = byPosition(res.body, pos);
        const base = byPosition(baseline, pos);
        const mudou = planItems.some((planned) => {
          const got = meal.defaultOption.items.find(
            (i) => i.id === planned.id,
          )!;
          const baseGot = base.defaultOption.items.find(
            (i) => i.id === planned.id,
          )!;
          return got.quantityGrams !== baseGot.quantityGrams;
        });
        expect(meal.rebalanceado).toBe(mudou);
      }
    } finally {
      await registrar(originalCafeMealId, 'desfazer');
    }
  });

  // ── 009 US3 / INV-3 — sem override: nada sinaliza, registro por mealId ─────
  it('009/US3 — GET /today SEM dayTypeId (tipo padrão): rebalanceado=false em tudo e registro por mealId', async () => {
    try {
      await registrar(originalCafeMealId, 'pulei');
      const res = await getToday().expect(200); // sem override

      for (const m of mealsOf(res.body)) expect(m.rebalanceado).toBe(false);
      const cafe = mealsOf(res.body).find((m) => m.id === originalCafeMealId)!;
      expect(cafe.registro).toEqual({ state: 'pulei' });
    } finally {
      await registrar(originalCafeMealId, 'desfazer');
    }
  });

  // ── Erros (inalterados, Fase 2) ───────────────────────────────────────────
  it('dayTypeId fora do plano → 404', async () => {
    await getToday('00000000-0000-0000-0000-000000000000').expect(404);
  });

  it('dayTypeId não-uuid → 400', async () => {
    await getToday('not-a-uuid').expect(400);
  });
});

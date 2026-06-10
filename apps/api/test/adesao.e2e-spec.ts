import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  PARAMETROS_SISTEMA,
  adesaoDoDia,
  resolverParametros,
  somaNutrientes,
  type ItemNutricional,
  type Nutrientes,
} from '@bamboo/core';
import { and, asc, eq, inArray, db, schema } from '@bamboo/db';
import { AdesaoModule } from '../src/adesao/adesao.module';
import { PlanModule } from '../src/plan/plan.module';

// e2e da Feature 006 — métrica de adesão (só-nutri), test-first.
//
// IMPORTANTE (ordem das suítes): este arquivo roda PRIMEIRO (alfabético) e o
// banco é compartilhado. Por isso TODOS os registros daqui são de DIAS
// PASSADOS, inseridos direto via @bamboo/db (nunca via POST /registro de
// hoje) e apagados no afterAll — o estado de "hoje" fica intacto pras outras
// suítes (registro/today esperam dia virgem pós-seed).
//
// Expectativas não-triviais (US2/US3) são calculadas com o PRÓPRIO núcleo
// (adesaoDoDia importado de @bamboo/core) a partir dos dados do seed — o e2e
// verifica que a casca alimenta o núcleo certo, sem duplicar a fórmula.
//
// A credencial stub da nutri é fixada no process.env ANTES das requisições
// (o guard lê a env a cada request) — a suíte é determinística sem .env.

const NUTRI_KEY = 'test-nutri-key';
process.env.NUTRI_API_KEY = NUTRI_KEY;

const isoDaysAgo = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
};

const weekdayOf = (iso: string): number => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
};

type DayShape = {
  date: string;
  status: 'com-dado' | 'sem-dado';
  valorPct?: number;
  dentroFaixa?: boolean;
  flags?: Record<string, string>;
  cobertura?: number;
};

type ItemPlanejado = {
  foodId: string;
  quantityGrams: number;
  macros: ItemNutricional['macros'];
};

type DiaPlanejado = {
  dayTypeId: string;
  meals: { id: string; position: number }[];
  defaultOf: Map<string, string>; // mealId → meal_option default
  opcoesDe: Map<string, string[]>; // mealId → todas as option ids
  itensPorOpcao: Map<string, ItemPlanejado[]>; // optionId → itens (com macros)
};

// ───────────────────────── estado compartilhado da suíte ─────────────────────────

let app: INestApplication;
let patientId: string;
let planId: string;
let toleranciaPct: number;
const insertedEventIds: string[] = [];
let extraPatientId: string | null = null;

// Dias de teste (todos no passado; hoje fica intacto).
const DIA_FEITO = isoDaysAgo(3); // US1: tudo feito conforme o plano → 100%
const DIA_PULEI = isoDaysAgo(4); // US1: tudo pulei → fora da faixa
const DIA_ANULADO = isoDaysAgo(5); // US1: registro único anulado → sem-dado
const DIA_VAZIO = isoDaysAgo(6); // US1: nunca registrado → sem-dado
const DIA_TROQUEI_EQ = isoDaysAgo(7); // US2: troquei equivalente → 100%
const DIA_COMPENSADO = isoDaysAgo(9); // US2: pulei compensado → 100%
const DIA_ESTOURO = isoDaysAgo(10); // US2: troquei estourando → fora
const DIA_DIVERGENTE = isoDaysAgo(11); // US3: tipos divergentes → fallback
let DIA_OPCAO: string; // US2: opção não-default (data com opção extra no tipo)

let expectativaOpcao: { valorPct: number; dentroFaixa: boolean } | null = null;
let expectativaEstouro: {
  valorPct: number;
  dentroFaixa: boolean;
} | null = null;
let expectativaDivergente: {
  valorPct: number;
  dentroFaixa: boolean;
  cobertura: number;
} | null = null;

const diaPlanejado = async (dateIso: string): Promise<DiaPlanejado> => {
  const [sched] = await db
    .select({ dayTypeId: schema.daySchedule.dayTypeId })
    .from(schema.daySchedule)
    .where(
      and(
        eq(schema.daySchedule.planId, planId),
        eq(schema.daySchedule.weekday, weekdayOf(dateIso)),
      ),
    )
    .limit(1);
  return tipoPlanejado(sched.dayTypeId);
};

const tipoPlanejado = async (dayTypeId: string): Promise<DiaPlanejado> => {
  const meals = await db
    .select({ id: schema.meal.id, position: schema.meal.position })
    .from(schema.meal)
    .where(eq(schema.meal.dayTypeId, dayTypeId))
    .orderBy(asc(schema.meal.position));
  const options = await db
    .select({
      id: schema.mealOption.id,
      mealId: schema.mealOption.mealId,
      isDefault: schema.mealOption.isDefault,
    })
    .from(schema.mealOption)
    .where(
      inArray(
        schema.mealOption.mealId,
        meals.map((m) => m.id),
      ),
    );
  const itens = await db
    .select({
      mealOptionId: schema.mealItem.mealOptionId,
      foodId: schema.mealItem.foodId,
      quantityGrams: schema.mealItem.quantityGrams,
      carbPer100g: schema.food.carbPer100g,
      proteinPer100g: schema.food.proteinPer100g,
      fatPer100g: schema.food.fatPer100g,
      kcalPer100g: schema.food.kcalPer100g,
    })
    .from(schema.mealItem)
    .innerJoin(schema.food, eq(schema.mealItem.foodId, schema.food.id))
    .where(
      inArray(
        schema.mealItem.mealOptionId,
        options.map((o) => o.id),
      ),
    );
  const itensPorOpcao = new Map<string, ItemPlanejado[]>();
  for (const i of itens) {
    const lista = itensPorOpcao.get(i.mealOptionId) ?? [];
    lista.push({
      foodId: i.foodId,
      quantityGrams: i.quantityGrams,
      macros: {
        carbPer100g: i.carbPer100g,
        proteinPer100g: i.proteinPer100g,
        fatPer100g: i.fatPer100g,
        kcalPer100g: i.kcalPer100g,
      },
    });
    itensPorOpcao.set(i.mealOptionId, lista);
  }
  const opcoesDe = new Map<string, string[]>();
  for (const o of options) {
    const lista = opcoesDe.get(o.mealId) ?? [];
    lista.push(o.id);
    opcoesDe.set(o.mealId, lista);
  }
  return {
    dayTypeId,
    meals,
    defaultOf: new Map(
      options.filter((o) => o.isDefault).map((o) => [o.mealId, o.id]),
    ),
    opcoesDe,
    itensPorOpcao,
  };
};

const comoNutricionais = (itens: readonly ItemPlanejado[]): ItemNutricional[] =>
  itens.map((i) => ({ macros: i.macros, gramas: i.quantityGrams }));

// Alvo do dia (mesma definição da Fase 2): soma das opções default do tipo.
const alvoDe = (dia: DiaPlanejado): Nutrientes =>
  somaNutrientes(
    dia.meals.flatMap((m) =>
      comoNutricionais(dia.itensPorOpcao.get(dia.defaultOf.get(m.id)!) ?? []),
    ),
  );

const insertEvento = async (args: {
  mealId: string;
  dayTypeId: string;
  state: 'feito' | 'troquei' | 'pulei' | null;
  chosenMealOptionId?: string | null;
  loggedDate: string;
  createdAt: Date;
  itens?: ReadonlyArray<{ foodId: string; quantityGrams: number }>;
}) => {
  const [ev] = await db
    .insert(schema.mealEvent)
    .values({
      patientId,
      planId,
      mealId: args.mealId,
      dayTypeId: args.dayTypeId,
      chosenMealOptionId: args.chosenMealOptionId ?? null,
      state: args.state,
      loggedDate: args.loggedDate,
      createdAt: args.createdAt,
    })
    .returning({ id: schema.mealEvent.id });
  insertedEventIds.push(ev.id);
  if (args.itens?.length) {
    await db.insert(schema.mealEventItem).values(
      args.itens.map((i) => ({
        mealEventId: ev.id,
        foodId: i.foodId,
        quantityGrams: i.quantityGrams,
      })),
    );
  }
  return ev.id;
};

// Registra todas as refeições do tipo programado da data como FEITO (default),
// exceto overrides pontuais informados.
const registrarDia = async (
  dateIso: string,
  dia: DiaPlanejado,
  overrides: Map<
    string,
    {
      state: 'feito' | 'troquei' | 'pulei';
      chosenMealOptionId?: string | null;
      itens?: ReadonlyArray<{ foodId: string; quantityGrams: number }>;
    }
  > = new Map(),
) => {
  let t = new Date(`${dateIso}T12:00:00`);
  for (const m of dia.meals) {
    const o = overrides.get(m.id);
    await insertEvento({
      mealId: m.id,
      dayTypeId: dia.dayTypeId,
      state: o?.state ?? 'feito',
      chosenMealOptionId:
        o !== undefined
          ? (o.chosenMealOptionId ?? null)
          : dia.defaultOf.get(m.id),
      loggedDate: dateIso,
      createdAt: t,
      itens: o?.itens,
    });
    t = new Date(t.getTime() + 60_000);
  }
};

const getAdesao = (pid: string, from: string, to: string) =>
  request(app.getHttpServer())
    .get(`/nutri/patients/${pid}/adesao`)
    .query({ from, to })
    .set('x-nutri-key', NUTRI_KEY);

// ───────────────────────── setup único da suíte ─────────────────────────

beforeAll(async () => {
  const [pat] = await db
    .select({
      id: schema.patient.id,
      nutritionistId: schema.patient.nutritionistId,
      bandTolerancePct: schema.patient.bandTolerancePct,
      floorPct: schema.patient.floorPct,
    })
    .from(schema.patient)
    .limit(1);
  patientId = pat.id;
  const [pln] = await db
    .select({ id: schema.plan.id })
    .from(schema.plan)
    .where(
      and(eq(schema.plan.patientId, patientId), eq(schema.plan.isActive, true)),
    )
    .limit(1);
  planId = pln.id;
  const [nutri] = await db
    .select({
      defaultBandTolerancePct: schema.nutritionist.defaultBandTolerancePct,
      defaultFloorPct: schema.nutritionist.defaultFloorPct,
    })
    .from(schema.nutritionist)
    .where(eq(schema.nutritionist.id, pat.nutritionistId))
    .limit(1);
  toleranciaPct = resolverParametros({
    sistema: PARAMETROS_SISTEMA,
    nutri: {
      toleranciaPct: nutri?.defaultBandTolerancePct ?? undefined,
      pisoPct: nutri?.defaultFloorPct ?? undefined,
    },
    paciente: {
      toleranciaPct: pat.bandTolerancePct ?? undefined,
      pisoPct: pat.floorPct ?? undefined,
    },
  }).toleranciaPct;

  // ── US1 ──────────────────────────────────────────────────────────────
  // DIA_FEITO: tudo feito (default) → consumido == alvo → 100%.
  await registrarDia(DIA_FEITO, await diaPlanejado(DIA_FEITO));

  // DIA_PULEI: tudo pulei → consumido 0 → fora (abaixo).
  {
    const dia = await diaPlanejado(DIA_PULEI);
    await registrarDia(
      DIA_PULEI,
      dia,
      new Map(dia.meals.map((m) => [m.id, { state: 'pulei' as const }])),
    );
  }

  // DIA_ANULADO: um único feito... anulado em seguida (tombstone vence).
  {
    const dia = await diaPlanejado(DIA_ANULADO);
    const m = dia.meals[0];
    await insertEvento({
      mealId: m.id,
      dayTypeId: dia.dayTypeId,
      state: 'feito',
      chosenMealOptionId: dia.defaultOf.get(m.id),
      loggedDate: DIA_ANULADO,
      createdAt: new Date(`${DIA_ANULADO}T12:00:00`),
    });
    await insertEvento({
      mealId: m.id,
      dayTypeId: dia.dayTypeId,
      state: null,
      loggedDate: DIA_ANULADO,
      createdAt: new Date(`${DIA_ANULADO}T12:05:00`),
    });
  }

  // Paciente extra SEM plano ativo (US1.4).
  {
    const [n] = await db
      .select({ id: schema.nutritionist.id })
      .from(schema.nutritionist)
      .limit(1);
    const [extra] = await db
      .insert(schema.patient)
      .values({ nutritionistId: n.id, name: 'Sem Plano (e2e adesão)' })
      .returning({ id: schema.patient.id });
    extraPatientId = extra.id;
  }

  // ── US2 ──────────────────────────────────────────────────────────────
  // DIA_TROQUEI_EQ: toda refeição troquei com snapshot = itens default →
  // desfecho idêntico ao plano → 100% (igual ao DIA_FEITO).
  {
    const dia = await diaPlanejado(DIA_TROQUEI_EQ);
    await registrarDia(
      DIA_TROQUEI_EQ,
      dia,
      new Map(
        dia.meals.map((m) => {
          const def = dia.defaultOf.get(m.id)!;
          return [
            m.id,
            {
              state: 'troquei' as const,
              chosenMealOptionId: def,
              itens: (dia.itensPorOpcao.get(def) ?? []).map((i) => ({
                foodId: i.foodId,
                quantityGrams: i.quantityGrams,
              })),
            },
          ];
        }),
      ),
    );
  }

  // DIA_OPCAO: procura uma data passada (8 e 12–14 dias atrás) cujo tipo
  // programado tenha refeição com opção NÃO-default; registra essa refeição
  // como feito na opção não-default e as demais como feito default.
  // Expectativa calculada com o núcleo (sem duplicar fórmula).
  {
    const candidatas = [8, 12, 13, 14].map(isoDaysAgo);
    for (const data of candidatas) {
      const dia = await diaPlanejado(data);
      const alvoMeal = dia.meals.find(
        (m) => (dia.opcoesDe.get(m.id) ?? []).length > 1,
      );
      if (!alvoMeal) continue;
      DIA_OPCAO = data;
      const naoDefault = (dia.opcoesDe.get(alvoMeal.id) ?? []).find(
        (id) => id !== dia.defaultOf.get(alvoMeal.id),
      )!;
      await registrarDia(
        DIA_OPCAO,
        dia,
        new Map([
          [
            alvoMeal.id,
            { state: 'feito' as const, chosenMealOptionId: naoDefault },
          ],
        ]),
      );
      const consumido = somaNutrientes(
        dia.meals.flatMap((m) =>
          comoNutricionais(
            dia.itensPorOpcao.get(
              m.id === alvoMeal.id ? naoDefault : dia.defaultOf.get(m.id)!,
            ) ?? [],
          ),
        ),
      );
      const esperado = adesaoDoDia({
        alvo: alvoDe(dia),
        consumido,
        toleranciaPct,
        refeicoesDoTipo: dia.meals.length,
        refeicoesRegistradas: dia.meals.length,
      });
      if (esperado.ok) {
        expectativaOpcao = {
          valorPct: esperado.value.valorPct,
          dentroFaixa: esperado.value.dentroFaixa,
        };
      }
      break;
    }
  }

  // DIA_COMPENSADO: pulei a 1ª refeição; a 2ª troquei com snapshot = itens
  // dela + itens da pulada → total == alvo → 100% com cobertura 1.
  {
    const dia = await diaPlanejado(DIA_COMPENSADO);
    const [pulada, compensadora] = dia.meals;
    const itensPulada = dia.itensPorOpcao.get(dia.defaultOf.get(pulada.id)!)!;
    const itensComp = dia.itensPorOpcao.get(
      dia.defaultOf.get(compensadora.id)!,
    )!;
    await registrarDia(
      DIA_COMPENSADO,
      dia,
      new Map([
        [pulada.id, { state: 'pulei' as const }],
        [
          compensadora.id,
          {
            state: 'troquei' as const,
            chosenMealOptionId: dia.defaultOf.get(compensadora.id),
            itens: [...itensComp, ...itensPulada].map((i) => ({
              foodId: i.foodId,
              quantityGrams: i.quantityGrams,
            })),
          },
        ],
      ]),
    );
  }

  // DIA_ESTOURO: a 1ª refeição troquei com gramas escaladas até GARANTIR
  // total acima da borda superior; demais feito default. Expectativa via core.
  {
    const dia = await diaPlanejado(DIA_ESTOURO);
    const alvo = alvoDe(dia);
    const m0 = dia.meals[0];
    const itensM0 = dia.itensPorOpcao.get(dia.defaultOf.get(m0.id)!)!;
    const kcalM0 = somaNutrientes(comoNutricionais(itensM0)).kcal;
    const margem = alvo.kcal * (toleranciaPct / 100);
    const fator = 1 + (1.5 * margem) / kcalM0; // excesso = 1.5×margem → fora garantido
    const snapshot = itensM0.map((i) => ({
      foodId: i.foodId,
      quantityGrams: i.quantityGrams * fator,
    }));
    await registrarDia(
      DIA_ESTOURO,
      dia,
      new Map([
        [
          m0.id,
          {
            state: 'troquei' as const,
            chosenMealOptionId: dia.defaultOf.get(m0.id),
            itens: snapshot,
          },
        ],
      ]),
    );
    const consumido = somaNutrientes([
      ...snapshot.map((s, idx) => ({
        macros: itensM0[idx].macros,
        gramas: s.quantityGrams,
      })),
      ...dia.meals
        .slice(1)
        .flatMap((m) =>
          comoNutricionais(dia.itensPorOpcao.get(dia.defaultOf.get(m.id)!)!),
        ),
    ]);
    const esperado = adesaoDoDia({
      alvo,
      consumido,
      toleranciaPct,
      refeicoesDoTipo: dia.meals.length,
      refeicoesRegistradas: dia.meals.length,
    });
    if (esperado.ok) {
      expectativaEstouro = {
        valorPct: esperado.value.valorPct,
        dentroFaixa: esperado.value.dentroFaixa,
      };
    }
  }

  // ── US3 (tipos divergentes) ──────────────────────────────────────────
  // Dois registros no mesmo dia com day_type_id DIFERENTES → o alvo cai no
  // fallback (programação). Expectativa via core contra o tipo programado.
  {
    const diaProg = await diaPlanejado(DIA_DIVERGENTE);
    const tiposDoPlan = await db
      .select({ id: schema.dayType.id })
      .from(schema.dayType)
      .where(eq(schema.dayType.planId, planId));
    const outroTipoId = tiposDoPlan
      .map((t) => t.id)
      .find((id) => id !== diaProg.dayTypeId);
    expect(outroTipoId, 'seed precisa de ≥2 tipos-de-dia').toBeDefined();
    const outro = await tipoPlanejado(outroTipoId!);

    const mA = diaProg.meals[0]; // tipo programado
    const mB = outro.meals[0]; // outro tipo (position igual à 1ª — pareia 1 slot)
    const itensA = diaProg.itensPorOpcao.get(diaProg.defaultOf.get(mA.id)!)!;
    const itensB = outro.itensPorOpcao.get(outro.defaultOf.get(mB.id)!)!;
    await insertEvento({
      mealId: mA.id,
      dayTypeId: diaProg.dayTypeId,
      state: 'feito',
      chosenMealOptionId: diaProg.defaultOf.get(mA.id),
      loggedDate: DIA_DIVERGENTE,
      createdAt: new Date(`${DIA_DIVERGENTE}T12:00:00`),
    });
    await insertEvento({
      mealId: mB.id,
      dayTypeId: outro.dayTypeId, // snapshot divergente
      state: 'feito',
      chosenMealOptionId: outro.defaultOf.get(mB.id),
      loggedDate: DIA_DIVERGENTE,
      createdAt: new Date(`${DIA_DIVERGENTE}T12:30:00`),
    });

    const positionsProg = new Set(diaProg.meals.map((m) => m.position));
    const pareadas = new Set(
      [mA.position, mB.position].filter((p) => positionsProg.has(p)),
    ).size;
    const consumido = somaNutrientes([
      ...comoNutricionais(itensA),
      ...comoNutricionais(itensB),
    ]);
    const esperado = adesaoDoDia({
      alvo: alvoDe(diaProg),
      consumido,
      toleranciaPct,
      refeicoesDoTipo: diaProg.meals.length,
      refeicoesRegistradas: pareadas,
    });
    if (esperado.ok) {
      expectativaDivergente = {
        valorPct: esperado.value.valorPct,
        dentroFaixa: esperado.value.dentroFaixa,
        cobertura: esperado.value.cobertura,
      };
    }
  }

  const moduleRef = await Test.createTestingModule({
    imports: [AdesaoModule, PlanModule], // PlanModule só pro invariante do /today (US4)
  }).compile();
  app = moduleRef.createNestApplication();
  await app.init();
});

afterAll(async () => {
  if (insertedEventIds.length > 0) {
    await db
      .delete(schema.mealEventItem)
      .where(inArray(schema.mealEventItem.mealEventId, insertedEventIds));
    await db
      .delete(schema.mealEvent)
      .where(inArray(schema.mealEvent.id, insertedEventIds));
  }
  if (extraPatientId) {
    await db
      .delete(schema.patient)
      .where(eq(schema.patient.id, extraPatientId));
  }
  await app?.close();
});

// ───────────────────────── US1 — adesão de um dia ─────────────────────────

describe('GET /nutri/patients/:id/adesao (US1 — adesão de um dia)', () => {
  it('US1.1 — dia todo feito conforme o plano → com-dado, 100%, dentro, sem flags, cobertura 1', async () => {
    const res = await getAdesao(patientId, DIA_FEITO, DIA_FEITO).expect(200);
    const [day] = res.body.days as DayShape[];
    expect(res.body.days).toHaveLength(1);
    expect(day.date).toBe(DIA_FEITO);
    expect(day.status).toBe('com-dado');
    expect(day.valorPct).toBe(100);
    expect(day.dentroFaixa).toBe(true);
    expect(day.flags).toEqual({});
    expect(day.cobertura).toBe(1);
    expect(res.body.media).toBe(100);
  });

  it('US1.2 — dia todo pulei (total abaixo da faixa) → fora de adesão, valor < 100', async () => {
    const res = await getAdesao(patientId, DIA_PULEI, DIA_PULEI).expect(200);
    const [day] = res.body.days as DayShape[];
    expect(day.status).toBe('com-dado'); // registrou (pulei é registro), só está fora
    expect(day.dentroFaixa).toBe(false);
    expect(day.valorPct).toBeLessThan(100);
    expect(day.cobertura).toBe(1);
  });

  it('US1.3 — registro anulado: o dia reflete o estado vigente (único registro anulado → sem-dado)', async () => {
    const res = await getAdesao(patientId, DIA_ANULADO, DIA_ANULADO).expect(
      200,
    );
    const [day] = res.body.days as DayShape[];
    expect(day.status).toBe('sem-dado');
    expect(day.valorPct).toBeUndefined();
    expect(res.body.media).toBeNull();
  });

  it('US1.4 — dia sem registro / data futura → sem-dado (nunca 0%, nunca erro)', async () => {
    const vazio = await getAdesao(patientId, DIA_VAZIO, DIA_VAZIO).expect(200);
    expect((vazio.body.days as DayShape[])[0].status).toBe('sem-dado');

    const amanha = isoDaysAgo(-1);
    const futuro = await getAdesao(patientId, amanha, amanha).expect(200);
    expect((futuro.body.days as DayShape[])[0].status).toBe('sem-dado');
    expect(futuro.body.media).toBeNull();
  });

  it('US1.4 — paciente sem plano ativo → tudo sem-dado (200); paciente inexistente → 404', async () => {
    const res = await getAdesao(
      extraPatientId as string,
      DIA_FEITO,
      DIA_FEITO,
    ).expect(200);
    expect((res.body.days as DayShape[])[0].status).toBe('sem-dado');
    expect(res.body.media).toBeNull();

    await getAdesao(
      '00000000-0000-0000-0000-000000000000',
      DIA_FEITO,
      DIA_FEITO,
    ).expect(404);
  });

  it('validação estrutural: from>to, formato inválido e período >366 dias → 400', async () => {
    await getAdesao(patientId, DIA_FEITO, DIA_PULEI).expect(400); // from > to
    await getAdesao(patientId, '2026-6-1', DIA_FEITO).expect(400); // formato
    await getAdesao(patientId, '2024-01-01', '2026-01-01').expect(400); // >366d
  });
});

// ──────────────────── US2 — adequar conta como aderente ────────────────────

describe('US2 — substituições/opções/compensações julgadas pelo desfecho', () => {
  it('US2.1 — troquei equivalente em todas as refeições → 100%, idêntico ao dia todo feito (SC-002)', async () => {
    const res = await getAdesao(
      patientId,
      DIA_TROQUEI_EQ,
      DIA_TROQUEI_EQ,
    ).expect(200);
    const [day] = res.body.days as DayShape[];
    expect(day.status).toBe('com-dado');
    expect(day.valorPct).toBe(100); // mesma adesão do DIA_FEITO (US1.1)
    expect(day.dentroFaixa).toBe(true);
    expect(day.flags).toEqual({});
    expect(day.cobertura).toBe(1);
  });

  it('US2.2 — opção não-default cumprida → adesão pelo desfecho (expectativa calculada pelo núcleo)', async () => {
    expect(
      expectativaOpcao,
      'seed precisa de uma refeição com opção não-default em algum tipo-de-dia',
    ).not.toBeNull();
    const res = await getAdesao(patientId, DIA_OPCAO, DIA_OPCAO).expect(200);
    const [day] = res.body.days as DayShape[];
    expect(day.status).toBe('com-dado');
    expect(day.valorPct).toBeCloseTo(expectativaOpcao!.valorPct, 6);
    expect(day.dentroFaixa).toBe(expectativaOpcao!.dentroFaixa);
  });

  it('US2.3 — pulei compensado (total fecha na faixa) → 100% pela saturação, cobertura 1', async () => {
    const res = await getAdesao(
      patientId,
      DIA_COMPENSADO,
      DIA_COMPENSADO,
    ).expect(200);
    const [day] = res.body.days as DayShape[];
    expect(day.status).toBe('com-dado');
    expect(day.valorPct).toBe(100);
    expect(day.dentroFaixa).toBe(true);
    expect(day.cobertura).toBe(1); // pulei É registro — cobre o slot
  });

  it('US2.4 — troquei que estoura a faixa → fora de adesão, valor conforme o núcleo', async () => {
    expect(expectativaEstouro).not.toBeNull();
    expect(expectativaEstouro!.dentroFaixa).toBe(false); // sanidade do cenário
    const res = await getAdesao(patientId, DIA_ESTOURO, DIA_ESTOURO).expect(
      200,
    );
    const [day] = res.body.days as DayShape[];
    expect(day.status).toBe('com-dado');
    expect(day.dentroFaixa).toBe(false);
    expect(day.valorPct).toBeCloseTo(expectativaEstouro!.valorPct, 6);
    expect(day.valorPct).toBeLessThan(100);
  });
});

// ──────────────── US3 — série por dia + média do período ────────────────

describe('US3 — série diária + média (a linha dos 80%)', () => {
  it('US3.1 — período devolve um item por dia, em ordem, com sem-dado explícito', async () => {
    const from = isoDaysAgo(10);
    const to = isoDaysAgo(3);
    const res = await getAdesao(patientId, from, to).expect(200);
    const days = res.body.days as DayShape[];
    expect(days).toHaveLength(8);
    expect(days.map((d) => d.date)).toEqual(
      [10, 9, 8, 7, 6, 5, 4, 3].map(isoDaysAgo),
    );
    const por = new Map(days.map((d) => [d.date, d]));
    expect(por.get(DIA_VAZIO)?.status).toBe('sem-dado');
    expect(por.get(DIA_ANULADO)?.status).toBe('sem-dado');
    expect(por.get(DIA_FEITO)?.status).toBe('com-dado');
    expect(por.get(DIA_PULEI)?.status).toBe('com-dado');
    // sem-dado NUNCA carrega valor (≠ 0%)
    expect(por.get(DIA_VAZIO)?.valorPct).toBeUndefined();
  });

  it('US3.3 — média do período = média aritmética EXATA dos dias com dado (SC-010)', async () => {
    const res = await getAdesao(
      patientId,
      isoDaysAgo(10),
      isoDaysAgo(3),
    ).expect(200);
    const days = res.body.days as DayShape[];
    const comDado = days.filter((d) => d.status === 'com-dado');
    expect(comDado.length).toBeGreaterThan(0);
    const esperada =
      comDado.reduce((acc, d) => acc + (d.valorPct as number), 0) /
      comDado.length;
    expect(res.body.media).toBeCloseTo(esperada, 10);
  });

  it('US3.2 — período inteiro anterior ao primeiro registro → série toda sem-dado, media null', async () => {
    const res = await getAdesao(
      patientId,
      isoDaysAgo(20),
      isoDaysAgo(16),
    ).expect(200);
    const days = res.body.days as DayShape[];
    expect(days).toHaveLength(5);
    expect(days.every((d) => d.status === 'sem-dado')).toBe(true);
    expect(res.body.media).toBeNull();
  });

  it('edge — registros com tipos-de-dia divergentes no mesmo dia → alvo do fallback (programação)', async () => {
    expect(expectativaDivergente).not.toBeNull();
    const res = await getAdesao(
      patientId,
      DIA_DIVERGENTE,
      DIA_DIVERGENTE,
    ).expect(200);
    const [day] = res.body.days as DayShape[];
    expect(day.status).toBe('com-dado');
    expect(day.valorPct).toBeCloseTo(expectativaDivergente!.valorPct, 6);
    expect(day.dentroFaixa).toBe(expectativaDivergente!.dentroFaixa);
    expect(day.cobertura).toBeCloseTo(expectativaDivergente!.cobertura, 10);
  });
});

// ──────────────────── US4 — o paciente nunca vê ────────────────────

describe('US4 — via da nutri inalcançável + zero vazamento pro paciente', () => {
  it('SC-008 — sem x-nutri-key (a chamada que o app do paciente faria) → 403; chave errada → 403', async () => {
    await request(app.getHttpServer())
      .get(`/nutri/patients/${patientId}/adesao`)
      .query({ from: DIA_FEITO, to: DIA_FEITO })
      .expect(403);
    await request(app.getHttpServer())
      .get(`/nutri/patients/${patientId}/adesao`)
      .query({ from: DIA_FEITO, to: DIA_FEITO })
      .set('x-nutri-key', 'chave-errada')
      .expect(403);
  });

  it('SC-005/SC-007 — GET /today (fluxo do paciente) não contém NENHUM campo de adesão', async () => {
    const res = await request(app.getHttpServer())
      .get(`/patients/${patientId}/today`)
      .expect(200);
    const proibidas = new Set([
      'adesao',
      'valorPct',
      'dentroFaixa',
      'cobertura',
      'media',
    ]);
    const achadas: string[] = [];
    const varrer = (v: unknown): void => {
      if (Array.isArray(v)) return v.forEach(varrer);
      if (v && typeof v === 'object') {
        for (const [k, val] of Object.entries(v)) {
          if (proibidas.has(k)) achadas.push(k);
          varrer(val);
        }
      }
    };
    varrer(res.body);
    expect(achadas).toEqual([]);
  });

  it('FR-009 — a consulta de adesão não escreve nada (estado do banco idêntico)', async () => {
    const antes = await db
      .select({ id: schema.mealEvent.id })
      .from(schema.mealEvent);
    await getAdesao(patientId, isoDaysAgo(10), isoDaysAgo(3)).expect(200);
    const depois = await db
      .select({ id: schema.mealEvent.id })
      .from(schema.mealEvent);
    expect(depois.length).toBe(antes.length);
  });
});

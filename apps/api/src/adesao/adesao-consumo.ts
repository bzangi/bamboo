// Helper de CASCA (Feature 006) — carrega o CONSUMO REAL de um PERÍODO
// [from..to] em queries batch (4 selects pro range inteiro — sem N+1 por dia),
// generalizando o padrão de registro-consumo.ts (que é por-dia/localToday e
// segue intacto pros gatilhos da Fase 4). Ver research.md D5.
//
// Mesma semântica da Fase 3/4: estado vigente por (data, refeição) via
// estadoVigente (core); feito = itens da opção cumprida (fallback D9);
// troquei = snapshot completo de meal_event_item; pulei = []. Inclui o
// day_type_id do evento vigente (insumo da resolução do alvo — Q3-B/D3).
// Casca de LEITURA: I/O via Drizzle, não lança; imutável.
import {
  estadoVigente,
  type EstadoRegistro,
  type EventoRegistro,
  type ItemNutricional,
} from '@bamboo/core';
import { and, asc, eq, gte, inArray, lte, schema } from '@bamboo/db';
import type { Db } from '../db/db.module';

export interface ConsumoRefeicaoAdesao {
  readonly mealId: string;
  readonly position: number; // pareia slots entre tipos-de-dia (D4)
  readonly state: EstadoRegistro;
  readonly dayTypeId: string; // snapshot do tipo em vigor no registro (003 FR-014)
  readonly itens: readonly ItemNutricional[]; // consumo real; pulei = []
}

export interface ConsumoDiaAdesao {
  readonly porMeal: ReadonlyMap<string, ConsumoRefeicaoAdesao>;
}

const toMacros = (f: {
  readonly carbPer100g: number;
  readonly proteinPer100g: number;
  readonly fatPer100g: number;
  readonly kcalPer100g: number;
}): ItemNutricional['macros'] => ({
  carbPer100g: f.carbPer100g,
  proteinPer100g: f.proteinPer100g,
  fatPer100g: f.fatPer100g,
  kcalPer100g: f.kcalPer100g,
});

export async function carregarConsumoPorPeriodo(
  db: Db,
  args: {
    readonly patientId: string;
    readonly planId: string;
    readonly from: string; // YYYY-MM-DD (inclusive)
    readonly to: string; // YYYY-MM-DD (inclusive)
  },
): Promise<ReadonlyMap<string, ConsumoDiaAdesao>> {
  const { patientId, planId, from, to } = args;

  // 1. TODOS os meal_event do range (type-agnostic), com a position da meal.
  const eventos = await db
    .select({
      id: schema.mealEvent.id,
      mealId: schema.mealEvent.mealId,
      dayTypeId: schema.mealEvent.dayTypeId,
      position: schema.meal.position,
      chosenMealOptionId: schema.mealEvent.chosenMealOptionId,
      state: schema.mealEvent.state,
      loggedDate: schema.mealEvent.loggedDate,
      createdAt: schema.mealEvent.createdAt,
    })
    .from(schema.mealEvent)
    .innerJoin(schema.meal, eq(schema.mealEvent.mealId, schema.meal.id))
    .where(
      and(
        eq(schema.mealEvent.patientId, patientId),
        eq(schema.mealEvent.planId, planId),
        gte(schema.mealEvent.loggedDate, from),
        lte(schema.mealEvent.loggedDate, to),
      ),
    )
    .orderBy(asc(schema.mealEvent.createdAt));

  if (eventos.length === 0) return new Map();

  // 2. Agrupa por (loggedDate, mealId) e resolve o estado vigente (core).
  type EventoBruto = (typeof eventos)[number];
  const porDiaMeal = new Map<string, EventoBruto[]>();
  for (const e of eventos) {
    const key = `${e.loggedDate}|${e.mealId}`;
    const lista = porDiaMeal.get(key) ?? [];
    lista.push(e);
    porDiaMeal.set(key, lista);
  }

  const vigentes: {
    loggedDate: string;
    mealId: string;
    state: EstadoRegistro;
    eventoVigente: EventoBruto;
  }[] = [];
  for (const lista of porDiaMeal.values()) {
    const eventosCore: EventoRegistro[] = lista.map((e) => ({
      seq: e.createdAt.getTime(),
      state: e.state,
    }));
    const state = estadoVigente(eventosCore);
    if (state === null) continue; // anulado/desfeito → fora
    const eventoVigente = lista.reduce((maior, e) =>
      e.createdAt.getTime() > maior.createdAt.getTime() ? e : maior,
    );
    vigentes.push({
      loggedDate: eventoVigente.loggedDate,
      mealId: eventoVigente.mealId,
      state,
      eventoVigente,
    });
  }
  if (vigentes.length === 0) return new Map();

  // 3a. Opções cumpridas dos 'feito' (fallback D9: default; senão a 1ª por id).
  const feitos = vigentes.filter((v) => v.state === 'feito');
  const optionIdPorEvento = new Map<string, string>(); // eventoId → mealOptionId
  const mealsSemOpcao = [
    ...new Set(
      feitos
        .filter((v) => !v.eventoVigente.chosenMealOptionId)
        .map((v) => v.mealId),
    ),
  ];
  const fallbackPorMeal = new Map<string, string>();
  if (mealsSemOpcao.length > 0) {
    const opcoes = await db
      .select({
        id: schema.mealOption.id,
        mealId: schema.mealOption.mealId,
        isDefault: schema.mealOption.isDefault,
      })
      .from(schema.mealOption)
      .where(inArray(schema.mealOption.mealId, mealsSemOpcao));
    for (const mealId of mealsSemOpcao) {
      const doMeal = opcoes.filter((o) => o.mealId === mealId);
      const escolhida =
        doMeal.find((o) => o.isDefault) ??
        [...doMeal].sort((a, b) => a.id.localeCompare(b.id))[0];
      if (escolhida) fallbackPorMeal.set(mealId, escolhida.id);
    }
  }
  for (const v of feitos) {
    const optId =
      v.eventoVigente.chosenMealOptionId ?? fallbackPorMeal.get(v.mealId);
    if (optId) optionIdPorEvento.set(v.eventoVigente.id, optId);
  }

  // 3b. Itens planejados das opções cumpridas (feito).
  const optionIds = [...new Set(optionIdPorEvento.values())];
  const planItems =
    optionIds.length === 0
      ? []
      : await db
          .select({
            mealOptionId: schema.mealItem.mealOptionId,
            quantityGrams: schema.mealItem.quantityGrams,
            carbPer100g: schema.food.carbPer100g,
            proteinPer100g: schema.food.proteinPer100g,
            fatPer100g: schema.food.fatPer100g,
            kcalPer100g: schema.food.kcalPer100g,
          })
          .from(schema.mealItem)
          .innerJoin(schema.food, eq(schema.mealItem.foodId, schema.food.id))
          .where(inArray(schema.mealItem.mealOptionId, optionIds));

  // 3c. Snapshot completo dos 'troquei' (meal_event_item dos eventos vigentes).
  const troqueiEventIds = vigentes
    .filter((v) => v.state === 'troquei')
    .map((v) => v.eventoVigente.id);
  const snapItems =
    troqueiEventIds.length === 0
      ? []
      : await db
          .select({
            mealEventId: schema.mealEventItem.mealEventId,
            quantityGrams: schema.mealEventItem.quantityGrams,
            carbPer100g: schema.food.carbPer100g,
            proteinPer100g: schema.food.proteinPer100g,
            fatPer100g: schema.food.fatPer100g,
            kcalPer100g: schema.food.kcalPer100g,
          })
          .from(schema.mealEventItem)
          .innerJoin(
            schema.food,
            eq(schema.mealEventItem.foodId, schema.food.id),
          )
          .where(inArray(schema.mealEventItem.mealEventId, troqueiEventIds));

  // 4. Monta o mapa data → { porMeal }.
  const dias = new Map<string, Map<string, ConsumoRefeicaoAdesao>>();
  for (const v of vigentes) {
    let itens: readonly ItemNutricional[];
    if (v.state === 'pulei') {
      itens = [];
    } else if (v.state === 'feito') {
      const optId = optionIdPorEvento.get(v.eventoVigente.id);
      itens =
        optId === undefined
          ? []
          : planItems
              .filter((pi) => pi.mealOptionId === optId)
              .map((pi) => ({
                macros: toMacros(pi),
                gramas: pi.quantityGrams,
              }));
    } else {
      itens = snapItems
        .filter((si) => si.mealEventId === v.eventoVigente.id)
        .map((si) => ({ macros: toMacros(si), gramas: si.quantityGrams }));
    }
    const porMeal = dias.get(v.loggedDate) ?? new Map();
    porMeal.set(v.mealId, {
      mealId: v.mealId,
      position: v.eventoVigente.position,
      state: v.state,
      dayTypeId: v.eventoVigente.dayTypeId,
      itens,
    });
    dias.set(v.loggedDate, porMeal);
  }

  return new Map([...dias.entries()].map(([d, m]) => [d, { porMeal: m }]));
}

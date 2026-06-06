// Helper de CASCA (imperative shell) — carrega o CONSUMO REAL do dia corrente,
// type-agnostic (qualquer tipo-de-dia), do plano informado. Reusado por dois
// consumidores da Fase 3: o rebalance.service na troca de opção (excluir as
// refeições registradas das alavancas + alimentar o totalAtual com o consumido)
// e o plan.service na troca de tipo-de-dia (passar `consumido` ao
// previewTrocaTipoDia sem double-count). Ver data-model.md (Deriva) + D4/D9.
//
// É casca de LEITURA: faz I/O via Drizzle, orquestra o núcleo puro (estadoVigente,
// somaNutrientes) e NÃO lança — devolve os dados; quem decide erro é o caller.
// Imutável: spread/map/reduce, nunca muta o retorno do Drizzle.
//
// Carga TYPE-AGNOSTIC (D4): meal_event filtrado SÓ por (patientId, planId,
// loggedDate=localToday()) — NUNCA restrito por mealId nem por tipo-de-dia. Se
// restringisse, a troca de tipo-de-dia zeraria o consumido (as refeições já
// comidas pertencem ao tipo antigo). O JOIN com meal carrega a `position` de
// cada refeição (pareia slots entre tipos-de-dia na US3).
import {
  estadoVigente,
  somaNutrientes,
  type EstadoRegistro,
  type EventoRegistro,
  type ItemNutricional,
  type Nutrientes,
} from '@bamboo/core';
import { and, asc, eq, inArray, schema } from '@bamboo/db';
import type { Db } from './db/db.module';
import { localToday } from './local-date';

// Consumo real de UMA refeição com estado vigente registrado hoje.
export interface ConsumoRefeicao {
  readonly mealId: string;
  readonly position: number; // posição da refeição (p/ parear slots entre tipos-de-dia, US3)
  readonly state: EstadoRegistro; // vigente: 'feito' | 'troquei' | 'pulei'
  readonly itens: readonly ItemNutricional[]; // consumo real ({macros, gramas}); pulei = []
}

export interface ConsumoDoDia {
  readonly porMeal: ReadonlyMap<string, ConsumoRefeicao>; // só refeições com estado vigente != null
  readonly consumido: Nutrientes; // agregado de TODAS as registradas (interno; nunca exposto)
}

// Macros por 100g → forma FoodMacros do núcleo. Pura.
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

export async function carregarConsumoDoDia(
  db: Db,
  args: { readonly patientId: string; readonly planId: string },
): Promise<ConsumoDoDia> {
  const { patientId, planId } = args;
  const loggedDate = localToday();

  // 1. TODOS os meal_event de (patientId, planId, loggedDate), type-agnostic.
  //    JOIN com meal p/ a position. Ordenado por created_at (asc) → seq por meal.
  const eventos = await db
    .select({
      id: schema.mealEvent.id,
      mealId: schema.mealEvent.mealId,
      position: schema.meal.position,
      chosenMealOptionId: schema.mealEvent.chosenMealOptionId,
      state: schema.mealEvent.state,
      createdAt: schema.mealEvent.createdAt,
    })
    .from(schema.mealEvent)
    .innerJoin(schema.meal, eq(schema.mealEvent.mealId, schema.meal.id))
    .where(
      and(
        eq(schema.mealEvent.patientId, patientId),
        eq(schema.mealEvent.planId, planId),
        eq(schema.mealEvent.loggedDate, loggedDate),
      ),
    )
    .orderBy(asc(schema.mealEvent.createdAt));

  if (eventos.length === 0) {
    return { porMeal: new Map(), consumido: somaNutrientes([]) };
  }

  // 2. Agrupa por mealId. seq = created_at.getTime() (estadoVigente é robusto à
  //    ordem; usar o timestamp evita reordenar). Guarda o evento bruto p/ depois
  //    identificar o vigente (maior created_at = last-write-wins).
  type EventoBruto = (typeof eventos)[number];
  const porMealEventos = new Map<string, EventoBruto[]>();
  for (const e of eventos) {
    const lista = porMealEventos.get(e.mealId) ?? [];
    lista.push(e);
    porMealEventos.set(e.mealId, lista);
  }

  // 3. Para cada refeição: estado vigente (core) + evento vigente (last-write).
  const refeicoes = [...porMealEventos.entries()]
    .map(([mealId, lista]) => {
      const eventosCore: EventoRegistro[] = lista.map((e) => ({
        seq: e.createdAt.getTime(),
        state: e.state,
      }));
      const state = estadoVigente(eventosCore);
      if (state === null) return null; // sem evento vigente / desfeito → fora do porMeal

      // Evento vigente = o de maior created_at (last-write-wins). Seu state == vigente.
      const eventoVigente = lista.reduce((maior, e) =>
        e.createdAt.getTime() > maior.createdAt.getTime() ? e : maior,
      );
      return { mealId, state, eventoVigente };
    })
    .filter(
      (
        r,
      ): r is {
        mealId: string;
        state: EstadoRegistro;
        eventoVigente: EventoBruto;
      } => r !== null,
    );

  // 4. Carrega os itens consumidos por estado:
  //    - pulei → [].
  //    - feito → meal_item da OPÇÃO CUMPRIDA (chosenMealOptionId do evento vigente;
  //      fallback D9: default da refeição; senão a 1ª opção) × gramas planejadas.
  //    - troquei → meal_event_item do EVENTO VIGENTE (snapshot completo, D3b).

  // 4a. Opções cumpridas a resolver para 'feito'. Quando o evento vigente já tem
  //     chosenMealOptionId, usa direto; senão resolve o fallback por mealId.
  const feitos = refeicoes.filter((r) => r.state === 'feito');
  const optionIdPorMeal = new Map<string, string>(); // mealId → meal_option_id cumprida
  const mealsSemOpcao: string[] = []; // 'feito' sem chosenMealOptionId → fallback
  for (const r of feitos) {
    if (r.eventoVigente.chosenMealOptionId) {
      optionIdPorMeal.set(r.mealId, r.eventoVigente.chosenMealOptionId);
    } else {
      mealsSemOpcao.push(r.mealId);
    }
  }

  // Fallback D9: default da refeição; se não houver default, a 1ª opção (por id).
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
      if (escolhida) optionIdPorMeal.set(mealId, escolhida.id);
    }
  }

  // 4b. Itens planejados das opções cumpridas (feito).
  const optionIds = [...optionIdPorMeal.values()];
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

  // 4c. Snapshot completo das refeições 'troquei' (meal_event_item do evento vigente).
  const troqueiEventIds = refeicoes
    .filter((r) => r.state === 'troquei')
    .map((r) => r.eventoVigente.id);
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

  // 5. Monta o ConsumoRefeicao por refeição registrada.
  const porMeal = new Map<string, ConsumoRefeicao>();
  for (const r of refeicoes) {
    let itens: readonly ItemNutricional[];
    if (r.state === 'pulei') {
      itens = [];
    } else if (r.state === 'feito') {
      const optId = optionIdPorMeal.get(r.mealId);
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
      // troquei
      itens = snapItems
        .filter((si) => si.mealEventId === r.eventoVigente.id)
        .map((si) => ({ macros: toMacros(si), gramas: si.quantityGrams }));
    }
    porMeal.set(r.mealId, {
      mealId: r.mealId,
      position: r.eventoVigente.position,
      state: r.state,
      itens,
    });
  }

  // 6. consumido = soma de TODOS os itens de TODAS as registradas (uma só vez).
  const todosItens = [...porMeal.values()].flatMap((r) => r.itens);
  const consumido = somaNutrientes(todosItens);

  return { porMeal, consumido };
}

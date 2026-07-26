// Loader de CASCA (Feature 012) — EMPILHA sobre `registro-vigente.loader`:
// recebe o registro vigente já resolvido e só resolve os NUTRIENTES de cada
// refeição registrada. Substitui `registro-consumo.ts` (por-dia) e
// `adesao/adesao-consumo.ts` (por-período), que eram a mesma coisa em duas
// generalidades.
//
// NÃO consulta `meal_event` (FR-006) — esse é o leitor de baixo. Consulta
// `meal_event_item`, que é o SNAPSHOT do troquei, não o evento.
//
// Semântica preservada da Fase 3/4, sem uma linha de matemática nova:
//  - `pulei`  → PRESENTE no mapa com `itens: []`. Filtrar "quem tem itens"
//               reintroduziria double-count: a pulada precisa entrar como
//               `isRegistered: true` com 0 kcal para SAIR das alavancas.
//  - `feito`  → itens planejados da OPÇÃO CUMPRIDA (`chosenMealOptionId` do
//               evento vigente; fallback D9: a default da refeição, senão a 1ª
//               por id).
//  - `troquei`→ snapshot completo de `meal_event_item` do evento vigente (D3b).
//
// NÃO devolve agregado do dia (FR-007): `somaNutrientes` fica no call site que
// precisar dele — dos 3 consumidores, um não usa agregado nenhum.
import type { EstadoRegistro, ItemNutricional } from '@bamboo/core';
import { eq, inArray, schema } from '@bamboo/db';
import type { Db } from './db/db.module';
import type { RegistroVigente } from './registro-vigente.loader';

export interface RefeicaoConsumida {
  readonly mealId: string;
  readonly position: number; // pareia slots entre tipos-de-dia (D4)
  readonly state: EstadoRegistro;
  readonly itens: ReadonlyArray<ItemNutricional>; // consumo real; `pulei` = []
}

// `dayTypeId` NÃO entra aqui de propósito: quem precisa dele (a resolução Q3-B
// do tipo-de-dia alvo, na adesão) o pega dos VIGENTES, pareando por
// (date, mealId). Duplicá-lo criaria duas fontes para o mesmo snapshot.

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

/**
 * Consumo real por dia e refeição, a partir do registro vigente da janela.
 * 3 queries batch para o período inteiro (sem N+1 por dia): opção cumprida dos
 * `feito` sem escolha explícita, itens planejados das opções cumpridas e
 * snapshot dos `troquei`.
 *
 * Devolve `Map<date, Map<mealId, RefeicaoConsumida>>`. Um dia só aparece se tem
 * ao menos uma refeição com registro vigente — dia sem registro está AUSENTE,
 * nunca presente-e-vazio (a distinção é observável: o `/today` depende dela
 * para não apagar os badges do dia).
 */
export async function carregarConsumoReal(
  db: Db,
  vigentes: ReadonlyArray<RegistroVigente>,
): Promise<ReadonlyMap<string, ReadonlyMap<string, RefeicaoConsumida>>> {
  if (vigentes.length === 0) return new Map();

  // 1. Opção cumprida dos 'feito' (fallback D9 quando o evento não a gravou).
  const feitos = vigentes.filter((v) => v.state === 'feito');
  const mealsSemOpcao = [
    ...new Set(
      feitos.filter((v) => !v.chosenMealOptionId).map((v) => v.mealId),
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
  const optionIdPorEvento = new Map<string, string>(); // eventoId → mealOptionId
  for (const v of feitos) {
    const optId = v.chosenMealOptionId ?? fallbackPorMeal.get(v.mealId);
    if (optId) optionIdPorEvento.set(v.eventoId, optId);
  }

  // 2. Itens planejados das opções cumpridas (feito).
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

  // 3. Snapshot completo dos 'troquei' (meal_event_item dos eventos vigentes).
  const troqueiEventIds = vigentes
    .filter((v) => v.state === 'troquei')
    .map((v) => v.eventoId);
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

  // 4. Monta date → mealId → consumo.
  const dias = new Map<string, Map<string, RefeicaoConsumida>>();
  for (const v of vigentes) {
    let itens: ReadonlyArray<ItemNutricional>;
    if (v.state === 'pulei') {
      itens = [];
    } else if (v.state === 'feito') {
      const optId = optionIdPorEvento.get(v.eventoId);
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
        .filter((si) => si.mealEventId === v.eventoId)
        .map((si) => ({ macros: toMacros(si), gramas: si.quantityGrams }));
    }
    const doDia = dias.get(v.date) ?? new Map<string, RefeicaoConsumida>();
    doDia.set(v.mealId, {
      mealId: v.mealId,
      position: v.position,
      state: v.state,
      itens,
    });
    dias.set(v.date, doDia);
  }
  return dias;
}

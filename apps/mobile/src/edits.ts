// Estado de sessão da EDIÇÃO EM LOTE por refeição (020). Reducer puro (padrão
// swaps.ts da 005): sem I/O, sem throw, sem mutação. O render e o consumo
// continuam em nameOverrides/consumoOverrides — fonte ÚNICA (D5); aqui mora só
// o que o desfazer atômico precisa: o "antes" de cada item editado + os
// ajustes derivados da prévia. Desfazer repõe trocas E ajustes num ato;
// re-editar substitui a edição inteira (last-edit-wins — o desfazer cobre a
// última edição, o previous dela já é o estado com a anterior aplicada).
import type { ItemAjustadoDto, RebalanceOutcomeDto } from "@bamboo/types";
import type { ConsumoItem } from "./consumo";
import { buildAdjustments } from "./swaps";

// Mesma forma do NameOverride do HomeScreen (compatibilidade estrutural).
export interface EditNameOverride {
  readonly foodName: string;
  readonly quantityLabel: string;
}

// O que o item tinha ANTES da edição. Campo ausente = não havia override —
// distinção observável: o desfazer repõe o valor ou APAGA a chave.
export interface ItemPrevious {
  readonly name?: EditNameOverride;
  readonly consumo?: readonly ConsumoItem[];
}

export interface MealEdit {
  readonly previous: Readonly<Record<string, ItemPrevious>>;
  // itemId (de OUTRAS refeições) -> rótulo de quantidade formatado.
  readonly adjustments: Readonly<Record<string, string>>;
}

// mealId editado -> edição ativa.
export type EditState = Readonly<Record<string, MealEdit>>;

export interface ApplyEditArgs {
  readonly mealId: string;
  readonly previous: Readonly<Record<string, ItemPrevious>>;
  readonly outcome: RebalanceOutcomeDto;
  readonly formatLabel: (item: ItemAjustadoDto) => string;
}

// Aplica (ou substitui) a edição de uma refeição.
export function applyEdit(state: EditState, args: ApplyEditArgs): EditState {
  return {
    ...state,
    [args.mealId]: {
      previous: args.previous,
      adjustments: buildAdjustments(args.outcome, args.formatLabel),
    },
  };
}

// Desfaz a edição inteira (o chamador restaura os overrides com os helpers
// abaixo usando o MealEdit ANTES de chamar isto).
export function undoEdit(state: EditState, mealId: string): EditState {
  if (!(mealId in state)) return state;
  const next = { ...state };
  delete next[mealId];
  return next;
}

// União dos ajustes de todas as edições (render, junto ao flatten das swaps).
export function flattenEditAdjustments(
  state: EditState,
): Readonly<Record<string, string>> {
  return Object.values(state).reduce<Record<string, string>>((acc, edit) => {
    Object.assign(acc, edit.adjustments);
    return acc;
  }, {});
}

// Fotografa o override corrente dos itens editados, no confirmar. Campo só
// entra se existia — ausência é o que manda o desfazer apagar a chave.
export function capturarPrevious(
  itemIds: readonly string[],
  nameOverrides: Readonly<Record<string, EditNameOverride>>,
  consumoOverrides: Readonly<Record<string, readonly ConsumoItem[]>>,
): Readonly<Record<string, ItemPrevious>> {
  return itemIds.reduce<Record<string, ItemPrevious>>((acc, id) => {
    const name = nameOverrides[id];
    const consumo = consumoOverrides[id];
    acc[id] = {
      ...(name !== undefined ? { name } : {}),
      ...(consumo !== undefined ? { consumo } : {}),
    };
    return acc;
  }, {});
}

function restaurar<V>(
  atual: Readonly<Record<string, V>>,
  previous: Readonly<Record<string, ItemPrevious>>,
  valorAnterior: (p: ItemPrevious) => V | undefined,
): Readonly<Record<string, V>> {
  const next: Record<string, V> = { ...atual };
  for (const [itemId, p] of Object.entries(previous)) {
    const anterior = valorAnterior(p);
    if (anterior === undefined) delete next[itemId];
    else next[itemId] = anterior;
  }
  return next;
}

// Desfazer: devolvem os overrides ao estado anterior à edição (itens fora da
// edição ficam intocados).
export function restaurarNames(
  atual: Readonly<Record<string, EditNameOverride>>,
  previous: Readonly<Record<string, ItemPrevious>>,
): Readonly<Record<string, EditNameOverride>> {
  return restaurar(atual, previous, (p) => p.name);
}

export function restaurarConsumo(
  atual: Readonly<Record<string, readonly ConsumoItem[]>>,
  previous: Readonly<Record<string, ItemPrevious>>,
): Readonly<Record<string, readonly ConsumoItem[]>> {
  return restaurar(atual, previous, (p) => p.consumo);
}

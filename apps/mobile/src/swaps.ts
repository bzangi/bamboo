// Estado de sessão da TROCA DE OPÇÃO, por refeição-gatilho. Reducer puro: sem
// I/O, sem throw, sem mutação — retorna novo estado por spread. Não é regra de
// domínio (a matemática do rebalanceamento mora em @bamboo/core); é estado de
// apresentação do app do paciente, e por isso vive aqui, não no core.
//
// Os ajustes derivados do rebalanceamento moram DENTRO da troca (não num mapa
// de itens solto), então:
//   - desfazer a troca remove opção + ajustes juntos (atômico);
//   - re-trocar substitui os ajustes da troca anterior (sem fantasma);
//   - ajuste derivado nunca aparece como mudança "do item" → sem desfazer
//     por-item (a UI só oferece desfazer por-item para mudança direta).
import type { ItemAjustadoDto, RebalanceOutcomeDto } from "@bamboo/types";

export interface ActiveSwap {
  readonly chosenOptionId: string;
  // Opção a restaurar ao desfazer; no v0 = defaultOption.id da refeição.
  readonly previousOptionId: string;
  // itemId -> rótulo de quantidade já formatado (das OUTRAS refeições).
  readonly adjustments: Readonly<Record<string, string>>;
}

// mealId-gatilho -> troca ativa.
export type SwapState = Readonly<Record<string, ActiveSwap>>;

export interface ApplySwapArgs {
  readonly mealId: string;
  readonly chosenOptionId: string;
  readonly previousOptionId: string;
  readonly outcome: RebalanceOutcomeDto;
  // A UI injeta a formatação (medida caseira/gramas); o reducer não conhece
  // formatGrams — só reorganiza dados.
  readonly formatLabel: (item: ItemAjustadoDto) => string;
}

function buildAdjustments(
  outcome: RebalanceOutcomeDto,
  formatLabel: (item: ItemAjustadoDto) => string,
): Readonly<Record<string, string>> {
  if (outcome.kind !== "rebalanceado") return {};
  return outcome.refeicoesAfetadas.reduce<Record<string, string>>((acc, r) => {
    for (const it of r.itensAjustados) acc[it.itemId] = formatLabel(it);
    return acc;
  }, {});
}

// Aplica (ou substitui) a troca de uma refeição. Substituição integral garante
// que a re-troca não deixe ajustes da troca anterior (FR-006).
export function applySwap(state: SwapState, args: ApplySwapArgs): SwapState {
  return {
    ...state,
    [args.mealId]: {
      chosenOptionId: args.chosenOptionId,
      previousOptionId: args.previousOptionId,
      adjustments: buildAdjustments(args.outcome, args.formatLabel),
    },
  };
}

// Desfaz a troca inteira (opção + ajustes derivados) de uma refeição (FR-003).
export function undoSwap(state: SwapState, mealId: string): SwapState {
  if (!(mealId in state)) return state;
  const next = { ...state };
  delete next[mealId];
  return next;
}

// Opção ativa de uma refeição (undefined = sem troca → usar a default).
export function activeOptionId(
  state: SwapState,
  mealId: string,
): string | undefined {
  return state[mealId]?.chosenOptionId;
}

// União dos ajustes de todas as trocas → itemId -> rótulo, para o render.
// Conjuntos de itens disjuntos na prática (cada troca mexe em itens de outras
// refeições).
export function flattenAdjustments(
  state: SwapState,
): Readonly<Record<string, string>> {
  return Object.values(state).reduce<Record<string, string>>((acc, swap) => {
    Object.assign(acc, swap.adjustments);
    return acc;
  }, {});
}

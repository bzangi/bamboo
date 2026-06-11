// Seletor PURO do sinal "ajustado" (009). Estado de apresentação, fora do core.
// Unifica as duas fontes de reconciliação:
//  - servidor: `meal.rebalanceado` (troca de tipo-de-dia — vem do GET /today);
//  - sessão: a refeição recebeu um ajuste derivado de uma troca de OPÇÃO (005),
//    detectado pelos itemIds ajustados (chaves de flattenAdjustments(swaps)).
// Sem I/O, sem dependência do shape de SwapState (recebe só o conjunto de ids).

export interface SignalMeal {
  readonly rebalanceado: boolean;
  readonly defaultOption: {
    readonly items: readonly { readonly id: string }[];
  };
}

/**
 * Deve exibir o sinal "ajustado" nesta refeição?
 * @param meal refeição exibida (flag do servidor + itens da opção default)
 * @param adjustedItemIds itemIds ajustados na sessão (= chaves de
 *   flattenAdjustments(swaps)); vazio quando não há troca de opção ativa.
 */
export function deveSinalizar(
  meal: SignalMeal,
  adjustedItemIds: ReadonlySet<string>,
): boolean {
  if (meal.rebalanceado) return true;
  return meal.defaultOption.items.some((it) => adjustedItemIds.has(it.id));
}

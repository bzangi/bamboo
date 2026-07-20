// US2 (010) — montagem do consumo efetivo (substituir/combinar -> itens
// enviados no registro), extraída de HomeScreen.handleRegistrar (padrão 005 /
// swaps.ts: função pura de apresentação, sem I/O). O servidor deriva "troquei"
// a partir do que esta função monta.
import type { MealOptionDto, RegistroConsumo } from "@bamboo/types";

// Item consumido, já materializado (foodId + gramas). Combinação gera 2
// entradas pro mesmo itemId.
export interface ConsumoItem {
  readonly itemId: string;
  readonly foodId: string;
  readonly quantityGrams: number;
}

// Monta o RegistroConsumo a enviar no registro "feito", ou undefined quando
// não há adequação nenhuma (opção default, sem itens trocados/combinados).
export function montarConsumo(
  activeOption: MealOptionDto,
  consumoOverrides: Readonly<Record<string, readonly ConsumoItem[]>>,
  defaultOptionId: string,
): RegistroConsumo | undefined {
  // Overrides fora da opção ativa são ignorados (só itens dela contam).
  const items = activeOption.items.flatMap(
    (it) => consumoOverrides[it.id] ?? [],
  );
  const optionNaoDefault = activeOption.id !== defaultOptionId;
  if (!optionNaoDefault && items.length === 0) return undefined;

  return {
    chosenOptionId: activeOption.id,
    ...(items.length > 0 ? { items } : {}),
  };
}

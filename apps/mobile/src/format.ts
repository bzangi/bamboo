// Funções puras de apresentação. Respeitam a assinatura do produto:
// "mostra o certo por padrão" e "faixa-alvo, sem gamificação de restrição".
// NUNCA inventam bucket de % de caloria; só formatam o que o DTO autoriza.
import type {
  MealItemDto,
  NutritionDto,
  SubstitutionAlternativeDto,
} from "@bamboo/types";

/** 018 — o que a nutri escreve no lugar da quantidade. Item "à vontade" não tem
 *  quantidade prescrita: mostrar "0 g" seria a tela mentindo com número certo. */
export const A_VONTADE = "à vontade";

/** Texto da quantidade de um item do plano. Item à vontade curto-circuita: nem
 *  gramas, nem medida caseira, nem quantidade trocada. */
export function formatQuantidadeItem(item: {
  readonly adLibitum: boolean;
  readonly quantityGrams: number;
  // Opcional no DTO (ausente quando o alimento não tem medida preferida).
  readonly medidaCaseira?: {
    readonly label: string;
    readonly grams: number;
  } | null;
}): string {
  if (item.adLibitum) return A_VONTADE;
  return item.medidaCaseira
    ? formatMedidaPlanejada(item.quantityGrams, item.medidaCaseira)
    : formatGrams(item.quantityGrams);
}

// Quantidade em gramas, sem casas decimais supérfluas.
export function formatGrams(grams: number): string {
  const rounded = Math.round(grams);
  return `${rounded} g`;
}

// Item planejado em UNIDADE/FATIA quando há medida preferida (ovo, fruta):
// "1 unidade média", "2× unidade média". Granel cai em formatGrams (medida null).
export function formatMedidaPlanejada(
  quantityGrams: number,
  medida: { readonly label: string; readonly grams: number },
): string {
  const n = Math.max(1, Math.round(quantityGrams / medida.grams));
  return n === 1 ? medida.label : `${n}× ${medida.label}`;
}

// Rótulo principal de uma alternativa de troca: medida caseira quando houver,
// senão a quantidade em gramas (edge case "alvo sem medida caseira").
export function formatAlternativeQuantity(
  alt: SubstitutionAlternativeDto,
): string {
  if (alt.medidaCaseira) {
    return `${alt.medidaCaseira.label} (${formatGrams(alt.gramas)})`;
  }
  return formatGrams(alt.gramas);
}

// Linha nutricional montada APENAS com o que o gate de exposição liberou.
// hidden -> nutrition ausente -> retorna null (não exibe nada).
// Não calcula nem mostra "% de caloria" como meta/restrição.
// Compartilhada pelo item do card (formatNutritionLine) e pela alternativa de
// troca (010 — mesma linguagem visual, sob o mesmo gate).
export function formatNutrition(n: NutritionDto | undefined): string | null {
  if (!n) return null;

  const parts: string[] = [];
  if (typeof n.kcal === "number") parts.push(`${Math.round(n.kcal)} kcal`);
  if (typeof n.carb === "number") parts.push(`C ${Math.round(n.carb)}g`);
  if (typeof n.protein === "number") parts.push(`P ${Math.round(n.protein)}g`);
  if (typeof n.fat === "number") parts.push(`G ${Math.round(n.fat)}g`);

  // Nível 'percent': só proporções (sem gramas/kcal).
  if (parts.length === 0) {
    if (typeof n.carbPct === "number")
      parts.push(`C ${Math.round(n.carbPct)}%`);
    if (typeof n.proteinPct === "number")
      parts.push(`P ${Math.round(n.proteinPct)}%`);
    if (typeof n.fatPct === "number") parts.push(`G ${Math.round(n.fatPct)}%`);
  }

  return parts.length > 0 ? parts.join(" · ") : null;
}

export function formatNutritionLine(item: MealItemDto): string | null {
  return formatNutrition(item.nutrition);
}

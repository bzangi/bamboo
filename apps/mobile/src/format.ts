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
  return formatQuantidade(item.quantityGrams, item.medidaCaseira);
}

// Quantidade em gramas, sem casas decimais supérfluas.
export function formatGrams(grams: number): string {
  const rounded = Math.round(grams);
  return `${rounded} g`;
}

// Quantidade de QUALQUER porção (item do plano, alternativa de troca, parte de
// combinação, item rebalanceado): medida caseira quando houver, senão gramas.
export function formatQuantidade(
  grams: number,
  medida?: { readonly label: string; readonly grams: number } | null,
): string {
  // `medida.grams` vem do banco; 0 daria Infinity na contagem.
  if (!medida || !(medida.grams > 0)) return formatGrams(grams);
  const n = Math.max(1, Math.round(grams / medida.grams));
  // O "1" vai escrito: "unidade média" sozinho não diz se é uma ou o rótulo.
  const label = n === 1 ? medida.label : pluralizar(medida.label);
  return `${n} ${label} (${formatGrams(grams)})`;
}

// Plural pt-BR do rótulo de medida caseira ("unidade média" -> "unidades
// médias", "colher de sopa cheia" -> "colheres de sopa cheias"). Flexiona o
// núcleo e os adjetivos; pula preposição, o termo que ela governa e parênteses.
// ponytail: regra suficiente para os 15 rótulos do TACO; rótulo novo que ela
// errar entra numa tabela de exceções aqui.
function pluralizar(label: string): string {
  const preposicoes = new Set(["de", "da", "do", "com", "em", "no", "na"]);
  const palavras = label.split(" ");
  return palavras
    .map((p, i) => {
      const anterior = palavras[i - 1];
      const invariavel =
        preposicoes.has(p) ||
        (anterior !== undefined && preposicoes.has(anterior)) ||
        p.includes("(");
      return invariavel ? p : plural(p);
    })
    .join(" ");
}

function plural(p: string): string {
  if (p.endsWith("s")) return p;
  if (p.endsWith("ão")) return `${p.slice(0, -2)}ões`;
  if (p.endsWith("m")) return `${p.slice(0, -1)}ns`;
  if (p.endsWith("l")) return `${p.slice(0, -1)}is`;
  if (/[rz]$/.test(p)) return `${p}es`;
  return `${p}s`;
}

// Diff de uma quantidade ajustada, na linguagem do git: o "antes" fica visível
// junto do "depois", com direção e tamanho da mudança. null quando a mudança
// arredonda pra 0 g — nada a anunciar.
export function formatDiffQuantidade(
  gramasAntes: number,
  gramasNovo: number,
  medida?: { readonly label: string; readonly grams: number } | null,
): string | null {
  const delta = Math.round(gramasNovo) - Math.round(gramasAntes);
  if (delta === 0) return null;
  const seta = delta > 0 ? "↑" : "↓";
  const antes = formatQuantidade(gramasAntes, medida);
  return `${seta} ${Math.abs(delta)} g · antes ${antes}`;
}

// Rótulo principal de uma alternativa de troca (edge case "alvo sem medida").
export function formatAlternativeQuantity(
  alt: SubstitutionAlternativeDto,
): string {
  return formatQuantidade(alt.gramas, alt.medidaCaseira);
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

const DIAS = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
] as const;

const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
] as const;

/** Data por extenso do cabeçalho: "quinta-feira, 27 de julho".
 *  Tabela à mão em vez de `Intl.DateTimeFormat`: o suporte a locale no Hermes
 *  depende de build e plataforma, e uma data que sai em inglês num dos dois
 *  sistemas operacionais é pior que 24 linhas de constante. */
export function dataExtenso(d: Date): string {
  return `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`;
}

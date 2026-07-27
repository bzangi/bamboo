// O SUMÁRIO DO DIA do topo da home: kcal, carboidrato, proteína e gordura do
// dia como ele está AGORA na tela.
//
// Sem JSX de propósito (padrão do `swaps.ts`/`consumo.ts`): é o pedaço com
// decisão, e num `.ts` ele roda no Vitest — não há harness de componente aqui.
//
// O QUE ENTRA: a opção ATIVA de cada refeição (a padrão, ou a que o paciente
// trocou na sessão). Somar as outras opções contaria a refeição duas ou três
// vezes — é a mesma definição de "o dia" que o motor de rebalanceamento usa.
// Refeição marcada "pulei" NÃO entra: ela não foi comida.
//
// De onde vem o número de cada item, nesta ordem:
//  1. trocou/combinou/editou → a nutrição do que ele escolheu, que veio da API
//     junto com a alternativa (a conta de equivalência é do servidor).
//  2. rebalanceado → a nutrição planejada REESCALADA pelas gramas novas
//     (nutriente é linear na quantidade: a mesma regra de três do servidor).
//     Sem isso o total mostraria o dia ANTES do ajuste — justamente o número
//     que o rebalanceamento acabou de mudar.
//  3. senão → a nutrição que o `/today` já traz no item.
//
// O GATE DE EXPOSIÇÃO decide sozinho, sem um `if` de nível aqui: o eixo que o
// servidor não mandou fica `null` e não é exibido. Em `percent`/`hidden` não
// vem eixo nenhum e a faixa some inteira — o app não inventa número que a nutri
// não liberou.
import type { MealDto, NutritionDto } from "@bamboo/types";
import { activeOptionId, type SwapState } from "./swaps";

/** `null` = o eixo não foi liberado pela exposição (ou o dia não tem item com
 *  número). Quem exibe pula o eixo nulo em vez de escrever "0". */
export interface ResumoDia {
  readonly kcal: number | null;
  readonly carb: number | null;
  readonly protein: number | null;
  readonly fat: number | null;
}

const EIXOS = ["kcal", "carb", "protein", "fat"] as const;
type Eixo = (typeof EIXOS)[number];

export const RESUMO_VAZIO: ResumoDia = {
  kcal: null,
  carb: null,
  protein: null,
  fat: null,
};

/** Tem algum eixo pra mostrar? Falso ⇒ a faixa inteira não é renderizada. */
export function temNumero(r: ResumoDia): boolean {
  return EIXOS.some((k) => r[k] !== null);
}

export interface EntradaResumo {
  readonly meals: readonly MealDto[];
  /** Trocas de opção da sessão — a MESMA fonte que o card usa pra decidir qual
   *  opção desenhar (`activeOptionId`), não uma segunda definição de "ativa". */
  readonly swaps: SwapState;
  /** itemId → nutrição do que o paciente pôs no lugar (troca, combinação,
   *  edição em lote). Chave presente com `null` = adaptado sem nutrição
   *  disponível (só acontece sob exposição que já esconde tudo). */
  readonly trocados: Readonly<Record<string, NutritionDto | null>>;
  /** itemId → gramas novas vindas do rebalanceamento. */
  readonly ajustados: Readonly<Record<string, number>>;
}

export function resumoDoDia(e: EntradaResumo): ResumoDia {
  const total: Record<Eixo, number | null> = { ...RESUMO_VAZIO };

  for (const meal of e.meals) {
    if (meal.registro?.state === "pulei") continue;
    const ativa =
      meal.options.find((o) => o.id === activeOptionId(e.swaps, meal.id)) ??
      meal.defaultOption;

    for (const item of ativa.items) {
      // 018: item à vontade não tem quantidade prescrita — contribui zero de
      // qualquer forma, e o `/today` já não emite nutrição nele.
      if (item.adLibitum) continue;
      const n = nutricaoDoItem(item, e);
      if (!n) continue;
      for (const k of EIXOS) {
        const v = n[k];
        if (typeof v === "number") total[k] = (total[k] ?? 0) + v;
      }
    }
  }

  return total;
}

function nutricaoDoItem(
  item: MealDto["defaultOption"]["items"][number],
  e: EntradaResumo,
): NutritionDto | undefined {
  const trocado = e.trocados[item.id];
  if (trocado !== undefined) return trocado ?? undefined;

  const gramasNovo = e.ajustados[item.id];
  if (gramasNovo !== undefined && item.quantityGrams > 0)
    return escalar(item.nutrition, gramasNovo / item.quantityGrams);

  return item.nutrition;
}

/** Regra de três sobre a porção. As proporções (`*Pct`) não escalam — são
 *  razões entre macros, e a razão não muda com a quantidade. */
function escalar(
  n: NutritionDto | undefined,
  fator: number,
): NutritionDto | undefined {
  if (!n) return undefined;
  const x = (v: number | undefined): number | undefined =>
    typeof v === "number" ? v * fator : v;
  return {
    ...n,
    kcal: x(n.kcal),
    carb: x(n.carb),
    protein: x(n.protein),
    fat: x(n.fat),
  };
}

/** Soma as nutrições das partes de uma combinação (1 item → 2 alimentos): o
 *  item continua sendo UM aporte no dia. Eixo que falta em qualquer das partes
 *  fica de fora do resultado — meia soma seria pior que ausência. */
export function somarNutricao(
  partes: readonly (NutritionDto | undefined)[],
): NutritionDto | undefined {
  const presentes = partes.filter((p): p is NutritionDto => p !== undefined);
  if (presentes.length === 0) return undefined;
  const soma: Record<string, number | undefined> = {};
  for (const k of EIXOS) {
    const vs = presentes.map((p) => p[k]);
    if (vs.every((v) => typeof v === "number"))
      soma[k] = vs.reduce<number>((a, v) => a + (v as number), 0);
  }
  return soma;
}

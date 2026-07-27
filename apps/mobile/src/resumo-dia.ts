// O SUMÁRIO DO DIA do topo da home: consumido × meta, em kcal, carboidrato,
// proteína e gordura.
//
// Sem JSX de propósito (padrão do `swaps.ts`/`consumo.ts`): é o pedaço com
// decisão, e num `.ts` ele roda no Vitest — não há harness de componente aqui.
//
// A META é o dia PLANEJADO: soma da opção PADRÃO de todas as refeições do
// tipo-de-dia exibido, com as gramas do plano. É a definição de `alvoDoDia` no
// `@bamboo/core`, a mesma que o motor de rebalanceamento usa pra decidir se o
// dia fechou — a tela não inventa uma segunda régua. Não existe alvo prescrito
// no banco (nem coluna, nem endpoint): o alvo É o plano.
// Refeição pulada NÃO sai da meta: a meta é o dia, e pular deixa o dia curto.
//
// O CONSUMIDO é só o que foi registrado como comido (`feito`/`troquei`).
// Refeição por vir e refeição pulada contribuem zero — o velocímetro enche
// conforme o dia é registrado.
//
// De onde vem o número de cada item consumido, nesta ordem:
//  1. trocou/combinou/editou → a nutrição do que ele escolheu, que veio da API
//     junto com a alternativa (a conta de equivalência é do servidor).
//  2. rebalanceado → a nutrição planejada REESCALADA pelas gramas novas
//     (nutriente é linear na quantidade: a mesma regra de três do servidor).
//  3. senão → a nutrição que o `/today` já traz no item.
//
// O GATE DE EXPOSIÇÃO decide sozinho, sem um `if` de nível aqui: o eixo que o
// servidor não mandou fica `null` e não é exibido. Em `percent`/`hidden` não
// vem eixo nenhum e a faixa some inteira — o app não inventa número que a nutri
// não liberou.
import type { MealDto, MealOptionDto, NutritionDto } from "@bamboo/types";
import { activeOptionId, type SwapState } from "./swaps";

/** `null` = o eixo não foi liberado pela exposição (ou não há item com número).
 *  Quem exibe pula o eixo nulo em vez de escrever "0". */
export interface Eixos {
  readonly kcal: number | null;
  readonly carb: number | null;
  readonly protein: number | null;
  readonly fat: number | null;
}

export interface SumarioDia {
  /** O que já foi registrado como comido hoje. */
  readonly consumido: Eixos;
  /** O dia planejado — o alvo. */
  readonly meta: Eixos;
}

const EIXOS = ["kcal", "carb", "protein", "fat"] as const;
type Eixo = (typeof EIXOS)[number];

const VAZIO: Eixos = { kcal: null, carb: null, protein: null, fat: null };

/** Tem algum eixo pra mostrar? Falso ⇒ a faixa inteira não é renderizada. */
export function temNumero(e: Eixos): boolean {
  return EIXOS.some((k) => e[k] !== null);
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

export function sumarioDoDia(e: EntradaResumo): SumarioDia {
  const consumido: Record<Eixo, number | null> = { ...VAZIO };
  const meta: Record<Eixo, number | null> = { ...VAZIO };

  for (const meal of e.meals) {
    // Meta: sempre a opção padrão, sempre o planejado — sem troca de sessão e
    // sem os ajustes do rebalanceamento. (Sob override de tipo-de-dia o
    // servidor já manda as gramas reconciliadas na padrão; a meta é o plano
    // como ele está hoje, que é o que o motor também avalia.)
    acumular(meta, meal.defaultOption, () => undefined);

    const estado = meal.registro?.state;
    if (estado !== "feito" && estado !== "troquei") continue;
    const ativa =
      meal.options.find((o) => o.id === activeOptionId(e.swaps, meal.id)) ??
      meal.defaultOption;
    acumular(consumido, ativa, (item) => nutricaoDoItem(item, e));
  }

  return { consumido, meta };
}

type Item = MealOptionDto["items"][number];

function acumular(
  destino: Record<Eixo, number | null>,
  opcao: MealOptionDto,
  substituta: (item: Item) => NutritionDto | undefined,
): void {
  for (const item of opcao.items) {
    // 018: item à vontade não tem quantidade prescrita — contribui zero de
    // qualquer forma, e o `/today` já não emite nutrição nele.
    if (item.adLibitum) continue;
    const n = substituta(item) ?? item.nutrition;
    if (!n) continue;
    for (const k of EIXOS) {
      const v = n[k];
      if (typeof v === "number") destino[k] = (destino[k] ?? 0) + v;
    }
  }
}

function nutricaoDoItem(
  item: Item,
  e: EntradaResumo,
): NutritionDto | undefined {
  const trocado = e.trocados[item.id];
  // Chave presente vence o ajuste: quem trocou de alimento não é reescalado
  // pelas gramas do que saiu. `null` = sem número ⇒ o item fica de fora.
  if (trocado !== undefined) return trocado ?? SEM_NUMERO;

  const gramasNovo = e.ajustados[item.id];
  if (gramasNovo !== undefined && item.quantityGrams > 0)
    return escalar(item.nutrition, gramasNovo / item.quantityGrams);

  return item.nutrition;
}

/** Sentinela: nutrição vazia. Distingue "trocado e sem número" (fica de fora)
 *  de "não trocado" (usa a do plano) sem um segundo valor de retorno. */
const SEM_NUMERO: NutritionDto = {};

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

/** Fração do velocímetro, presa em [0, 1]. Meta ausente ou zero ⇒ 0: não há o
 *  que preencher, e dividir por zero desenharia um arco cheio sem motivo.
 *  Passar da meta NÃO vira alerta — a faixa-alvo não é teto; o arco satura e o
 *  número diz o resto. */
export function fracao(consumido: number | null, meta: number | null): number {
  if (consumido === null || meta === null || meta <= 0) return 0;
  return Math.max(0, Math.min(1, consumido / meta));
}

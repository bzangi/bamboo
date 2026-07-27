import { describe, expect, it } from "vitest";
import type { MealDto, MealOptionDto, NutritionDto } from "@bamboo/types";
import { applySwap, type SwapState } from "./swaps";
import { resumoDoDia, somarNutricao, temNumero } from "./resumo-dia";

// O número do topo só serve se for VERDADE: ele é a primeira coisa que o
// paciente lê, e um total que não acompanha o que está na tela é pior que
// nenhum total.

const nut = (kcal: number, carb = 0, protein = 0, fat = 0): NutritionDto => ({
  kcal,
  carb,
  protein,
  fat,
});

let n = 0;
function item(
  nutrition: NutritionDto | undefined,
  quantityGrams = 100,
  extra: { readonly adLibitum?: boolean; readonly id?: string } = {},
) {
  const id = extra.id ?? `i${++n}`;
  return {
    id,
    food: { id: `f-${id}`, name: id },
    quantityGrams,
    isLocked: false,
    adLibitum: extra.adLibitum ?? false,
    substitutionGroupId: "g1",
    substitutable: true,
    ...(nutrition ? { nutrition } : {}),
  };
}

const opcao = (
  id: string,
  isDefault: boolean,
  items: MealOptionDto["items"],
): MealOptionDto => ({ id, label: id, isDefault, items });

function refeicao(
  id: string,
  options: readonly MealOptionDto[],
  registro: MealDto["registro"] = null,
): MealDto {
  const defaultOption = options.find((o) => o.isDefault) ?? options[0]!;
  return {
    id,
    name: id,
    position: 1,
    horario: null,
    options,
    defaultOption,
    otherOptionsCount: options.length - 1,
    registro,
    isCurrent: false,
    rebalanceado: false,
  };
}

const VAZIO = { swaps: {}, trocados: {}, ajustados: {} } as const;

describe("resumoDoDia", () => {
  it("soma a opção padrão de cada refeição", () => {
    const meals = [
      refeicao("cafe", [opcao("o1", true, [item(nut(200, 30, 8, 4))])]),
      refeicao("almoco", [opcao("o2", true, [item(nut(500, 60, 40, 12))])]),
    ];
    expect(resumoDoDia({ ...VAZIO, meals })).toEqual({
      kcal: 700,
      carb: 90,
      protein: 48,
      fat: 16,
    });
  });

  it("a opção NÃO escolhida não entra — senão a refeição contaria duas vezes", () => {
    const meals = [
      refeicao("almoco", [
        opcao("o1", true, [item(nut(500))]),
        opcao("o2", false, [item(nut(900))]),
      ]),
    ];
    expect(resumoDoDia({ ...VAZIO, meals }).kcal).toBe(500);
  });

  it("troca de opção: passa a somar a escolhida", () => {
    const meals = [
      refeicao("almoco", [
        opcao("o1", true, [item(nut(500))]),
        opcao("o2", false, [item(nut(900))]),
      ]),
    ];
    const swaps: SwapState = applySwap(
      {},
      {
        mealId: "almoco",
        chosenOptionId: "o2",
        previousOptionId: "o1",
        outcome: { kind: "sem-acao" },
        formatLabel: () => "",
      },
    );
    expect(resumoDoDia({ ...VAZIO, meals, swaps }).kcal).toBe(900);
  });

  it("refeição pulada não entra: ela não foi comida", () => {
    const meals = [
      refeicao("cafe", [opcao("o1", true, [item(nut(200))])], {
        state: "pulei",
      }),
      refeicao("almoco", [opcao("o2", true, [item(nut(500))])], {
        state: "feito",
      }),
    ];
    expect(resumoDoDia({ ...VAZIO, meals }).kcal).toBe(500);
  });

  it("item trocado conta pela nutrição do substituto, não pela do que saiu", () => {
    const trocado = item(nut(500), 100, { id: "alvo" });
    const meals = [refeicao("almoco", [opcao("o1", true, [trocado])])];
    expect(
      resumoDoDia({ ...VAZIO, meals, trocados: { alvo: nut(120) } }).kcal,
    ).toBe(120);
  });

  it("item rebalanceado é reescalado pelas gramas novas", () => {
    // O rebalanceamento mexe nas GRAMAS de itens de outras refeições, e o
    // /today segue mandando a nutrição do planejado. Sem reescalar, o topo
    // mostraria o dia ANTES do ajuste — o número que acabou de mudar.
    const alvo = item(nut(200, 40, 10, 2), 100, { id: "arroz" });
    const meals = [refeicao("jantar", [opcao("o1", true, [alvo])])];
    expect(resumoDoDia({ ...VAZIO, meals, ajustados: { arroz: 150 } })).toEqual(
      { kcal: 300, carb: 60, protein: 15, fat: 3 },
    );
  });

  it("a troca vence o ajuste: quem trocou não é reescalado por gramas antigas", () => {
    const alvo = item(nut(200), 100, { id: "arroz" });
    const meals = [refeicao("jantar", [opcao("o1", true, [alvo])])];
    expect(
      resumoDoDia({
        ...VAZIO,
        meals,
        trocados: { arroz: nut(90) },
        ajustados: { arroz: 150 },
      }).kcal,
    ).toBe(90);
  });

  it("item à vontade não entra (não tem quantidade prescrita)", () => {
    const meals = [
      refeicao("almoco", [
        opcao("o1", true, [
          item(undefined, 0, { adLibitum: true }),
          item(nut(500)),
        ]),
      ]),
    ];
    expect(resumoDoDia({ ...VAZIO, meals }).kcal).toBe(500);
  });

  it("exposição 'macros': soma os macros e o eixo de kcal fica nulo", () => {
    // Sem `if` de nível de exposição: o eixo que o servidor não mandou some.
    const semKcal: NutritionDto = { carb: 30, protein: 10, fat: 5 };
    const meals = [refeicao("cafe", [opcao("o1", true, [item(semKcal)])])];
    const r = resumoDoDia({ ...VAZIO, meals });
    expect(r).toEqual({ kcal: null, carb: 30, protein: 10, fat: 5 });
    expect(temNumero(r)).toBe(true);
  });

  it("exposição 'hidden'/'percent': nada a mostrar, a faixa não aparece", () => {
    const soPct: NutritionDto = { carbPct: 50, proteinPct: 30, fatPct: 20 };
    const hidden = [refeicao("cafe", [opcao("o1", true, [item(undefined)])])];
    const percent = [refeicao("cafe", [opcao("o1", true, [item(soPct)])])];
    expect(temNumero(resumoDoDia({ ...VAZIO, meals: hidden }))).toBe(false);
    expect(temNumero(resumoDoDia({ ...VAZIO, meals: percent }))).toBe(false);
  });

  it("dia sem refeição é vazio, não zero", () => {
    expect(temNumero(resumoDoDia({ ...VAZIO, meals: [] }))).toBe(false);
  });
});

describe("somarNutricao", () => {
  it("as duas metades da combinação viram um aporte só", () => {
    expect(somarNutricao([nut(100, 20, 2, 1), nut(50, 10, 1, 0)])).toEqual({
      kcal: 150,
      carb: 30,
      protein: 3,
      fat: 1,
    });
  });

  it("eixo que falta numa das partes fica de fora — meia soma seria pior", () => {
    expect(somarNutricao([nut(100), { carb: 10 }])).toEqual({ carb: 10 });
    expect(somarNutricao([undefined, undefined])).toBeUndefined();
  });
});

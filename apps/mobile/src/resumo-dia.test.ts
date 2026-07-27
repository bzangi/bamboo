import { describe, expect, it } from "vitest";
import type { MealDto, MealOptionDto, NutritionDto } from "@bamboo/types";
import { applySwap, type SwapState } from "./swaps";
import { fracao, somarNutricao, sumarioDoDia, temNumero } from "./resumo-dia";

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

const FEITO = { state: "feito" } as const;
const VAZIO = { swaps: {}, trocados: {}, ajustados: {} } as const;

describe("meta — o dia planejado", () => {
  it("soma a opção PADRÃO de todas as refeições, registradas ou não", () => {
    const meals = [
      refeicao("cafe", [opcao("o1", true, [item(nut(200, 30, 8, 4))])], FEITO),
      refeicao("almoco", [opcao("o2", true, [item(nut(500, 60, 40, 12))])]),
    ];
    expect(sumarioDoDia({ ...VAZIO, meals }).meta).toEqual({
      kcal: 700,
      carb: 90,
      protein: 48,
      fat: 16,
    });
  });

  it("a opção NÃO padrão não entra — senão a refeição contaria duas vezes", () => {
    const meals = [
      refeicao("almoco", [
        opcao("o1", true, [item(nut(500))]),
        opcao("o2", false, [item(nut(900))]),
      ]),
    ];
    expect(sumarioDoDia({ ...VAZIO, meals }).meta.kcal).toBe(500);
  });

  it("refeição pulada continua na meta: pular deixa o dia curto", () => {
    const meals = [
      refeicao("cafe", [opcao("o1", true, [item(nut(200))])], {
        state: "pulei",
      }),
      refeicao("almoco", [opcao("o2", true, [item(nut(500))])], FEITO),
    ];
    const { consumido, meta } = sumarioDoDia({ ...VAZIO, meals });
    expect(meta.kcal).toBe(700);
    expect(consumido.kcal).toBe(500);
  });

  it("a meta ignora a troca de opção da sessão — o alvo é o plano", () => {
    const meals = [
      refeicao(
        "almoco",
        [
          opcao("o1", true, [item(nut(500))]),
          opcao("o2", false, [item(nut(900))]),
        ],
        FEITO,
      ),
    ];
    const swaps = trocar("almoco", "o2", "o1");
    const { consumido, meta } = sumarioDoDia({ ...VAZIO, meals, swaps });
    expect(meta.kcal).toBe(500);
    expect(consumido.kcal).toBe(900);
  });
});

describe("consumido — só o que foi registrado como comido", () => {
  it("refeição por vir não conta; feito e troquei contam", () => {
    const meals = [
      refeicao("cafe", [opcao("o1", true, [item(nut(200))])], FEITO),
      refeicao("almoco", [opcao("o2", true, [item(nut(500))])], {
        state: "troquei",
      }),
      refeicao("jantar", [opcao("o3", true, [item(nut(700))])]),
    ];
    expect(sumarioDoDia({ ...VAZIO, meals }).consumido.kcal).toBe(700);
  });

  it("nada registrado: consumido vazio, meta cheia", () => {
    const meals = [refeicao("cafe", [opcao("o1", true, [item(nut(200))])])];
    const { consumido, meta } = sumarioDoDia({ ...VAZIO, meals });
    expect(consumido.kcal).toBeNull();
    expect(meta.kcal).toBe(200);
  });

  it("item trocado conta pela nutrição do substituto, não pela do que saiu", () => {
    const trocado = item(nut(500), 100, { id: "alvo" });
    const meals = [refeicao("almoco", [opcao("o1", true, [trocado])], FEITO)];
    expect(
      sumarioDoDia({ ...VAZIO, meals, trocados: { alvo: nut(120) } }).consumido
        .kcal,
    ).toBe(120);
  });

  it("item rebalanceado é reescalado pelas gramas novas", () => {
    // O rebalanceamento mexe nas GRAMAS de itens de outras refeições, e o
    // /today segue mandando a nutrição do planejado. Sem reescalar, o topo
    // contaria o dia ANTES do ajuste — o número que acabou de mudar.
    const alvo = item(nut(200, 40, 10, 2), 100, { id: "arroz" });
    const meals = [refeicao("jantar", [opcao("o1", true, [alvo])], FEITO)];
    expect(
      sumarioDoDia({ ...VAZIO, meals, ajustados: { arroz: 150 } }).consumido,
    ).toEqual({ kcal: 300, carb: 60, protein: 15, fat: 3 });
  });

  it("a troca vence o ajuste: quem trocou não é reescalado por gramas antigas", () => {
    const alvo = item(nut(200), 100, { id: "arroz" });
    const meals = [refeicao("jantar", [opcao("o1", true, [alvo])], FEITO)];
    expect(
      sumarioDoDia({
        ...VAZIO,
        meals,
        trocados: { arroz: nut(90) },
        ajustados: { arroz: 150 },
      }).consumido.kcal,
    ).toBe(90);
  });

  it("item à vontade não entra (não tem quantidade prescrita)", () => {
    const meals = [
      refeicao(
        "almoco",
        [
          opcao("o1", true, [
            item(undefined, 0, { adLibitum: true }),
            item(nut(500)),
          ]),
        ],
        FEITO,
      ),
    ];
    const { consumido, meta } = sumarioDoDia({ ...VAZIO, meals });
    expect(consumido.kcal).toBe(500);
    expect(meta.kcal).toBe(500);
  });
});

describe("gate de exposição", () => {
  it("'macros': soma os macros e o eixo de kcal fica nulo", () => {
    // Sem `if` de nível de exposição: o eixo que o servidor não mandou some.
    const semKcal: NutritionDto = { carb: 30, protein: 10, fat: 5 };
    const meals = [refeicao("cafe", [opcao("o1", true, [item(semKcal)])])];
    const { meta } = sumarioDoDia({ ...VAZIO, meals });
    expect(meta).toEqual({ kcal: null, carb: 30, protein: 10, fat: 5 });
    expect(temNumero(meta)).toBe(true);
  });

  it("'hidden'/'percent': nada a mostrar, a faixa não aparece", () => {
    const soPct: NutritionDto = { carbPct: 50, proteinPct: 30, fatPct: 20 };
    const hidden = [refeicao("cafe", [opcao("o1", true, [item(undefined)])])];
    const percent = [refeicao("cafe", [opcao("o1", true, [item(soPct)])])];
    expect(temNumero(sumarioDoDia({ ...VAZIO, meals: hidden }).meta)).toBe(
      false,
    );
    expect(temNumero(sumarioDoDia({ ...VAZIO, meals: percent }).meta)).toBe(
      false,
    );
  });

  it("dia sem refeição é vazio, não zero", () => {
    expect(temNumero(sumarioDoDia({ ...VAZIO, meals: [] }).meta)).toBe(false);
  });
});

describe("fracao", () => {
  it("é a razão consumido/meta", () => {
    expect(fracao(500, 2000)).toBe(0.25);
  });

  it("satura em cheio: passar da meta não é alerta, a faixa-alvo não é teto", () => {
    expect(fracao(3000, 2000)).toBe(1);
  });

  it("sem meta (ou meta zero) não há arco a preencher", () => {
    expect(fracao(500, null)).toBe(0);
    expect(fracao(500, 0)).toBe(0);
    expect(fracao(null, 2000)).toBe(0);
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

function trocar(
  mealId: string,
  chosenOptionId: string,
  previousOptionId: string,
): SwapState {
  return applySwap(
    {},
    {
      mealId,
      chosenOptionId,
      previousOptionId,
      outcome: { kind: "sem-acao" },
      formatLabel: () => "",
    },
  );
}

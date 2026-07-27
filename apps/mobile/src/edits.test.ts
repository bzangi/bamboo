import { describe, expect, it } from "vitest";
import type { RebalanceOutcomeDto } from "@bamboo/types";
import {
  applyEdit,
  capturarPrevious,
  flattenEditAdjustments,
  restaurarConsumo,
  restaurarNames,
  undoEdit,
  type EditState,
} from "./edits";

const rebalanceado: RebalanceOutcomeDto = {
  kind: "rebalanceado",
  refeicoesAfetadas: [
    {
      mealId: "m2",
      name: "Jantar",
      position: 2,
      itensAjustados: [
        {
          itemId: "i-frango",
          food: { id: "f1", name: "Frango" },
          gramasNovo: 114.4,
          medidaCaseira: null,
        },
      ],
    },
  ],
};

const semAcao: RebalanceOutcomeDto = { kind: "sem-acao" };

const formatLabel = (it: { gramasNovo: number }) => `${it.gramasNovo} g`;

const nome = (foodName: string) => ({ foodName, quantityLabel: "100 g" });
const consumo = (itemId: string, foodId: string) => [
  { itemId, foodId, quantityGrams: 100 },
];

describe("applyEdit", () => {
  it("guarda o previous e os ajustes formatados da prévia", () => {
    const state = applyEdit(
      {},
      {
        mealId: "m1",
        previous: { "i-a": { name: nome("Arroz") } },
        outcome: rebalanceado,
        formatLabel,
      },
    );
    expect(state["m1"]?.previous["i-a"]?.name?.foodName).toBe("Arroz");
    expect(state["m1"]?.adjustments).toEqual({ "i-frango": "114.4 g" });
  });

  it("sem-acao → sem ajustes", () => {
    const state = applyEdit(
      {},
      { mealId: "m1", previous: {}, outcome: semAcao, formatLabel },
    );
    expect(state["m1"]?.adjustments).toEqual({});
  });

  it("re-editar substitui a edição inteira (last-edit-wins)", () => {
    const primeira = applyEdit(
      {},
      {
        mealId: "m1",
        previous: { "i-a": { name: nome("Arroz") } },
        outcome: rebalanceado,
        formatLabel,
      },
    );
    const segunda = applyEdit(primeira, {
      mealId: "m1",
      previous: { "i-b": {} },
      outcome: semAcao,
      formatLabel,
    });
    expect(segunda["m1"]?.previous).toEqual({ "i-b": {} });
    expect(segunda["m1"]?.adjustments).toEqual({});
  });
});

describe("undoEdit", () => {
  it("remove a edição da refeição", () => {
    const state = applyEdit(
      {},
      { mealId: "m1", previous: {}, outcome: semAcao, formatLabel },
    );
    expect(undoEdit(state, "m1")).toEqual({});
  });

  it("refeição sem edição → mesmo estado (referência)", () => {
    const state: EditState = {};
    expect(undoEdit(state, "m9")).toBe(state);
  });
});

describe("flattenEditAdjustments", () => {
  it("agrega os rótulos de todas as edições", () => {
    let state: EditState = applyEdit(
      {},
      { mealId: "m1", previous: {}, outcome: rebalanceado, formatLabel },
    );
    state = applyEdit(state, {
      mealId: "m3",
      previous: {},
      outcome: {
        kind: "rebalanceado",
        refeicoesAfetadas: [
          {
            mealId: "m2",
            name: "Jantar",
            position: 2,
            itensAjustados: [
              {
                itemId: "i-outro",
                food: { id: "f2", name: "Macarrão" },
                gramasNovo: 57.2,
                medidaCaseira: null,
              },
            ],
          },
        ],
      },
      formatLabel,
    });
    expect(flattenEditAdjustments(state)).toEqual({
      "i-frango": "114.4 g",
      "i-outro": "57.2 g",
    });
  });
});

describe("capturarPrevious", () => {
  it("captura o override corrente de cada item editado; ausente fica AUSENTE", () => {
    const previous = capturarPrevious(
      ["i-a", "i-b"],
      { "i-a": nome("Feijão") },
      { "i-b": consumo("i-b", "f9") },
    );
    expect(previous["i-a"]?.name?.foodName).toBe("Feijão");
    expect(Object.keys(previous["i-a"] ?? {})).toEqual(["name"]);
    expect(previous["i-b"]?.consumo?.[0]?.foodId).toBe("f9");
    expect(Object.keys(previous["i-b"] ?? {})).toEqual(["consumo"]);
  });

  it("item sem nenhum override antes → entrada vazia (o desfazer APAGA)", () => {
    const previous = capturarPrevious(["i-x"], {}, {});
    expect(previous["i-x"]).toEqual({});
  });
});

describe("restaurarNames / restaurarConsumo", () => {
  it("repõe o valor anterior quando havia e apaga quando não havia", () => {
    const previous = {
      "i-a": { name: nome("Feijão") }, // tinha troca avulsa antes
      "i-b": {}, // não tinha nada antes
    };
    const names = restaurarNames(
      { "i-a": nome("Lentilha"), "i-b": nome("Grão"), "i-c": nome("Alheio") },
      previous,
    );
    expect(names["i-a"]?.foodName).toBe("Feijão");
    expect("i-b" in names).toBe(false);
    expect(names["i-c"]?.foodName).toBe("Alheio"); // fora da edição: intocado

    const consumos = restaurarConsumo(
      { "i-a": consumo("i-a", "f1"), "i-b": consumo("i-b", "f2") },
      previous,
    );
    expect("i-a" in consumos).toBe(false); // antes só havia name override
    expect("i-b" in consumos).toBe(false);
  });
});

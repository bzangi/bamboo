import { describe, expect, it } from "vitest";
import type { ItemAjustadoDto, RebalanceOutcomeDto } from "@bamboo/types";
import {
  activeOptionId,
  applySwap,
  flattenAdjustments,
  undoSwap,
  type SwapState,
} from "./swaps";

// Formatter trivial nos testes (a UI injeta o de verdade, com medida caseira).
const fmt = (it: ItemAjustadoDto): string => `${it.gramasNovo}g`;

const item = (
  itemId: string,
  gramasNovo: number,
  name = itemId,
): ItemAjustadoDto => ({
  itemId,
  food: { id: `food-${itemId}`, name },
  gramasNovo,
  medidaCaseira: null,
});

const rebalanceado = (
  refeicoes: ReadonlyArray<{
    readonly mealId: string;
    readonly itens: readonly ItemAjustadoDto[];
  }>,
): RebalanceOutcomeDto => ({
  kind: "rebalanceado",
  refeicoesAfetadas: refeicoes.map((r, i) => ({
    mealId: r.mealId,
    name: r.mealId,
    position: i + 1,
    itensAjustados: r.itens,
  })),
});

const semAcao: RebalanceOutcomeDto = { kind: "sem-acao" };
const recusa: RebalanceOutcomeDto = {
  kind: "recusa-orientada",
  motivo: "estoura-piso",
  mensagem: "não cabe",
};

describe("applySwap", () => {
  it("monta adjustments por itemId a partir de um outcome rebalanceado", () => {
    const out = rebalanceado([
      { mealId: "jantar", itens: [item("it-1", 60), item("it-2", 120)] },
    ]);
    const state = applySwap({}, {
      mealId: "almoco",
      chosenOptionId: "opt-mandioca",
      previousOptionId: "opt-arroz",
      outcome: out,
      formatLabel: fmt,
    });

    expect(state.almoco?.chosenOptionId).toBe("opt-mandioca");
    expect(state.almoco?.previousOptionId).toBe("opt-arroz");
    expect(state.almoco?.adjustments).toEqual({ "it-1": "60g", "it-2": "120g" });
  });

  it("sem-acao: ativa a opção mas adjustments fica vazio", () => {
    const state = applySwap({}, {
      mealId: "almoco",
      chosenOptionId: "opt-b",
      previousOptionId: "opt-a",
      outcome: semAcao,
      formatLabel: fmt,
    });
    expect(state.almoco?.chosenOptionId).toBe("opt-b");
    expect(state.almoco?.adjustments).toEqual({});
  });

  it("recusa-orientada: adjustments vazio", () => {
    const state = applySwap({}, {
      mealId: "almoco",
      chosenOptionId: "opt-b",
      previousOptionId: "opt-a",
      outcome: recusa,
      formatLabel: fmt,
    });
    expect(state.almoco?.adjustments).toEqual({});
  });

  it("re-troca: a 2ª troca substitui integralmente os ajustes da 1ª (FR-006)", () => {
    const first = applySwap({}, {
      mealId: "almoco",
      chosenOptionId: "opt-b",
      previousOptionId: "opt-a",
      outcome: rebalanceado([{ mealId: "jantar", itens: [item("it-1", 60)] }]),
      formatLabel: fmt,
    });
    const second = applySwap(first, {
      mealId: "almoco",
      chosenOptionId: "opt-c",
      previousOptionId: "opt-a",
      outcome: rebalanceado([{ mealId: "jantar", itens: [item("it-2", 90)] }]),
      formatLabel: fmt,
    });

    expect(second.almoco?.chosenOptionId).toBe("opt-c");
    // it-1 (da 1ª troca) não pode sobrar:
    expect(flattenAdjustments(second)).toEqual({ "it-2": "90g" });
  });

  it("não muta o estado de entrada (imutabilidade)", () => {
    const before: SwapState = {};
    const after = applySwap(before, {
      mealId: "almoco",
      chosenOptionId: "opt-b",
      previousOptionId: "opt-a",
      outcome: semAcao,
      formatLabel: fmt,
    });
    expect(before).toEqual({});
    expect(after).not.toBe(before);
  });
});

describe("undoSwap", () => {
  it("remove opção + ajustes juntos: dia volta ao pré-troca (SC-001)", () => {
    const state = applySwap({}, {
      mealId: "almoco",
      chosenOptionId: "opt-b",
      previousOptionId: "opt-a",
      outcome: rebalanceado([{ mealId: "jantar", itens: [item("it-1", 60)] }]),
      formatLabel: fmt,
    });

    const undone = undoSwap(state, "almoco");

    expect(activeOptionId(undone, "almoco")).toBeUndefined();
    expect(flattenAdjustments(undone)).toEqual({});
  });

  it("preserva trocas de outras refeições", () => {
    let state: SwapState = {};
    state = applySwap(state, {
      mealId: "almoco",
      chosenOptionId: "opt-b",
      previousOptionId: "opt-a",
      outcome: rebalanceado([{ mealId: "jantar", itens: [item("it-1", 60)] }]),
      formatLabel: fmt,
    });
    state = applySwap(state, {
      mealId: "lanche",
      chosenOptionId: "opt-y",
      previousOptionId: "opt-x",
      outcome: rebalanceado([{ mealId: "jantar", itens: [item("it-9", 30)] }]),
      formatLabel: fmt,
    });

    const undone = undoSwap(state, "almoco");
    expect(activeOptionId(undone, "almoco")).toBeUndefined();
    expect(activeOptionId(undone, "lanche")).toBe("opt-y");
    expect(flattenAdjustments(undone)).toEqual({ "it-9": "30g" });
  });

  it("no-op quando não há troca naquela refeição (não muta)", () => {
    const state: SwapState = {};
    expect(undoSwap(state, "almoco")).toBe(state);
  });
});

describe("activeOptionId / flattenAdjustments", () => {
  it("activeOptionId retorna a opção ativa ou undefined", () => {
    const state = applySwap({}, {
      mealId: "almoco",
      chosenOptionId: "opt-b",
      previousOptionId: "opt-a",
      outcome: semAcao,
      formatLabel: fmt,
    });
    expect(activeOptionId(state, "almoco")).toBe("opt-b");
    expect(activeOptionId(state, "jantar")).toBeUndefined();
  });

  it("flattenAdjustments une trocas de refeições distintas (itens disjuntos)", () => {
    let state: SwapState = {};
    state = applySwap(state, {
      mealId: "almoco",
      chosenOptionId: "opt-b",
      previousOptionId: "opt-a",
      outcome: rebalanceado([{ mealId: "jantar", itens: [item("it-1", 60)] }]),
      formatLabel: fmt,
    });
    state = applySwap(state, {
      mealId: "cafe",
      chosenOptionId: "opt-y",
      previousOptionId: "opt-x",
      outcome: rebalanceado([{ mealId: "jantar", itens: [item("it-2", 25)] }]),
      formatLabel: fmt,
    });
    expect(flattenAdjustments(state)).toEqual({ "it-1": "60g", "it-2": "25g" });
  });
});

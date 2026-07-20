import { describe, expect, it } from "vitest";
import type { MealItemDto, MealOptionDto } from "@bamboo/types";
import { montarConsumo, type ConsumoItem } from "./consumo";

const item = (id: string): MealItemDto => ({
  id,
  food: { id: `food-${id}`, name: id },
  quantityGrams: 100,
  isLocked: false,
  substitutionGroupId: `group-${id}`,
  substitutable: true,
});

const option = (
  id: string,
  isDefault: boolean,
  items: readonly MealItemDto[],
): MealOptionDto => ({ id, label: id, isDefault, items });

describe("montarConsumo", () => {
  it("sem mudança (opção default, sem overrides) -> undefined", () => {
    const activeOption = option("opt-default", true, [item("item-1")]);
    const result = montarConsumo(activeOption, {}, "opt-default");
    expect(result).toBeUndefined();
  });

  it("só substituição (opção default, 1 item trocado) -> {chosenOptionId, items:[1]}", () => {
    const activeOption = option("opt-default", true, [item("item-1")]);
    const overrides: Readonly<Record<string, readonly ConsumoItem[]>> = {
      "item-1": [
        { itemId: "item-1", foodId: "food-batata", quantityGrams: 200 },
      ],
    };
    const result = montarConsumo(activeOption, overrides, "opt-default");
    expect(result).toEqual({
      chosenOptionId: "opt-default",
      items: [{ itemId: "item-1", foodId: "food-batata", quantityGrams: 200 }],
    });
  });

  it("combinação -> 2 itens no mesmo itemId", () => {
    const activeOption = option("opt-default", true, [item("item-1")]);
    const overrides: Readonly<Record<string, readonly ConsumoItem[]>> = {
      "item-1": [
        { itemId: "item-1", foodId: "food-arroz", quantityGrams: 75 },
        { itemId: "item-1", foodId: "food-feijao", quantityGrams: 50 },
      ],
    };
    const result = montarConsumo(activeOption, overrides, "opt-default");
    expect(result?.chosenOptionId).toBe("opt-default");
    expect(result?.items).toHaveLength(2);
    expect(result?.items?.every((it) => it.itemId === "item-1")).toBe(true);
  });

  it("opção não-default sem override -> {chosenOptionId} sem items", () => {
    const activeOption = option("opt-alt", false, [item("item-2")]);
    const result = montarConsumo(activeOption, {}, "opt-default");
    expect(result).toEqual({ chosenOptionId: "opt-alt" });
  });

  it("override de item fora da opção ativa -> ignorado", () => {
    const activeOption = option("opt-default", true, [item("item-1")]);
    const overrides: Readonly<Record<string, readonly ConsumoItem[]>> = {
      "item-fora": [
        { itemId: "item-fora", foodId: "food-x", quantityGrams: 10 },
      ],
    };
    const result = montarConsumo(activeOption, overrides, "opt-default");
    expect(result).toBeUndefined();
  });
});

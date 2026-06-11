import { describe, expect, it } from "vitest";
import { deveSinalizar, type SignalMeal } from "./meal-signal";

const meal = (rebalanceado: boolean, itemIds: string[]): SignalMeal => ({
  rebalanceado,
  defaultOption: { items: itemIds.map((id) => ({ id })) },
});

describe("deveSinalizar — sinal de rebalanceamento (009)", () => {
  it("US2: rebalanceado do servidor (troca de tipo-de-dia) → sinaliza", () => {
    expect(deveSinalizar(meal(true, ["a1"]), new Set())).toBe(true);
  });

  it("US4: item da default num ajuste de sessão (troca de opção) → sinaliza", () => {
    const ajustados = new Set(["a1"]);
    expect(deveSinalizar(meal(false, ["a1", "a2"]), ajustados)).toBe(true);
  });

  it("sem flag do servidor e sem ajuste de sessão → não sinaliza", () => {
    expect(deveSinalizar(meal(false, ["a1"]), new Set())).toBe(false);
  });

  it("ajuste de sessão de OUTRA refeição (id não pertence a esta) → não sinaliza", () => {
    expect(deveSinalizar(meal(false, ["a1"]), new Set(["b9"]))).toBe(false);
  });
});

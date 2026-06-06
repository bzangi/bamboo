// Bordas extras da Fase 2 (T033): casos de canto do motor, da combinação e da
// resolução de parâmetros que complementam os testes por-módulo.
import { describe, expect, it } from "vitest";
import { type FoodMacros, type Nutrientes } from "./nutrition.js";
import {
  type Alavanca,
  type ItemDia,
  previewTrocaTipoDia,
  rebalancearPorKcal,
} from "./rebalance.js";
import { combinar } from "./combination.js";
import { PARAMETROS_SISTEMA, resolverParametros } from "./params.js";

const food = (kcalPer100g: number, carbPer100g = 0): FoodMacros => ({
  carbPer100g,
  proteinPer100g: 0,
  fatPer100g: 0,
  kcalPer100g,
});

describe("rebalancearPorKcal — bordas", () => {
  const totalAtual: Nutrientes = { kcal: 500, carb: 50, protein: 20, fat: 10 };
  const lever: Alavanca = {
    itemId: "a",
    refeicaoPosition: 2,
    macros: food(100),
    gramasPlanejado: 100,
    gramasAtual: 100,
    medidas: [],
  };

  it("pisoPct fora de [0,100] → err(entrada-invalida)", () => {
    const r = rebalancearPorKcal({
      alavancas: [lever],
      deltaKcal: 10,
      pisoPct: 150,
      totalAtual,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("entrada-invalida");
  });

  it("gramasAtual negativo → err(entrada-invalida)", () => {
    const r = rebalancearPorKcal({
      alavancas: [{ ...lever, gramasAtual: -5 }],
      deltaKcal: 10,
      pisoPct: 50,
      totalAtual,
    });
    expect(r.ok).toBe(false);
  });

  it("alavanca sem kcal (kcalPer100g=0) não absorve redução → estoura-piso", () => {
    const r = rebalancearPorKcal({
      alavancas: [{ ...lever, macros: food(0, 25) }],
      deltaKcal: 30,
      pisoPct: 50,
      totalAtual,
    });
    expect(r.ok && r.value.kind === "recusa-orientada" && r.value.motivo).toBe(
      "estoura-piso",
    );
  });
});

describe("previewTrocaTipoDia — espalha por 2 refeições restantes", () => {
  it("distribui a redução proporcional entre duas refeições do novo tipo", () => {
    const carb = food(100, 25);
    const item = (gramas: number): ItemDia => ({
      itemId: `i${gramas}`,
      macros: carb,
      gramas,
      gramasPlanejado: gramas,
      isLocked: false,
      groupId: "g",
      medidas: [],
    });
    // alvoNovo: duas refeições de 100 → 200 kcal.
    const defaultNovo = [
      { itens: [{ macros: carb, gramas: 100 }] },
      { itens: [{ macros: carb, gramas: 100 }] },
    ];
    const r = previewTrocaTipoDia({
      consumido: { kcal: 80, carb: 20, protein: 0, fat: 0 },
      refeicoesRestantesNovoTipo: [
        { position: 1, isRegistered: false, itens: [item(100)] },
        { position: 2, isRegistered: false, itens: [item(100)] },
      ],
      refeicoesDefaultNovoTipo: defaultNovo,
      parametros: PARAMETROS_SISTEMA,
    });
    // totalProjetado = 80 + 200 = 280; alvo 200; delta 80; piso 50% (cap 50 cada,
    // 100 total) → cabe; reduz 80 espalhado → totalDepois.kcal ≈ 200.
    if (r.ok && r.value.kind === "rebalanceado") {
      expect(r.value.alavancas).toHaveLength(2);
      expect(r.value.totalDepois.kcal).toBeCloseTo(200, 4);
    } else throw new Error("esperava rebalanceado");
  });
});

describe("combinar — split clampado", () => {
  it("split > 1 é tratado como 1 (não quebra)", () => {
    const origem = {
      groupId: "g",
      macros: food(100, 25),
      gramas: 100,
    };
    const alvoMacros = (carb: number): FoodMacros => food(0, carb);
    const r = combinar({
      basis: "carb",
      origem,
      alvos: [
        { groupId: "g", macros: alvoMacros(50), measures: [] },
        { groupId: "g", macros: alvoMacros(10), measures: [] },
      ],
      split: 1.5,
    });
    if (!r.ok) throw new Error("esperava ok");
    expect(r.value.partes[0].fracao).toBe(1);
    expect(r.value.partes[1].fracao).toBe(0);
  });
});

describe("resolverParametros — nested parcial", () => {
  it("paciente parcial + nutri parcial + fallback sistema", () => {
    const r = resolverParametros({
      sistema: PARAMETROS_SISTEMA,
      nutri: { toleranciaPct: 12 },
      paciente: {},
    });
    expect(r).toEqual({ toleranciaPct: 12, pisoPct: 50 });
  });
});

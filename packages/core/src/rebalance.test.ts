import { describe, expect, it } from "vitest";
import {
  type Alavanca,
  type ItemDia,
  previewTrocaOpcao,
  previewTrocaTipoDia,
  rebalancearPorKcal,
} from "./rebalance.js";
import { type FoodMacros, type Nutrientes } from "./nutrition.js";
import { PARAMETROS_SISTEMA } from "./params.js";

// Food com 1 kcal/g (kcalPer100g=100); carb opcional pra testar macros.
const food = (kcalPer100g: number, carbPer100g = 0): FoodMacros => ({
  carbPer100g,
  proteinPer100g: 0,
  fatPer100g: 0,
  kcalPer100g,
});

const lever = (
  itemId: string,
  macros: FoodMacros,
  gramasAtual: number,
  gramasPlanejado = gramasAtual,
): Alavanca => ({
  itemId,
  refeicaoPosition: 3,
  macros,
  gramasPlanejado,
  gramasAtual,
  medidas: [],
});

const totalAtual: Nutrientes = { kcal: 1000, carb: 100, protein: 50, fat: 20 };

describe("rebalancearPorKcal (primitivo)", () => {
  it("deltaKcal ~ 0 → sem-acao", () => {
    const r = rebalancearPorKcal({
      alavancas: [lever("a", food(100), 100)],
      deltaKcal: 0,
      pisoPct: 50,
      totalAtual,
    });
    expect(r.ok && r.value.kind).toBe("sem-acao");
  });

  it("sem alavancas → recusa sem-alavanca", () => {
    const r = rebalancearPorKcal({
      alavancas: [],
      deltaKcal: 50,
      pisoPct: 50,
      totalAtual,
    });
    expect(r.ok && r.value.kind === "recusa-orientada" && r.value.motivo).toBe(
      "sem-alavanca",
    );
  });

  it("reduzir: remove kcal da alavanca respeitando o piso", () => {
    const r = rebalancearPorKcal({
      alavancas: [lever("a", food(100), 100, 100)],
      deltaKcal: 30,
      pisoPct: 50,
      totalAtual,
    });
    expect(r.ok).toBe(true);
    if (r.ok && r.value.kind === "rebalanceado") {
      expect(r.value.alavancas[0]!.gramasNovo).toBeCloseTo(70, 6);
      expect(r.value.totalDepois.kcal).toBeCloseTo(970, 6);
    } else throw new Error("esperava rebalanceado");
  });

  it("desvio acima da capacidade até o piso → recusa estoura-piso", () => {
    const r = rebalancearPorKcal({
      alavancas: [lever("a", food(100), 100, 100)], // cap = 50 kcal
      deltaKcal: 80,
      pisoPct: 50,
      totalAtual,
    });
    expect(r.ok && r.value.kind === "recusa-orientada" && r.value.motivo).toBe(
      "estoura-piso",
    );
  });

  it("aumentar (opção mais leve) → distribui sem teto", () => {
    const r = rebalancearPorKcal({
      alavancas: [lever("a", food(100), 100, 100)],
      deltaKcal: -40,
      pisoPct: 50,
      totalAtual,
    });
    if (r.ok && r.value.kind === "rebalanceado") {
      expect(r.value.alavancas[0]!.gramasNovo).toBeCloseTo(140, 6);
      expect(r.value.totalDepois.kcal).toBeCloseTo(1040, 6);
    } else throw new Error("esperava rebalanceado");
  });

  it("transbordo multi-passe: alavanca que bate o piso passa o resto pra outra", () => {
    const l1 = lever("a", food(100), 60, 100); // floor 50 → cap 10 kcal
    const l2 = lever("b", food(100), 200, 200); // floor 100 → cap 100 kcal
    const r = rebalancearPorKcal({
      alavancas: [l1, l2],
      deltaKcal: 60,
      pisoPct: 50,
      totalAtual,
    });
    if (r.ok && r.value.kind === "rebalanceado") {
      const byId = Object.fromEntries(
        r.value.alavancas.map((a) => [a.itemId, a.gramasNovo] as const),
      );
      expect(byId["a"]!).toBeCloseTo(50, 4); // no piso
      expect(byId["b"]!).toBeCloseTo(150, 4); // absorveu o transbordo
      expect(r.value.totalDepois.kcal).toBeCloseTo(940, 4);
    } else throw new Error("esperava rebalanceado");
  });

  it("kcal-priority: macros seguem a quantidade (carb cai junto)", () => {
    const r = rebalancearPorKcal({
      alavancas: [lever("a", food(100, 25), 100, 100)],
      deltaKcal: 50,
      pisoPct: 50,
      totalAtual,
    });
    if (r.ok && r.value.kind === "rebalanceado") {
      expect(r.value.alavancas[0]!.gramasNovo).toBeCloseTo(50, 6);
      expect(r.value.totalDepois.carb).toBeCloseTo(87.5, 6); // 100 - 12.5
    } else throw new Error("esperava rebalanceado");
  });

  it("nunca reduz abaixo do piso (SC-002)", () => {
    const r = rebalancearPorKcal({
      alavancas: [lever("a", food(100), 100, 100)],
      deltaKcal: 40, // dentro da capacidade (50)
      pisoPct: 50,
      totalAtual,
    });
    if (r.ok && r.value.kind === "rebalanceado") {
      expect(r.value.alavancas[0]!.gramasNovo).toBeGreaterThanOrEqual(
        50 - 1e-6,
      );
    } else throw new Error("esperava rebalanceado");
  });
});

/* ============ Adaptador P1 — previewTrocaOpcao ============ */

const carb = food(100, 25); // 1 kcal/g, 25 carb/100g

const itemDia = (
  itemId: string,
  gramas: number,
  opts: {
    isLocked?: boolean;
    groupId?: string | null;
    gramasPlanejado?: number;
  } = {},
): ItemDia => ({
  itemId,
  macros: carb,
  gramas,
  gramasPlanejado: opts.gramasPlanejado ?? gramas,
  isLocked: opts.isLocked ?? false,
  groupId: opts.groupId === undefined ? "g1" : opts.groupId,
  medidas: [],
});

// Alvo: m1=100, m2=100, m3=(lever 150 + travado 100) → kcal 450.
const refeicoesDefault = [
  { itens: [{ macros: carb, gramas: 100 }] },
  { itens: [{ macros: carb, gramas: 100 }] },
  {
    itens: [
      { macros: carb, gramas: 150 },
      { macros: carb, gramas: 100 },
    ],
  },
];

describe("previewTrocaOpcao (P1) — alavancas = refeições não-gatilho (v0: nada registrado)", () => {
  it("opção mais pesada → ajusta TODAS as não-gatilho (anterior E seguinte), travado intacto", () => {
    const dia = [
      { position: 1, itens: [itemDia("ant", 100, { gramasPlanejado: 100 })] }, // anterior ao gatilho
      { position: 2, itens: [itemDia("m2", 150)] }, // gatilho (mais pesada)
      {
        position: 3,
        itens: [
          itemDia("seg", 150, { gramasPlanejado: 150 }), // seguinte
          itemDia("lock", 100, { isLocked: true, groupId: null }),
        ],
      },
    ];
    const r = previewTrocaOpcao({
      refeicoesDefault,
      diaComEscolha: dia,
      triggerPosition: 2,
      parametros: PARAMETROS_SISTEMA,
    });
    if (r.ok && r.value.kind === "rebalanceado") {
      // ajusta a anterior (ant) E a seguinte (seg); travado fora; gatilho fora.
      const ids = r.value.alavancas.map((a) => a.itemId).sort();
      expect(ids).toEqual(["ant", "seg"]);
      expect(r.value.totalDepois.kcal).toBeCloseTo(450, 4); // de volta ao alvo
    } else throw new Error("esperava rebalanceado");
  });

  it("escolha que cabe na faixa → sem-acao", () => {
    const dia = [
      { position: 1, itens: [itemDia("ant", 100)] },
      { position: 2, itens: [itemDia("m2", 100)] }, // = default
      {
        position: 3,
        itens: [
          itemDia("seg", 150, { gramasPlanejado: 150 }),
          itemDia("lock", 100, { isLocked: true, groupId: null }),
        ],
      },
    ];
    const r = previewTrocaOpcao({
      refeicoesDefault,
      diaComEscolha: dia,
      triggerPosition: 2,
      parametros: PARAMETROS_SISTEMA,
    });
    expect(r.ok && r.value.kind).toBe("sem-acao");
  });

  it("nenhuma refeição não-gatilho com alavanca → recusa sem-alavanca", () => {
    const dia = [
      {
        position: 1,
        itens: [itemDia("ant", 100, { isLocked: true, groupId: null })],
      },
      { position: 2, itens: [itemDia("m2", 150)] },
      {
        position: 3,
        itens: [
          itemDia("seg", 150, { isLocked: true }),
          itemDia("lock", 100, { isLocked: true, groupId: null }),
        ],
      },
    ];
    const r = previewTrocaOpcao({
      refeicoesDefault,
      diaComEscolha: dia,
      triggerPosition: 2,
      parametros: PARAMETROS_SISTEMA,
    });
    expect(r.ok && r.value.kind === "recusa-orientada" && r.value.motivo).toBe(
      "sem-alavanca",
    );
  });
});

/* ============ Adaptador P3 — previewTrocaTipoDia ============ */

describe("previewTrocaTipoDia (P3, engine-level)", () => {
  const defaultNovo = [
    { itens: [{ macros: carb, gramas: 100 }] },
    { itens: [{ macros: carb, gramas: 100 }] },
  ]; // alvoNovo.kcal = 200
  const zero: Nutrientes = { kcal: 0, carb: 0, protein: 0, fat: 0 };

  it("início do dia (nada consumido) → sem-acao", () => {
    const restantesTodos = [
      { position: 1, itens: [itemDia("a", 100)] },
      { position: 2, itens: [itemDia("b", 100)] },
    ];
    const r = previewTrocaTipoDia({
      consumido: zero,
      refeicoesRestantesNovoTipo: restantesTodos,
      refeicoesDefaultNovoTipo: defaultNovo,
      parametros: PARAMETROS_SISTEMA,
    });
    expect(r.ok && r.value.kind).toBe("sem-acao");
  });

  it("consumido a mais → reduz as refeições restantes do novo tipo", () => {
    const r = previewTrocaTipoDia({
      consumido: { kcal: 140, carb: 35, protein: 0, fat: 0 },
      refeicoesRestantesNovoTipo: [
        {
          position: 2,
          itens: [itemDia("lev2", 100, { gramasPlanejado: 100 })],
        },
      ],
      refeicoesDefaultNovoTipo: defaultNovo,
      parametros: PARAMETROS_SISTEMA,
    });
    if (r.ok && r.value.kind === "rebalanceado") {
      expect(r.value.alavancas[0]!.gramasNovo).toBeCloseTo(60, 4); // 100 - 40g
      expect(r.value.totalDepois.kcal).toBeCloseTo(200, 4);
    } else throw new Error("esperava rebalanceado");
  });

  it("consumido já estoura o novo alvo → recusa estoura-piso", () => {
    const r = previewTrocaTipoDia({
      consumido: { kcal: 300, carb: 75, protein: 0, fat: 0 },
      refeicoesRestantesNovoTipo: [
        {
          position: 2,
          itens: [itemDia("lev2", 100, { gramasPlanejado: 100 })],
        },
      ],
      refeicoesDefaultNovoTipo: defaultNovo,
      parametros: PARAMETROS_SISTEMA,
    });
    expect(r.ok && r.value.kind === "recusa-orientada" && r.value.motivo).toBe(
      "estoura-piso",
    );
  });
});

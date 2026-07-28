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
    adLibitum?: boolean;
  } = {},
): ItemDia => ({
  itemId,
  macros: carb,
  gramas,
  gramasPlanejado: opts.gramasPlanejado ?? gramas,
  isLocked: opts.isLocked ?? false,
  groupId: opts.groupId === undefined ? "g1" : opts.groupId,
  medidas: [],
  adLibitum: opts.adLibitum ?? false,
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
      {
        position: 1,
        isRegistered: false,
        itens: [itemDia("ant", 100, { gramasPlanejado: 100 })],
      }, // anterior ao gatilho
      { position: 2, isRegistered: false, itens: [itemDia("m2", 150)] }, // gatilho (mais pesada)
      {
        position: 3,
        isRegistered: false,
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
      { position: 1, isRegistered: false, itens: [itemDia("ant", 100)] },
      { position: 2, isRegistered: false, itens: [itemDia("m2", 100)] }, // = default
      {
        position: 3,
        isRegistered: false,
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

  // (022) o item do gatilho é travado aqui de propósito: desde a 022, gatilho
  // com item flexível e nenhuma outra alavanca produz `rebalanceado` (é o
  // describe do último recurso, no fim do arquivo). Este caso é "não há alavanca
  // em lugar nenhum".
  it("nenhuma alavanca em lugar nenhum (nem no gatilho) → recusa sem-alavanca", () => {
    const dia = [
      {
        position: 1,
        isRegistered: false,
        itens: [itemDia("ant", 100, { isLocked: true, groupId: null })],
      },
      {
        position: 2,
        isRegistered: false,
        itens: [itemDia("m2", 150, { isLocked: true, groupId: null })],
      },
      {
        position: 3,
        isRegistered: false,
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

/* ====== Fase 4 (US1/US2) — previewTrocaOpcao ciente do registro ====== */

describe("previewTrocaOpcao (P1) — exclui refeições já registradas das alavancas", () => {
  // (a) refeição registrada NÃO vira alavanca: fica intacta; só as não-registradas
  // (≠ gatilho) ajustam. m1 registrada (100g, intacta), m2 gatilho (150g), m3 seg
  // ajusta. Total = 100+150+150+100 = 500; alvo 450; delta +50; reduz só "seg".
  it("refeição registrada fica intacta — só as não-registradas ajustam", () => {
    const dia = [
      {
        position: 1,
        isRegistered: true,
        itens: [itemDia("ant", 100, { gramasPlanejado: 100 })],
      },
      { position: 2, isRegistered: false, itens: [itemDia("m2", 150)] },
      {
        position: 3,
        isRegistered: false,
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
    if (r.ok && r.value.kind === "rebalanceado") {
      const ids = r.value.alavancas.map((a) => a.itemId);
      expect(ids).not.toContain("ant"); // registrada fora das alavancas
      expect(ids).toContain("seg");
      expect(r.value.totalDepois.kcal).toBeCloseTo(450, 4);
    } else throw new Error("esperava rebalanceado");
  });

  // (b.1) registrada com consumo BAIXO (pulei = itens vazios) alimenta o totalAtual
  // → dia abaixo do alvo → restante (≠ gatilho, não-registrado) AUMENTA.
  // m1 registrada vazia (0), m2 gatilho 100, m3 seg 150 (planned 150) + lock 100.
  // Total = 0+100+150+100 = 350; alvo 450; delta -100; aumenta "seg".
  it("registrada com consumo baixo (pulei) puxa o total pra baixo → restante aumenta", () => {
    const dia = [
      { position: 1, isRegistered: true, itens: [] },
      { position: 2, isRegistered: false, itens: [itemDia("m2", 100)] },
      {
        position: 3,
        isRegistered: false,
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
    if (r.ok && r.value.kind === "rebalanceado") {
      const seg = r.value.alavancas.find((a) => a.itemId === "seg");
      expect(seg).toBeDefined();
      expect(seg!.gramasNovo).toBeGreaterThan(150); // aumentou
      expect(r.value.totalDepois.kcal).toBeCloseTo(450, 4);
    } else throw new Error("esperava rebalanceado");
  });

  // (b.2) registrada com consumo ALTO alimenta o totalAtual → dia acima do alvo →
  // restante (≠ gatilho, não-registrado) REDUZ.
  // m1 registrada 170g (real), m2 gatilho 100, m3 seg 150 (planned 150) + lock 100.
  // Total = 170+100+150+100 = 520; alvo 450; delta +70; reduz "seg" (cap 75 ≥ 70).
  it("registrada com consumo alto puxa o total pra cima → restante reduz", () => {
    const dia = [
      {
        position: 1,
        isRegistered: true,
        itens: [itemDia("ant", 170, { gramasPlanejado: 100 })],
      },
      { position: 2, isRegistered: false, itens: [itemDia("m2", 100)] },
      {
        position: 3,
        isRegistered: false,
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
    if (r.ok && r.value.kind === "rebalanceado") {
      const ids = r.value.alavancas.map((a) => a.itemId);
      expect(ids).not.toContain("ant"); // registrada não ajusta
      const seg = r.value.alavancas.find((a) => a.itemId === "seg");
      expect(seg!.gramasNovo).toBeLessThan(150); // reduziu
      expect(r.value.totalDepois.kcal).toBeCloseTo(450, 4);
    } else throw new Error("esperava rebalanceado");
  });

  // (c) TODAS as não-gatilho registradas E o gatilho sem item elegível → não
  // sobra alavanca em lugar nenhum → recusa sem-alavanca.
  // ATENÇÃO (022): até a 021 este caso tinha o item do gatilho FLEXÍVEL, e ainda
  // assim recusava — o gatilho estava fora das alavancas por regra. Desde a 022
  // o gatilho é alavanca de último recurso, então o cenário que caracteriza a
  // recusa precisa que o gatilho também não tenha o que ajustar (travado aqui).
  // O caso do gatilho flexível virou o describe abaixo.
  it("todas as não-gatilho registradas e gatilho travado → recusa-orientada sem-alavanca", () => {
    const dia = [
      {
        position: 1,
        isRegistered: true,
        itens: [itemDia("ant", 150, { gramasPlanejado: 100 })],
      },
      {
        position: 2,
        isRegistered: false,
        itens: [itemDia("m2", 150, { isLocked: true, groupId: null })],
      },
      {
        position: 3,
        isRegistered: true,
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
    expect(r.ok && r.value.kind === "recusa-orientada" && r.value.motivo).toBe(
      "sem-alavanca",
    );
  });

  // (d) o gatilho registrado segue excluído por position (não bloqueia): o motor
  // ainda roda nas não-registradas. m2 gatilho registrado (isRegistered:true), m1 e
  // m3 não-registradas viram alavancas. Total = 100+150+150+100 = 500; delta +50.
  it("gatilho registrado ainda é gatilho (excluído por position) — motor roda nas não-registradas", () => {
    const dia = [
      {
        position: 1,
        isRegistered: false,
        itens: [itemDia("ant", 100, { gramasPlanejado: 100 })],
      },
      { position: 2, isRegistered: true, itens: [itemDia("m2", 150)] },
      {
        position: 3,
        isRegistered: false,
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
    if (r.ok && r.value.kind === "rebalanceado") {
      const ids = r.value.alavancas.map((a) => a.itemId).sort();
      expect(ids).toEqual(["ant", "seg"]); // gatilho fora (position); registrado não bloqueia
      expect(r.value.totalDepois.kcal).toBeCloseTo(450, 4);
    } else throw new Error("esperava rebalanceado");
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
      { position: 1, isRegistered: false, itens: [itemDia("a", 100)] },
      { position: 2, isRegistered: false, itens: [itemDia("b", 100)] },
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
          isRegistered: false,
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
          isRegistered: false,
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

/* ============ 018 — item "à vontade" nunca é alavanca ============ */

describe('previewTrocaOpcao (P1) — item "à vontade" fica fora dos ajustes', () => {
  it("item à vontade na refeição seguinte não recebe ajuste; o flexível ao lado recebe", () => {
    const dia = [
      { position: 1, isRegistered: false, itens: [itemDia("ant", 100)] },
      { position: 2, isRegistered: false, itens: [itemDia("m2", 150)] }, // gatilho
      {
        position: 3,
        isRegistered: false,
        itens: [
          itemDia("seg", 150, { gramasPlanejado: 150 }),
          // salada: tem grupo e não é travada, mas NÃO tem quantidade prescrita
          itemDia("salada", 0, { gramasPlanejado: 0, adLibitum: true }),
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
      const ids = r.value.alavancas.map((a) => a.itemId).sort();
      expect(ids).toEqual(["ant", "seg"]); // "salada" fora
    } else throw new Error("esperava rebalanceado");
  });

  // (022) o gatilho também precisa estar inajustável: desde a 022 ele é alavanca
  // de último recurso, e um gatilho flexível aqui produziria `rebalanceado`.
  it("se TODOS os flexíveis são à vontade → recusa sem-alavanca (nunca ajusta o inajustável)", () => {
    const dia = [
      {
        position: 1,
        isRegistered: false,
        itens: [itemDia("s1", 0, { gramasPlanejado: 0, adLibitum: true })],
      },
      {
        position: 2,
        isRegistered: false,
        itens: [itemDia("m2", 150, { adLibitum: true })],
      }, // gatilho
      {
        position: 3,
        isRegistered: false,
        itens: [itemDia("s2", 0, { gramasPlanejado: 0, adLibitum: true })],
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

/* ====== 022 — o gatilho como alavanca de ÚLTIMO RECURSO ====== */

// Quando o gatilho é a única refeição ainda ajustável do dia, não existe
// "próxima refeição" a preservar: recusar seria barrar a troca sem ter o que
// proteger. Só nesse caso os itens flexíveis do próprio gatilho viram alavanca.
//
// FR-009 (com outra alavanca disponível o gatilho segue intocado) já é travado
// pelo primeiro teste deste arquivo, que assere `ids === ["ant", "seg"]` com o
// gatilho flexível na posição 2 — não se repete aqui.
//
// Cenário-base: m1 PULADA (registrada, sem itens → 0 kcal), m3 registrada com
// 250 kcal, gatilho m2 com 100 kcal. Total 350; alvo 450; déficit de 100 kcal.
describe("previewTrocaOpcao (P1) — gatilho vira alavanca quando não sobra outra (022)", () => {
  const diaSemOutraAlavanca = (itensDoGatilho: readonly ItemDia[]) => [
    { position: 1, isRegistered: true, itens: [] },
    { position: 2, isRegistered: false, itens: itensDoGatilho },
    {
      position: 3,
      isRegistered: true,
      itens: [
        itemDia("seg", 150, { gramasPlanejado: 150 }),
        itemDia("lock", 100, { isLocked: true, groupId: null }),
      ],
    },
  ];

  const preview = (itensDoGatilho: readonly ItemDia[]) =>
    previewTrocaOpcao({
      refeicoesDefault,
      diaComEscolha: diaSemOutraAlavanca(itensDoGatilho),
      triggerPosition: 2,
      parametros: PARAMETROS_SISTEMA,
    });

  it("FR-007 — déficit sem outra alavanca → ajusta o item flexível do próprio gatilho", () => {
    const r = preview([itemDia("m2", 100)]);
    if (r.ok && r.value.kind === "rebalanceado") {
      expect(r.value.alavancas).toHaveLength(1);
      const [a] = r.value.alavancas;
      expect(a!.itemId).toBe("m2");
      expect(a!.refeicaoPosition).toBe(2); // a própria refeição do gatilho
      expect(a!.gramasNovo).toBeCloseTo(200, 4); // +100 kcal a 1 kcal/g
      expect(r.value.totalDepois.kcal).toBeCloseTo(450, 4); // fecha no alvo
    } else throw new Error("esperava rebalanceado");
  });

  it("FR-010 — gatilho só com item travado → segue recusa sem-alavanca", () => {
    const r = preview([itemDia("m2", 100, { isLocked: true, groupId: null })]);
    expect(r.ok && r.value.kind === "recusa-orientada" && r.value.motivo).toBe(
      "sem-alavanca",
    );
  });

  it("FR-010 — gatilho só com item à vontade → segue recusa sem-alavanca", () => {
    const r = preview([itemDia("m2", 100, { adLibitum: true })]);
    expect(r.ok && r.value.kind === "recusa-orientada" && r.value.motivo).toBe(
      "sem-alavanca",
    );
  });

  it("FR-010 — gatilho só com item sem grupo de substituição → segue recusa sem-alavanca", () => {
    const r = preview([itemDia("m2", 100, { groupId: null })]);
    expect(r.ok && r.value.kind === "recusa-orientada" && r.value.motivo).toBe(
      "sem-alavanca",
    );
  });

  // FR-008 / D4 — a guarda da 020 é POR ITEM, não por refeição. O overlay da
  // edição em lote chega ao motor como item travado e sem grupo (ids `ed-`), e
  // por isso nunca é alavanca; um item da MESMA refeição que o paciente não
  // editou continua ajustável. Nada disso precisa de flag: o predicado de item
  // flexível já decide.
  it("FR-008 — item vindo do overlay de edição não é alavanca; o não-editado é", () => {
    const r = preview([
      itemDia("ed-x-0", 50, { isLocked: true, groupId: null }), // forma do overlay
      itemDia("m2", 50),
    ]);
    if (r.ok && r.value.kind === "rebalanceado") {
      const ids = r.value.alavancas.map((a) => a.itemId);
      expect(ids).toEqual(["m2"]);
    } else throw new Error("esperava rebalanceado");
  });
});

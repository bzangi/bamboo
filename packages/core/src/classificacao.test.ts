import { describe, expect, it } from "vitest";
import {
  classificarAlimento,
  validarGabarito,
  type Classificacao,
  type GrupoCanonico,
  type GuardasClassificacao,
} from "./classificacao.js";

// Invariantes do contrato contracts/core-classificacao.md (Feature 008).
// Gate (Sessão 2026-06-10): grupos por macro-base separando amido/fruta/vegetal;
// categoria TACO → grupo; "Verduras, hortaliças" divide por perfil (carb≥10).

const GUARDAS: GuardasClassificacao = {
  minBasisPer100g: 1,
  porcaoMinG: 10,
  porcaoMaxG: 600,
};

// Fixtures espelhando a tabela do data-model (âncoras explícitas — a mediana da
// curadoria é responsabilidade da casca, não do núcleo).
const GRUPOS: GrupoCanonico[] = [
  {
    id: "amidos",
    basis: "carb",
    categoriasFonte: [
      "Cereais e derivados",
      "Leguminosas e derivados",
      "Verduras, hortaliças e derivados",
    ],
    carbMinPer100g: 10,
    ancoraGramasDoNutriente: 30,
    fallbackDaBase: true,
  },
  {
    id: "frutas",
    basis: "carb",
    categoriasFonte: ["Frutas e derivados"],
    ancoraGramasDoNutriente: 20,
  },
  {
    id: "vegetais",
    basis: "carb",
    categoriasFonte: ["Verduras, hortaliças e derivados"],
    ancoraGramasDoNutriente: 3,
  },
  {
    id: "proteinas",
    basis: "protein",
    categoriasFonte: [
      "Carnes e derivados",
      "Pescados e frutos do mar",
      "Ovos e derivados",
    ],
    ancoraGramasDoNutriente: 25,
    fallbackDaBase: true,
  },
  {
    id: "laticinios",
    basis: "protein",
    categoriasFonte: ["Leite e derivados"],
    ancoraGramasDoNutriente: 8,
  },
  {
    id: "gorduras",
    basis: "fat",
    categoriasFonte: ["Gorduras e óleos", "Nozes e sementes"],
    ancoraGramasDoNutriente: 12,
    fallbackDaBase: true,
  },
  {
    id: "acucares",
    basis: "carb",
    categoriasFonte: ["Produtos açucarados"],
    ancoraGramasDoNutriente: 20,
  },
];

const macros = (
  carb: number | null,
  protein: number | null,
  fat: number | null,
  kcal: number | null = 100,
) => ({ carbPer100g: carb, proteinPer100g: protein, fatPer100g: fat, kcalPer100g: kcal });

const classificar = (
  tacoCategory: string | null,
  m: ReturnType<typeof macros>,
): Classificacao =>
  classificarAlimento({ tacoCategory, macros: m, grupos: GRUPOS, guardas: GUARDAS });

describe("classificarAlimento — dados e categoria", () => {
  it("macro ausente → sem-grupo dados-incompletos (nunca inventa valor)", () => {
    expect(classificar("Cereais e derivados", macros(null, 5, 1)).kind).toBe(
      "sem-grupo",
    );
    const r = classificar("Cereais e derivados", macros(28, 2, 1, null));
    expect(r).toEqual({ kind: "sem-grupo", motivo: "dados-incompletos" });
  });

  it("categoria fora da taxonomia (Bebidas/Miscelâneas/preparados/desconhecida) → sem-grupo", () => {
    for (const cat of [
      "Bebidas (alcoólicas e não alcoólicas)",
      "Miscelâneas",
      "Alimentos preparados",
      "Outros alimentos industrializados",
      "Categoria inexistente",
    ]) {
      expect(classificar(cat, macros(10, 2, 1))).toEqual({
        kind: "sem-grupo",
        motivo: "categoria-fora-da-taxonomia",
      });
    }
  });
});

describe("classificarAlimento — mapeamento categoria → grupo", () => {
  it("arroz (Cereais) → Amidos com porção derivada", () => {
    const r = classificar("Cereais e derivados", macros(28, 2.5, 0.2, 124));
    expect(r.kind).toBe("vinculo");
    if (r.kind !== "vinculo") return;
    expect(r.grupoId).toBe("amidos");
    // 30 / (28/100) = 107 → arredonda a 5 → 105
    expect(r.referencePortionGrams).toBe(105);
  });

  it("feijão (Leguminosas) → Amidos (basis carb)", () => {
    const r = classificar("Leguminosas e derivados", macros(13.6, 4.8, 0.5, 91));
    expect(r.kind === "vinculo" && r.grupoId).toBe("amidos");
  });

  it("carne, peixe e ovo (categorias distintas) → todos Proteínas", () => {
    expect(
      (classificar("Carnes e derivados", macros(0, 30, 5, 180)) as { grupoId: string })
        .grupoId,
    ).toBe("proteinas");
    expect(
      (classificar("Pescados e frutos do mar", macros(0, 25, 3, 130)) as { grupoId: string })
        .grupoId,
    ).toBe("proteinas");
    expect(
      (classificar("Ovos e derivados", macros(1, 13, 11, 150)) as { grupoId: string })
        .grupoId,
    ).toBe("proteinas");
  });

  it("leite → Laticínios; azeite/castanha → Gorduras e oleaginosas", () => {
    expect(
      (classificar("Leite e derivados", macros(5, 3.3, 3, 60)) as { grupoId: string })
        .grupoId,
    ).toBe("laticinios");
    expect(
      (classificar("Gorduras e óleos", macros(0, 0, 100, 884)) as { grupoId: string })
        .grupoId,
    ).toBe("gorduras");
    expect(
      (classificar("Nozes e sementes", macros(12, 14, 50, 600)) as { grupoId: string })
        .grupoId,
    ).toBe("gorduras");
  });

  it("açúcar (Produtos açucarados) → Açúcares", () => {
    expect(
      (classificar("Produtos açucarados", macros(99, 0, 0, 387)) as { grupoId: string })
        .grupoId,
    ).toBe("acucares");
  });
});

describe("classificarAlimento — split de Verduras, hortaliças (carbMin)", () => {
  it("batata (carb ~12 ≥ 10) → Amidos", () => {
    expect(
      (
        classificar(
          "Verduras, hortaliças e derivados",
          macros(12, 1.2, 0.1, 52),
        ) as { grupoId: string }
      ).grupoId,
    ).toBe("amidos");
  });

  it("mandioca (carb ~30) → Amidos", () => {
    expect(
      (
        classificar(
          "Verduras, hortaliças e derivados",
          macros(30, 0.6, 0.3, 125),
        ) as { grupoId: string }
      ).grupoId,
    ).toBe("amidos");
  });

  it("alface/brócolis/cenoura/tomate (carb < 10) → Vegetais", () => {
    for (const carb of [1.7, 4.0, 7.7, 3.1]) {
      expect(
        (
          classificar(
            "Verduras, hortaliças e derivados",
            macros(carb, 1.5, 0.2, 25),
          ) as { grupoId: string }
        ).grupoId,
      ).toBe("vegetais");
    }
  });
});

describe("classificarAlimento — guardas", () => {
  it("basis insuficiente (< 1 g/100 g) → sem-grupo nutriente-base-insuficiente", () => {
    // Bebida-like classificada num grupo carb mas com carbo ~0 — porém categoria
    // mapeada (ex.: um 'Produtos açucarados' diet com carb 0.3).
    expect(classificar("Produtos açucarados", macros(0.3, 0, 0, 2))).toEqual({
      kind: "sem-grupo",
      motivo: "nutriente-base-insuficiente",
    });
  });

  it("porção implausível (> 600 g) → sem-grupo porcao-implausivel", () => {
    // basis ≥ 1 mas baixíssimo → porção gigante. carb 1.5, ancora amidos 30 →
    // 30/(0.015)=2000 g. Mas carb 1.5 < 10 → cai em Vegetais (ancora 3) →
    // 3/0.015 = 200 g (plausível). Pra forçar implausível em Amidos, uso
    // Cereais com carb 2 → 30/0.02 = 1500 g > 600.
    expect(classificar("Cereais e derivados", macros(2, 1, 0.5, 20))).toEqual({
      kind: "sem-grupo",
      motivo: "porcao-implausivel",
    });
  });

  it("porção no limite [10,600] é aceita", () => {
    // carb 5 em Cereais → 30/0.05 = 600 g (limite superior, aceito)
    const r = classificar("Cereais e derivados", macros(5, 1, 0.5, 30));
    expect(r.kind).toBe("vinculo");
    if (r.kind === "vinculo") expect(r.referencePortionGrams).toBe(600);
  });
});

describe("classificarAlimento — fallback sem categoria (futuro import)", () => {
  it("sem categoria, carbo dominante → grupo default da base carb (Amidos)", () => {
    expect(
      (classificar(null, macros(60, 8, 2, 290)) as { grupoId: string }).grupoId,
    ).toBe("amidos");
  });

  it("sem categoria, proteína dominante → Proteínas; gordura dominante → Gorduras", () => {
    expect(
      (classificar(null, macros(2, 25, 5, 150)) as { grupoId: string }).grupoId,
    ).toBe("proteinas");
    expect(
      (classificar(null, macros(0, 5, 90, 810)) as { grupoId: string }).grupoId,
    ).toBe("gorduras");
  });
});

describe("classificarAlimento — pureza", () => {
  it("mesma entrada → mesma saída; entrada congelada não muta", () => {
    const m = Object.freeze(macros(28, 2.5, 0.2, 124));
    const a = classificarAlimento({
      tacoCategory: "Cereais e derivados",
      macros: m,
      grupos: GRUPOS,
      guardas: GUARDAS,
    });
    const b = classificarAlimento({
      tacoCategory: "Cereais e derivados",
      macros: m,
      grupos: GRUPOS,
      guardas: GUARDAS,
    });
    expect(a).toEqual(b);
  });
});

describe("validarGabarito (SC-002)", () => {
  it("acerto quando o grupo classificado == curado; sem-grupo conta como erro", () => {
    const casos = [
      {
        foodId: "f1",
        grupoCuradoId: "amidos",
        classificacao: {
          kind: "vinculo" as const,
          grupoId: "amidos",
          referencePortionGrams: 105,
        },
      },
      {
        foodId: "f2",
        grupoCuradoId: "proteinas",
        classificacao: {
          kind: "vinculo" as const,
          grupoId: "vegetais",
          referencePortionGrams: 100,
        },
      },
      {
        foodId: "f3",
        grupoCuradoId: "frutas",
        classificacao: { kind: "sem-grupo" as const, motivo: "porcao-implausivel" as const },
      },
    ];
    const r = validarGabarito(casos);
    expect(r.total).toBe(3);
    expect(r.acertos).toBe(1);
    expect(r.acertoPct).toBeCloseTo(33.33, 1);
    expect(r.divergencias).toHaveLength(2);
    expect(r.divergencias).toContainEqual({
      foodId: "f2",
      esperado: "proteinas",
      obtido: "vegetais",
    });
    expect(r.divergencias).toContainEqual({
      foodId: "f3",
      esperado: "frutas",
      obtido: null,
    });
  });

  it("gabarito vazio → 100% (vacuamente), zero divergências", () => {
    expect(validarGabarito([])).toEqual({
      total: 0,
      acertos: 0,
      acertoPct: 100,
      divergencias: [],
    });
  });
});

// groups.ts — taxonomia canônica de grupos de substituição (Feature 008),
// fonte ÚNICA consumida pelo seed e pelo classify-foods. Grupos por macro-base
// separando amido/fruta/vegetal (decisão do dono, Sessão 2026-06-10): mais
// coarse que as 13 categorias TACO (que narrariam a substituição), mais finos
// que 3 macro-bases puras. A categoria TACO mapeia pro grupo; "Verduras,
// hortaliças" divide por perfil (carbMinPer100g). Ver specs/008 data-model.md.

export type Basis = "carb" | "protein" | "fat";

export interface GrupoCanonicoDef {
  readonly nome: string;
  readonly basis: Basis;
  readonly categoriasFonte: readonly string[]; // categorias TACO que mapeiam pro grupo
  readonly ancoraFallbackGramasDoNutriente: number; // usado se a mediana da curadoria não for computável
  readonly carbMinPer100g?: number; // desempate da categoria compartilhada (Verduras)
  readonly fallbackDaBase?: boolean; // grupo default da base no fallback sem categoria
  readonly legado?: string; // grupo do seed v0 absorvido (rename mantendo o id)
}

// Os ~7 grupos canônicos. `legado` marca os 4 grupos do seed v0 que viram estes
// por rename (preservando id/FKs de meal_item.substitution_group_id).
export const GRUPOS_CANONICOS: readonly GrupoCanonicoDef[] = [
  {
    nome: "Amidos e cereais",
    basis: "carb",
    categoriasFonte: [
      "Cereais e derivados",
      "Leguminosas e derivados",
      "Verduras, hortaliças e derivados", // compartilhada (split por carbMin)
    ],
    carbMinPer100g: 10,
    ancoraFallbackGramasDoNutriente: 30,
    fallbackDaBase: true,
    legado: "Carboidratos",
  },
  {
    nome: "Frutas",
    basis: "carb",
    categoriasFonte: ["Frutas e derivados"],
    ancoraFallbackGramasDoNutriente: 20,
    legado: "Frutas",
  },
  {
    nome: "Vegetais",
    basis: "carb",
    categoriasFonte: ["Verduras, hortaliças e derivados"], // folhosos (carb < 10)
    ancoraFallbackGramasDoNutriente: 3,
    legado: "Vegetais",
  },
  {
    nome: "Proteínas",
    basis: "protein",
    categoriasFonte: [
      "Carnes e derivados",
      "Pescados e frutos do mar",
      "Ovos e derivados",
    ],
    ancoraFallbackGramasDoNutriente: 25,
    fallbackDaBase: true,
    legado: "Proteínas",
  },
  {
    nome: "Laticínios",
    basis: "protein",
    categoriasFonte: ["Leite e derivados"],
    ancoraFallbackGramasDoNutriente: 8,
  },
  {
    nome: "Gorduras e oleaginosas",
    basis: "fat",
    categoriasFonte: ["Gorduras e óleos", "Nozes e sementes"],
    ancoraFallbackGramasDoNutriente: 12,
    fallbackDaBase: true,
  },
  {
    nome: "Açúcares",
    basis: "carb",
    categoriasFonte: ["Produtos açucarados"],
    ancoraFallbackGramasDoNutriente: 20,
  },
];

// Guardas de confiança/plausibilidade (valores fixados no plan — data-model.md).
export const GUARDAS_CLASSIFICACAO = {
  minBasisPer100g: 1, // teor mínimo do nutriente-base (g/100 g)
  porcaoMinG: 10,
  porcaoMaxG: 600,
} as const;

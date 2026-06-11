// classificacao.ts — auto-classificação de alimentos em grupos de substituição
// (Feature 008). Regra DETERMINÍSTICA: a categoria TACO mapeia pro grupo de
// macro-base; "Verduras, hortaliças" divide por perfil (carbMinPer100g). O
// perfil também é guarda (nutriente-base presente, porção plausível) e fallback
// quando não há categoria. Pura: sem I/O, sem throw, sem mutação. Os valores de
// âncora/guarda vêm de fora (casca). Ver contracts/core-classificacao.md.

export type Basis = "carb" | "protein" | "fat";

export interface GrupoCanonico {
  readonly id: string;
  readonly basis: Basis;
  readonly categoriasFonte: readonly string[]; // categorias TACO que mapeiam pro grupo
  readonly ancoraGramasDoNutriente: number; // g do nutriente-base "por troca"
  // Piso de carb pra capturar uma categoria COMPARTILHADA (split de Verduras):
  // Amidos declara 10; Vegetais não declara (captura o resto). Ausente = captura tudo.
  readonly carbMinPer100g?: number;
  // Grupo default da sua base no fallback sem categoria (futuro import por IA).
  readonly fallbackDaBase?: boolean;
}

export interface GuardasClassificacao {
  readonly minBasisPer100g: number; // teor mínimo do nutriente-base (1 g/100 g)
  readonly porcaoMinG: number; // 10
  readonly porcaoMaxG: number; // 600
}

interface Macros {
  readonly carbPer100g: number | null;
  readonly proteinPer100g: number | null;
  readonly fatPer100g: number | null;
  readonly kcalPer100g: number | null;
}

export type SemGrupoMotivo =
  | "dados-incompletos"
  | "categoria-fora-da-taxonomia"
  | "nutriente-base-insuficiente"
  | "porcao-implausivel";

export type Classificacao =
  | {
      readonly kind: "vinculo";
      readonly grupoId: string;
      readonly referencePortionGrams: number;
    }
  | { readonly kind: "sem-grupo"; readonly motivo: SemGrupoMotivo };

const teorDaBase = (m: Macros, basis: Basis): number =>
  basis === "carb"
    ? (m.carbPer100g as number)
    : basis === "protein"
      ? (m.proteinPer100g as number)
      : (m.fatPer100g as number);

// Arredonda ao múltiplo de 5 mais próximo, mínimo 5.
const round5 = (g: number): number => Math.max(5, Math.round(g / 5) * 5);

export function classificarAlimento(input: {
  readonly tacoCategory: string | null;
  readonly macros: Macros;
  readonly grupos: readonly GrupoCanonico[];
  readonly guardas: GuardasClassificacao;
}): Classificacao {
  const { tacoCategory, macros, grupos, guardas } = input;

  // 1. Dados completos? (nunca inventa valor de dado de saúde — FR-004.)
  if (
    macros.carbPer100g === null ||
    macros.proteinPer100g === null ||
    macros.fatPer100g === null ||
    macros.kcalPer100g === null
  ) {
    return { kind: "sem-grupo", motivo: "dados-incompletos" };
  }

  // 2. Escolhe o grupo.
  const grupo =
    tacoCategory === null
      ? grupoPorPerfil(macros, grupos)
      : grupoPorCategoria(tacoCategory, macros, grupos);

  if (grupo === null) {
    return { kind: "sem-grupo", motivo: "categoria-fora-da-taxonomia" };
  }

  // 3. Guardas.
  const teor = teorDaBase(macros, grupo.basis);
  if (teor < guardas.minBasisPer100g) {
    return { kind: "sem-grupo", motivo: "nutriente-base-insuficiente" };
  }
  const porcao = round5(grupo.ancoraGramasDoNutriente / (teor / 100));
  if (porcao < guardas.porcaoMinG || porcao > guardas.porcaoMaxG) {
    return { kind: "sem-grupo", motivo: "porcao-implausivel" };
  }

  return { kind: "vinculo", grupoId: grupo.id, referencePortionGrams: porcao };
}

// Categoria → grupo. Candidatos = grupos cuja categoriasFonte inclui a categoria.
// Categoria EXCLUSIVA (1 candidato) → esse grupo, qualquer que seja o carbo (as
// guardas decidem depois). Categoria COMPARTILHADA (split de Verduras) → o
// carbMinPer100g é o desempate: entre os que o alimento satisfaz (sem min, ou
// carb ≥ min), vence o de MAIOR min (mais específico: Amidos[10] sobre Vegetais).
function grupoPorCategoria(
  categoria: string,
  macros: Macros,
  grupos: readonly GrupoCanonico[],
): GrupoCanonico | null {
  const carb = macros.carbPer100g as number;
  const candidatos = grupos.filter((g) =>
    g.categoriasFonte.includes(categoria),
  );
  if (candidatos.length === 0) return null;
  if (candidatos.length === 1) return candidatos[0] ?? null;

  const elegiveis = candidatos.filter(
    (g) => g.carbMinPer100g === undefined || carb >= g.carbMinPer100g,
  );
  const pool = elegiveis.length > 0 ? elegiveis : candidatos;
  return pool.reduce((melhor, g) =>
    (g.carbMinPer100g ?? -1) > (melhor.carbMinPer100g ?? -1) ? g : melhor,
  );
}

// Sem categoria (fallback, futuro import): macro dominante → base → grupo default
// daquela base. Determinístico; as guardas seguem aplicando depois.
function grupoPorPerfil(
  macros: Macros,
  grupos: readonly GrupoCanonico[],
): GrupoCanonico | null {
  const carb = macros.carbPer100g as number;
  const protein = macros.proteinPer100g as number;
  const fat = macros.fatPer100g as number;
  const dominante: Basis =
    carb >= protein && carb >= fat
      ? "carb"
      : protein >= fat
        ? "protein"
        : "fat";
  return (
    grupos.find((g) => g.basis === dominante && g.fallbackDaBase === true) ??
    null
  );
}

/* ============ validação do gabarito (SC-002) ============ */

export interface ResultadoGabarito {
  readonly total: number;
  readonly acertos: number;
  readonly acertoPct: number; // 0–100
  readonly divergencias: readonly {
    readonly foodId: string;
    readonly esperado: string;
    readonly obtido: string | null; // grupoId classificado, ou null (sem-grupo)
  }[];
}

export function validarGabarito(
  casos: ReadonlyArray<{
    readonly foodId: string;
    readonly grupoCuradoId: string;
    readonly classificacao: Classificacao;
  }>,
): ResultadoGabarito {
  const divergencias = casos
    .map((c) => {
      const obtido =
        c.classificacao.kind === "vinculo" ? c.classificacao.grupoId : null;
      return obtido === c.grupoCuradoId
        ? null
        : { foodId: c.foodId, esperado: c.grupoCuradoId, obtido };
    })
    .filter((d): d is NonNullable<typeof d> => d !== null);

  const acertos = casos.length - divergencias.length;
  const acertoPct =
    casos.length === 0 ? 100 : (acertos / casos.length) * 100;

  return { total: casos.length, acertos, acertoPct, divergencias };
}

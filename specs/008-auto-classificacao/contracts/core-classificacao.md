# Contrato — núcleo puro `packages/core/src/classificacao.ts`

> Funções puras: sem I/O, sem `throw`, sem mutação. Guardas e mapeamento com valores vindos de fora (data-model.md) — o núcleo não conhece banco nem dataset.

## `classificarAlimento`

```ts
export interface GrupoCanonico {
  readonly id: string;
  readonly categoriasFonte: readonly string[]; // categorias TACO que mapeiam pra ele (D4)
  readonly basis: "carb" | "protein" | "fat";
  readonly ancoraGramasDoNutriente: number; // g do nutriente-base "por troca" (D6)
  // Piso de carb pra "capturar" uma categoria COMPARTILHADA com outro grupo
  // (split de "Verduras, hortaliças": Amidos declara carbMinPer100g=10; Vegetais
  // não declara). Ausente = captura toda a categoria. Ver invariante 6.
  readonly carbMinPer100g?: number;
}

export interface GuardasClassificacao {
  readonly minBasisPer100g: number; // 1 (g/100g)
  readonly porcaoMinG: number; // 10
  readonly porcaoMaxG: number; // 600
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
      readonly referencePortionGrams: number; // derivada, arredondada a 5 g
    }
  | { readonly kind: "sem-grupo"; readonly motivo: SemGrupoMotivo };

export function classificarAlimento(input: {
  readonly tacoCategory: string | null; // sinal primário (D2); null → fallback por perfil
  readonly macros: {
    readonly carbPer100g: number | null;
    readonly proteinPer100g: number | null;
    readonly fatPer100g: number | null;
    readonly kcalPer100g: number | null;
  };
  readonly grupos: readonly GrupoCanonico[];
  readonly guardas: GuardasClassificacao;
}): Classificacao;
```

**Invariantes** (cada uma vira teste):

1. Macro ausente (null) ⇒ `sem-grupo dados-incompletos` — nunca inventa valor (FR-004).
2. Categoria presente que não mapeia pra grupo nenhum (preparados/industrializados/desconhecida) ⇒ `sem-grupo categoria-fora-da-taxonomia` (D4).
3. Categoria mapeada mas teor do basis do grupo `< minBasisPer100g` ⇒ `sem-grupo nutriente-base-insuficiente` (FR-003).
4. Porção derivada (`ancora ÷ basisPer100g/100`, arredondada ao múltiplo de 5 mais próximo, mínimo 5) fora de `[porcaoMinG, porcaoMaxG]` ⇒ `sem-grupo porcao-implausivel` (Q3c).
5. Tudo ok ⇒ `vinculo` com `referencePortionGrams > 0` coerente com a âncora (SC-006).
6. **Categoria compartilhada por 2 grupos** (split de "Verduras, hortaliças" — D4): candidatos = grupos cuja `categoriasFonte` inclui a categoria E (sem `carbMinPer100g`, ou `carbPer100g ≥ carbMinPer100g`); entre os candidatos, vence o de **maior `carbMinPer100g`** (mais específico). Ex.: batata (carb ~12) satisfaz Amidos (carbMin 10) e Vegetais (sem min) → Amidos; alface (carb ~1.7) só satisfaz Vegetais → Vegetais.
7. **Fallback sem categoria** (`tacoCategory: null` — futuro import por IA): macro dominante por 100 g escolhe o basis; entre os grupos desse basis, vence o de **perfil mais próximo** (menor distância euclidiana dos 3 macros normalizados pela kcal); mesmas guardas; nenhum candidato aprovado ⇒ `sem-grupo` pelo motivo da última guarda reprovada.
8. Determinismo/pureza: mesma entrada ⇒ mesma saída; entradas não mutadas; um único grupo por resultado (v0).

## `validarGabarito` (SC-002)

```ts
export interface ResultadoGabarito {
  readonly total: number;
  readonly acertos: number;
  readonly acertoPct: number; // 0–100
  readonly divergencias: readonly {
    readonly foodId: string;
    readonly esperado: string; // grupoId curado
    readonly obtido: string | null; // grupoId classificado ou null (sem-grupo)
  }[];
}

export function validarGabarito(
  casos: ReadonlyArray<{
    readonly foodId: string;
    readonly grupoCuradoId: string;
    readonly classificacao: Classificacao;
  }>,
): ResultadoGabarito;
```

**Invariantes**: acerto = `vinculo` com `grupoId === grupoCuradoId`; `sem-grupo` conta como erro; `acertoPct` exato; lista de divergências completa (insumo do relatório e do gatilho de reversão — < 90% reprova).

## Reusados sem mudança

`Result`/`ok`/`err` (não usados aqui — `Classificacao` já é uma union total, sem erro estrutural) · nenhuma função existente do core muda.

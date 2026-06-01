# Contract — núcleo: combinação (1→2)

`packages/core` — TS puro, sem I/O, sem `throw`, retorna `Result`. Prima de `substituir()`; reusa `basisPer100g()` e `medidaMaisProxima()`. Decisão D7. FR-013–FR-019.

## Tipos

```ts
export interface CombinacaoInput {
  readonly basis: EquivalenceBasis; // nutriente-base do grupo
  readonly origem: {
    readonly groupId: string;
    readonly macros: FoodMacros;
    readonly gramas: number; // quantidade atual do item
  };
  readonly alvos: readonly [AlvoCombinacao, AlvoCombinacao]; // exatamente 2 (FR-013)
  readonly split?: number; // fração [0..1] do nutriente-base pro 1º alvo; default 0.5 (FR-015)
}

export interface AlvoCombinacao {
  readonly groupId: string;
  readonly macros: FoodMacros;
  readonly measures: readonly HouseholdMeasure[];
}

export interface CombinacaoResult {
  readonly partes: readonly [ParteCombinacao, ParteCombinacao];
}
export interface ParteCombinacao {
  readonly gramas: number; // exato, pré-arredondamento
  readonly medidaCaseira: HouseholdMeasure | null;
  readonly fracao: number; // fração do nutriente-base aplicada
}

export type CombinacaoError =
  | { readonly kind: "fora-do-grupo" } // algum alvo de outro grupo (FR-014)
  | { readonly kind: "alvo-sem-nutriente-base" }; // algum alvo com basisPer100g ≤ 0 (FR-017)
```

## Função

```ts
export function combinar(
  input: CombinacaoInput,
): Result<CombinacaoResult, CombinacaoError>;
```

**Semântica**:

1. `split` ausente → `0.5` (50/50). Fora de `[0,1]` → clampa (ou `err`? — clampa; a UI garante o range).
2. Qualquer alvo com `groupId !== origem.groupId` → `err(fora-do-grupo)`.
3. Qualquer alvo com `basisPer100g(alvo) ≤ 0` → `err(alvo-sem-nutriente-base)` (FR-017 — exclui o alvo; a UI não deveria oferecê-lo).
4. `baseTotal = (basisPer100g(origem)/100) × origem.gramas`.
5. `gramas[0] = (baseTotal × split) / (basisPer100g(alvo0)/100)`; `gramas[1] = (baseTotal × (1−split)) / (basisPer100g(alvo1)/100)`.
6. `medidaCaseira` de cada parte = `medidaMaisProxima(gramas, measures)` (null se sem medida → exibe gramas, FR-016).
7. **Preserva o nutriente-base**: `base(parte0)+base(parte1) = baseTotal` (dentro de ≤2%, SC-005). **Não** rebalanceia multi-refeição (FR-018).

## Casos de teste (test-first)

- 50/50: dois alvos do grupo; soma dos nutrientes-base = base do original (≤2%); medidas caseiras corretas.
- split 70/30: recalcula ambos preservando a base; `fracao` reflete o split.
- alvo sem medida caseira → `medidaCaseira = null` (gramas).
- alvo `basisPer100g = 0` → `err(alvo-sem-nutriente-base)`.
- alvo de outro grupo → `err(fora-do-grupo)`.
- split nas bordas (0 e 1) → uma parte zera (degenerado, mas não quebra).

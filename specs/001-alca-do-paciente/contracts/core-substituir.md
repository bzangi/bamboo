# Contract — `substituir()` (núcleo puro, `packages/core`)

A função-coração da tese: dado um item atual e um alimento-alvo do mesmo grupo, devolve a nova quantidade preservando o nutriente-base do grupo + a medida caseira mais próxima. **TS puro, sem I/O, sem `throw`** — retorna `Result`, nunca lança nem retorna `null`.

## Assinatura

```ts
// packages/core/src/substitution.ts
import { Result } from "./result";

export type EquivalenceBasis = "carb" | "protein" | "fat" | "kcal";

export interface FoodMacros {
  readonly carbPer100g: number;
  readonly proteinPer100g: number;
  readonly fatPer100g: number;
  readonly kcalPer100g: number;
}

export interface HouseholdMeasure {
  readonly label: string;
  readonly grams: number;
}

export interface SubstitutionInput {
  readonly basis: EquivalenceBasis;          // nutriente-base do grupo
  readonly origem: {
    readonly groupId: string;
    readonly macros: FoodMacros;
    readonly gramas: number;                 // quantidade atual do item
  };
  readonly alvo: {
    readonly groupId: string;
    readonly macros: FoodMacros;
    readonly measures: readonly HouseholdMeasure[]; // pode ser vazio
  };
}

export interface SubstitutionResult {
  readonly gramas: number;                   // quantidade equivalente (exata, pré-arredondamento)
  readonly medidaCaseira: HouseholdMeasure | null; // medida mais próxima, ou null se não houver
}

export type SubstitutionError =
  | { readonly kind: "fora-do-grupo" }
  | { readonly kind: "nutriente-base-zero" };

export function substituir(
  input: SubstitutionInput,
): Result<SubstitutionResult, SubstitutionError>;
```

## Semântica

1. **Guarda** `alvo.groupId !== origem.groupId` → `err({ kind: "fora-do-grupo" })`.
2. Seja `basisPer100g(food)` o valor do nutriente `basis` por 100 g.
   - **Guarda** `basisPer100g(alvo) <= 0` → `err({ kind: "nutriente-base-zero" })`.
3. `nutBase = (basisPer100g(origem) / 100) * origem.gramas`.
4. `gramas = nutBase / (basisPer100g(alvo) / 100)`.
5. `medidaCaseira` = a medida de `alvo.measures` que minimiza a distância a `gramas` (por múltiplos inteiros da medida); `null` se `measures` vazio.
6. `ok({ gramas, medidaCaseira })`.

## Propriedades (cobertas por testes — test-first, T4)

- **Troca normal** retorna `ok` com `gramas > 0`.
- **Preservação do nutriente-base**: `basisPer100g(alvo)/100 * gramas ≈ nutBase` dentro de **≤ 2%** (afere o `gramas` exato, antes do arredondamento).
- **Arredondamento**: com medidas caseiras, `medidaCaseira` é a mais próxima; sem medidas, `null`.
- **Alvo com nutriente-base zero** → `err({ kind: "nutriente-base-zero" })` (não lança).
- **Alvo fora do grupo** → `err({ kind: "fora-do-grupo" })` (não lança).

## Uso na casca (apps/api)

A `substitution.service` converte o `err` em `HttpException` via `ts-pattern`:

```ts
import { match } from "ts-pattern";
// ...
if (!r.ok) {
  throw match(r.error)
    .with({ kind: "fora-do-grupo" }, () => new UnprocessableEntityException("alimento fora do grupo"))
    .with({ kind: "nutriente-base-zero" }, () => new UnprocessableEntityException("alvo sem o nutriente-base"))
    .exhaustive();
}
```

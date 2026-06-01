# Contract — núcleo: parâmetros de adaptação + alvo do dia + faixa

`packages/core` — TS puro, sem I/O, sem `throw`. Sustenta os adaptadores de rebalanceamento.

## Tipos

```ts
export interface Nutrientes {
  readonly kcal: number;
  readonly carb: number;
  readonly protein: number;
  readonly fat: number;
}

export interface ParametrosAdaptacao {
  readonly toleranciaPct: number; // faixa = alvoNutriente ± toleranciaPct%
  readonly pisoPct: number; // piso = gramasPlanejado × pisoPct/100
}

export type StatusNutriente = "dentro" | "acima" | "abaixo";
```

## Defaults do sistema (nível 3)

```ts
export const PARAMETROS_SISTEMA: ParametrosAdaptacao = {
  toleranciaPct: 10,
  pisoPct: 50,
};
```

## Resolução de 3 níveis (FR-012a–c)

```ts
export function resolverParametros(niveis: {
  readonly sistema: ParametrosAdaptacao;
  readonly nutri?: Partial<ParametrosAdaptacao>;
  readonly paciente?: Partial<ParametrosAdaptacao>;
}): ParametrosAdaptacao;
```

**Semântica**: por **campo**, `paciente?.x ?? nutri?.x ?? sistema.x`. `undefined`/ausente (= coluna nullable null) cai pro próximo nível. Determinística, pura.

## Agregação e alvo

```ts
// Σ nutrientesDaPorcao(macros, gramas) sobre os itens.
export function somaNutrientes(
  itens: ReadonlyArray<{
    readonly macros: FoodMacros;
    readonly gramas: number;
  }>,
): Nutrientes;

// Alvo do dia = soma das opções DEFAULT de todas as refeições do tipo-de-dia (FR-001).
export function alvoDoDia(
  refeicoesDefault: ReadonlyArray<{
    readonly itens: ReadonlyArray<{
      readonly macros: FoodMacros;
      readonly gramas: number;
    }>;
  }>,
): Nutrientes;
```

## Avaliar a faixa (FR-002/FR-003)

```ts
export function avaliarFaixa(
  total: Nutrientes,
  alvo: Nutrientes,
  toleranciaPct: number,
): Record<keyof Nutrientes, StatusNutriente>;
```

- `dentro` se `|total − alvo| ≤ alvo × toleranciaPct/100`; `acima`/`abaixo` caso contrário.
- Desvio pra **baixo** conta igual ao pra cima (faixa, não teto).

## Casos de teste (test-first)

- `resolverParametros`: só sistema; nutri sobrepõe um campo; paciente sobrepõe nutri; mistura (paciente põe piso, nutri põe tolerância).
- `somaNutrientes`/`alvoDoDia`: soma correta sobre múltiplas refeições/itens; lista vazia → zeros.
- `avaliarFaixa`: dentro nos dois sentidos; exatamente na borda (≤ é dentro); acima; abaixo; alvo zero (evitar divisão por zero — nutriente com alvo 0 e total 0 → `dentro`).

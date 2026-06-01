# Contract — núcleo: motor de rebalanceamento

`packages/core` — TS puro, sem I/O, sem `throw`, retorna `Result`. O **primitivo** + dois **adaptadores** (P1 e P3). Decisões D1–D4.

## Tipos

```ts
export interface Alavanca {
  readonly itemId: string;
  readonly refeicaoPosition: number;
  readonly macros: FoodMacros;
  readonly gramasPlanejado: number; // baseline do piso
  readonly gramasAtual: number;
  readonly medidas: readonly HouseholdMeasure[]; // pode ser vazio
}

export interface AlavancaAjustada {
  readonly itemId: string;
  readonly gramasNovo: number;
  readonly medidaCaseira: HouseholdMeasure | null;
}

export type RebalanceOutcome =
  | { readonly kind: "sem-acao" } // dentro da faixa (FR-002)
  | {
      readonly kind: "rebalanceado";
      readonly alavancas: readonly AlavancaAjustada[];
      readonly totalDepois: Nutrientes;
    }
  | {
      readonly kind: "recusa-orientada"; // FR-009 — "nunca barra" (é ok, não erro)
      readonly motivo: "estoura-piso" | "sem-alavanca";
    };

export type RebalanceError = { readonly kind: "entrada-invalida" }; // guarda mínima
```

## Primitivo

```ts
export function rebalancearPorKcal(input: {
  readonly alavancas: readonly Alavanca[];
  readonly deltaKcal: number; // >0 precisa REDUZIR o resto do dia; <0 precisa AUMENTAR
  readonly pisoPct: number;
}): Result<RebalanceOutcome, RebalanceError>;
```

**Semântica** (D2/D3/D4):

1. `|deltaKcal| ~ 0` (sem desvio relevante) → `ok(sem-acao)`.
2. Sem alavancas → `ok(recusa-orientada: "sem-alavanca")`.
3. Distribui `deltaKcal` entre as alavancas **proporcional à kcal que cada uma contribui** (`kcalPorGrama × gramasAtual`). Redução limitada pelo **piso** (`gramasPlanejado × pisoPct/100`); o que não couber numa alavanca **transborda** pras demais em passes.
4. Se, com todas as alavancas no piso, ainda sobra excesso → `ok(recusa-orientada: "estoura-piso")`.
5. Senão → `ok(rebalanceado)` com `gramasNovo` por alavanca, `medidaCaseira` (mais próxima, reusa `medidaMaisProxima`) e `totalDepois` recalculado.
6. Aumento (`deltaKcal < 0`) distribui proporcionalmente, sem teto rígido no v0 (ver research D3 / ponto de gate).
7. `gramasNovo` nunca negativo; entrada estruturalmente impossível → `err(entrada-invalida)` (raro; o grosso é barrado no DTO).

> **Pureza**: nada de relógio/aleatório; mesma entrada → mesma saída. Empates de arredondamento de medida caseira seguem a regra já usada em `substituir()`.

## Adaptador P1 — escolher outra opção (FR-005–FR-009)

```ts
export function previewTrocaOpcao(input: {
  readonly refeicoesDefault: ReadonlyArray<{ readonly itens: ItemMacro[] }>; // pro alvo
  readonly diaComEscolha: ReadonlyArray<{ readonly position: number; readonly itens: ItemPlano[] }>;
  readonly triggerPosition: number;
  readonly parametros: ParametrosAdaptacao;
}): Result<RebalanceOutcome, RebalanceError>;
```

- `alvo = alvoDoDia(refeicoesDefault)`; `total = somaNutrientes(diaComEscolha)`.
- `avaliarFaixa(total, alvo, toleranciaPct)`: todos `dentro` → `sem-acao`.
- `deltaKcal = total.kcal − alvo.kcal`; `alavancas` = itens flexíveis (`!isLocked && groupId != null`) de refeições com `position > triggerPosition` → `rebalancearPorKcal`.

## Adaptador P3 — troca de tipo-de-dia (FR-020)

```ts
export function previewTrocaTipoDia(input: {
  readonly consumido: Nutrientes; // o que já foi consumido (fonte = registro, fora de escopo no v0)
  readonly refeicoesRestantesNovoTipo: ReadonlyArray<{ readonly position: number; readonly itens: ItemPlano[] }>;
  readonly refeicoesDefaultNovoTipo: ReadonlyArray<{ readonly itens: ItemMacro[] }>;
  readonly parametros: ParametrosAdaptacao;
}): Result<RebalanceOutcome, RebalanceError>;
```

- `alvoNovo = alvoDoDia(refeicoesDefaultNovoTipo)`.
- `deltaKcal = (consumido.kcal + somaNutrientes(refeicoesRestantesNovoTipo).kcal) − alvoNovo.kcal`.
- `alavancas` = flexíveis das refeições restantes do novo tipo → `rebalancearPorKcal`.
- **No v0 não há consumidor no app** (FR-021/FR-022): este adaptador é construído e **testado no núcleo**, mas a casca não o expõe (sem registro). Acende quando o registro existir.

## Casos de teste (test-first)

- **sem-acao**: escolha cabe na faixa → não mexe em nada.
- **rebalanceado (reduzir)**: opção mais pesada; alavancas seguintes reduzem proporcional, soma volta à faixa; itens travados/sem-grupo intactos (FR-006); `totalDepois.kcal ≈ alvo.kcal`.
- **rebalanceado (aumentar)**: opção mais leve → alavancas aumentam.
- **recusa estoura-piso**: desvio grande, todas as alavancas batem o piso → `recusa-orientada("estoura-piso")`, nenhuma abaixo do piso (SC-002/FR-011).
- **recusa sem-alavanca**: refeições seguintes só travadas/sem-grupo → `recusa-orientada("sem-alavanca")` (FR mesa-6).
- **sem refeição seguinte**: gatilho na última posição; cabe na faixa → `sem-acao`; não cabe → recusa.
- **kcal-priority**: macros não fecham juntos; `totalDepois.kcal` dentro da faixa, resíduo de macro reportado (FR-010/SC-010).
- **P3**: consumido < alvoNovo → redistribui; consumido > alvoNovo+faixa → recusa; `consumido = 0` (início do dia) → `sem-acao`.
- **piso por nível**: mesma entrada, `pisoPct` 50 vs 70 muda o ponto de recusa (FR-012a).

# Data Model — Desfazer coerente com o rebalanceamento

**Sem mudança de banco.** Nenhuma tabela, migration, enum ou DTO de API muda. O contrato `POST /rebalance/option-choice` e os tipos em `@bamboo/types` permanecem como estão. O "modelo de dados" desta feature é **estado de sessão efêmero** no app do paciente (some ao recarregar o `/today` ou trocar de tipo-de-dia).

## Estado de sessão (em `HomeScreen`)

### `ActiveSwap` (novo)

Uma troca de opção ativa, por refeição-gatilho.

| Campo              | Tipo                               | Significado                                                                                                 |
| ------------------ | ---------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `chosenOptionId`   | `string`                           | opção escolhida (não-default) atualmente ativa na refeição                                                  |
| `previousOptionId` | `string`                           | opção a restaurar ao desfazer; no v0 = `defaultOption.id`                                                   |
| `adjustments`      | `Readonly<Record<itemId, string>>` | rótulos de quantidade derivados desta troca, por item das **outras** refeições (ex.: `"2 colheres (60 g)"`) |

### `SwapState` (novo) — substitui `optionOverrides` + `qtyOverrides`

```
SwapState = Readonly<Record<mealId, ActiveSwap>>
```

- A opção ativa de uma refeição = `swaps[mealId]?.chosenOptionId` (senão `defaultOption`).
- O rótulo de quantidade derivado de um item = achatar `adjustments` de todas as trocas → `Record<itemId, string>` (conjuntos disjuntos na prática).
- "Há troca ativa nesta refeição" = `mealId in swaps`.

### Mantidos (inalterados)

- `nameOverrides: Record<itemId, NameOverride>` — mudança direta no item (substituir/combinar). **É o único gatilho do "↺ desfazer" por-item.**
- `consumoOverrides: Record<itemId, ConsumoItem[]>` — consumo efetivo p/ o POST registro.

### `swapToast` (novo) — estado do snackbar

| Campo         | Tipo     | Significado                                 |
| ------------- | -------- | ------------------------------------------- |
| `mealId`      | `string` | refeição cuja troca o snackbar desfaz       |
| `optionLabel` | `string` | rótulo exibido (ex.: nome da opção trocada) |

`swapToast: { mealId, optionLabel } | null`. Setado em nova troca; limpo ao desfazer, ao expirar (~5s) ou ao desmontar.

## Transições puras (`apps/mobile/src/swaps.ts`)

Funções puras, sem I/O, sem mutação (retornam novo `SwapState`):

- `applySwap(state, { mealId, chosenOptionId, previousOptionId, outcome }) → SwapState`
  Constrói `adjustments` a partir de `outcome` (se `kind === "rebalanceado"`, achatando `refeicoesAfetadas[].itensAjustados[]` para `itemId → rótulo`; senão `{}`), e grava `state[mealId]` **substituindo** qualquer troca anterior da mesma refeição (re-troca atômica — FR-006).
- `undoSwap(state, mealId) → SwapState`
  Remove `state[mealId]` (opção + ajustes juntos — FR-003). No-op se não existir.
- `activeOptionId(state, mealId) → string | undefined`
  `state[mealId]?.chosenOptionId`.
- `flattenAdjustments(state) → Readonly<Record<itemId, string>>`
  União dos `adjustments` de todas as trocas — para o render passar a `ItemRow` como hoje (`qtyOverride`).

## Invariantes

- Um ajuste derivado nunca existe fora de uma `ActiveSwap` → impossível desfazê-lo isoladamente (FR-001/SC-002).
- `undoSwap` seguido de `flattenAdjustments` não contém nenhum item daquela troca, e `activeOptionId` volta a `undefined` → dia idêntico ao pré-troca (SC-001).
- `nameOverrides` e `SwapState` são disjuntos em propósito: o primeiro é mudança direta (desfazível por-item), o segundo é consequência de troca (desfazível só pela troca).

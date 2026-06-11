# Data Model — 009 Coerência da troca de tipo-de-dia após consumo

**Nada novo é persistido.** Não há entidade, tabela ou migration. Tudo é **derivado por requisição** a partir de dados já existentes (`meal_event` / `meal_event_item`, `meal`/`meal_option`/`meal_item`) e de estado de sessão do app (`swaps`, da 005).

## Entidades de persistência tocadas

| Entidade                             | Uso nesta feature                                                      | Mudança |
| ------------------------------------ | ---------------------------------------------------------------------- | ------- |
| `meal_event` (+ `meal_event_item`)   | Leitura: consumo do dia (estado + posição), via `carregarConsumoDoDia` | nenhuma |
| `meal` / `meal_option` / `meal_item` | Leitura: cardápio do tipo exibido                                      | nenhuma |

## Adição no contrato (DTO de apresentação)

`MealDto` (`packages/types/src/today.ts`) ganha **um campo aditivo**:

```ts
readonly rebalanceado: boolean; // refeição teve grama recalculada pela reconciliação
```

- **Aditivo e não-quebrável**: clientes que ignoram o campo seguem válidos.
- **Default**: `false` (refeição no planejado / sem override / sem ajuste).
- **Não vaza número**: é booleano; nenhuma kcal/macro/percentual.

O campo `registro: { state } | null` **não muda de forma** — só muda como é preenchido sob override (ver Regras de derivação).

## Conceitos de apresentação (derivados, não persistidos)

- **`registroPorPosition: Map<number, RegistrationStatus>`** (casca, efêmero por request): posição → estado vigente do consumo do dia. Derivado de `carregarConsumoDoDia.porMeal` (que já traz `position` + `state`). Usado só quando override ativo.
- **`rebalanceado` (por refeição)**: `true` sse algum item da opção default está no mapa `ajuste` (itemId→gramasNovo) que a casca já computa em `calcularAjusteTrocaTipoDia`.
- **`deveSinalizar(meal, swaps)` (cliente, puro)**: `meal.rebalanceado === true` OU a refeição é alvo de ajustes do `swaps` vigente.

## Regras de derivação (puras)

1. **Registro sob override** (FR-001/002): com `?dayTypeId` ativo, `meal.registro = registroPorPosition.get(meal.position) ?? null`. Sem override: comportamento atual (`estadoVigente` por `mealId`).
2. **Refeição registrada não recebe ajuste nem sinal** (FR-003): a posição registrada já sai das alavancas (single-count) → nenhum item seu está no mapa `ajuste` → `rebalanceado = false`. Invariante a testar.
3. **`rebalanceado`** (FR-005/006): `meal.options.find(isDefault).items.some(it => ajuste.has(it.id))`. Sem mapa `ajuste` (sem override / sem gap / recusa do motor) → `false` em todas.
4. **Posição sem par no novo tipo** (FR-004): se `registroPorPosition` tem uma posição que o tipo exibido não possui, nenhum badge é criado pra ela; o consumo daquela refeição segue contando na reconciliação (já é assim no motor).
5. **Badge display-only sob override** (D3): regra de cliente — se override ativo, o badge não oferece ações de desfazer/corrigir.

## Estados (registro) — reuso

`RegistrationStatus = 'feito' | 'troquei' | 'pulei'` (já existe). O badge pareado reflete o estado vigente da refeição consumida na mesma posição. Sem novos estados.

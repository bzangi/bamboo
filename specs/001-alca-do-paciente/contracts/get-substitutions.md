# Contract — GET /meal-items/:id/substitutions

Lista as alternativas de troca de um item flexível, dentro do seu grupo, **já com a quantidade equivalente calculada** (via `packages/core`) e a medida caseira. Alimenta a US2 ("substituir num toque").

## Request

```
GET /meal-items/:mealItemId/substitutions
```

- `mealItemId` (path, uuid).

## Comportamento

1. Carrega o `meal_item`, seu `food` atual e `substitution_group_id`.
2. **Item travado** (`is_locked = true`) ou **sem grupo** (`substitution_group_id = null`) → ver Erros (não há troca).
3. Carrega os demais `food` do grupo (via `food_substitution_group`), com macros/100g e medidas caseiras.
4. Para cada alvo, chama a função pura `substituir()` do core; **exclui** alvos que retornam `err` (`nutriente-base-zero`).
5. Retorna a lista de alternativas com `gramas` + medida caseira.

## Response 200 (DTO — `packages/types`)

```jsonc
{
  "itemId": "uuid",
  "group": { "id": "uuid", "name": "Carboidratos", "basis": "carb" },
  "current": {
    "foodId": "uuid",
    "name": "Arroz branco cozido",
    "quantityGrams": 120,
  },
  "alternatives": [
    {
      "foodId": "uuid",
      "name": "Batata inglesa cozida",
      "gramas": 168, // quantidade equivalente (preserva o nutriente-base)
      "medidaCaseira": { "label": "1 unidade média", "grams": 170 }, // ou null se o alvo não tiver medida
    },
  ],
}
```

## Erros

- `404`: item não encontrado.
- `409 / 422` (item não substituível): item **travado** ou **sem grupo** → o app não deve chamar este endpoint para esses itens (a UI já não oferece troca); se chamado, retorna não-substituível.
- Lista **vazia** de `alternatives` é **200** (não erro): grupo sem outros alimentos elegíveis → o app informa "sem alternativas" (FR-014, "nunca barra").

## Notas

- O cálculo de cada `gramas` vem **integralmente** de `@bamboo/core` (`substituir()`); o endpoint é casca.
- Aplicar a troca é client-side no v0 (sem persistência) — este endpoint só **lista** alternativas.

# Contract — POST /meal-items/:itemId/combine

Combinação 1→2: troca um item flexível por dois alvos do mesmo grupo, preservando o nutriente-base. **Calcula e devolve; não persiste** (D9). Casca fina sobre `combinar()`. US2. Prima de `GET /meal-items/:id/substitutions` da Fase 1.

## Request

```
POST /meal-items/:itemId/combine
Content-Type: application/json
```

```jsonc
{
  "alvoFoodIds": ["uuid", "uuid"], // exatamente 2 (FR-013)
  "split": 0.5, // opcional [0..1], fração do nutriente-base pro 1º alvo; default 0.5
}
```

- `itemId` (path, uuid) — o `meal_item` a combinar.
- Estrutural no DTO: exatamente 2 uuids distintos; `split` ∈ [0,1] se presente.

## Comportamento (casca)

1. Carrega o `meal_item` (+ `food`, `substitution_group_id`, `quantity_grams`).
2. Guarda: item **flexível** (`!is_locked && substitution_group_id != null`) — senão **422** (item travado/sem grupo não combina, FR-019).
3. Carrega os dois alvos (`food` + medidas) e o `basis` do grupo.
4. Chama `combinar({ basis, origem, alvos, split })` (núcleo puro).
5. `Result.err` → `HttpException` (Opção 1): `fora-do-grupo` / `alvo-sem-nutriente-base` → **422**.
6. `Result.ok` → DTO de response respeitando o gate de exposição.

## Response 200 (DTO — `packages/types`)

```jsonc
{
  "itemId": "uuid",
  "exposure": "hidden | percent | macros | full_kcal",
  "partes": [
    {
      "food": { "id": "uuid", "name": "Arroz branco cozido" },
      "gramas": 45,
      "medidaCaseira": { "label": "colher de sopa", "grams": 30, "n": 2 }, // ou null → gramas
      "fracao": 0.5,
      "nutrition": { "carb": 12.5, "protein": 1.4, "fat": 0.2 }, // conforme exposure; ausente em 'hidden'
    },
    {
      "food": { "id": "uuid", "name": "Batata cozida" },
      "gramas": 104,
      "medidaCaseira": null,
      "fracao": 0.5,
    },
  ],
}
```

## Erros

- `404` item inexistente.
- `422` item travado/sem grupo; alvo fora do grupo; alvo sem nutriente-base (`basisPer100g ≤ 0`).

## Notas

- Combinação **não** dispara rebalanceamento multi-refeição (FR-018) — resposta é local à refeição.
- Não persiste (FR-026). DTO puro, nunca entidade do Drizzle.

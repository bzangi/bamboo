# Contrato: `GET /meal-items/:id/substitutions` — `includeSelf` (aditivo)

Estende o endpoint da 010/019. Nenhuma mudança de forma; `q`/`limit`/`offset` continuam exatamente
como estão.

## Requisição

```
GET /meal-items/:mealItemId/substitutions?includeSelf=true&q=&limit=&offset=
```

- `includeSelf` — opcional. Ausente ou falsy: comportamento de hoje (food de origem excluído).
  Truthy: o food de origem entra em `alternatives`.
- `q`/`limit`/`offset` — inalterados (019); aplicam-se sobre o conjunto JÁ incluindo (ou não) a
  origem, conforme `includeSelf`.

## Resposta (forma inalterada)

```jsonc
{
  "itemId": "uuid",
  "group": { "id": "uuid", "name": "Amidos e cereais", "basis": "carb" },
  "current": { "foodId": "uuid", "name": "Arroz branco cozido", "quantityGrams": 120, "adLibitum": false },
  "alternatives": [
    // com includeSelf=true, uma entrada pode ter foodId === current.foodId,
    // com gramas === current.quantityGrams (identidade — mesmas macros)
    { "foodId": "uuid", "name": "Arroz branco cozido", "gramas": 120, "medidaCaseira": {...}, "macros": {...} },
    { "foodId": "uuid-2", "name": "Batata inglesa cozida", "gramas": 145, "medidaCaseira": {...}, "macros": {...} }
  ]
}
```

## Casos de erro (inalterados)

- Item travado ou sem grupo → 422.
- Item inexistente → 404.
- `mealItemId` não-UUID → 400.

## Retrocompatibilidade

- Sem `includeSelf`: resposta byte-a-byte idêntica à de hoje — inclusive a suíte existente que
  afirma `alt.foodId !== item.foodId` continua verde sem alteração (`substitutions.e2e-spec.ts`).
- `POST /meal-items/:id/combine` **não muda** — já aceita hoje o food de origem como um dos dois
  `alvoFoodIds` (a query de `groupFoods` em `combination.service.ts` nunca excluiu a origem); o que
  faltava era só o cliente conseguir OFERECER essa opção na lista de candidatos.

# Contrato (delta) — GET /meal-items/:id/substitutions

Delta sobre `specs/001-alca-do-paciente/contracts/get-substitutions.md`. Tudo que não está
aqui permanece como na 001 (rota, 404, 422 de item travado/sem grupo, lista vazia = 200,
exclusão de alvo com nutriente-base zero, ordem das alternativas).

## Mudança: alternativa ganha `nutrition` opcional

```jsonc
// 200 OK — exposure do paciente dono do item = "full_kcal"
{
  "itemId": "…",
  "group": { "id": "…", "name": "Amidos e cereais", "basis": "carb" },
  "current": {
    "foodId": "…",
    "name": "Arroz branco cozido",
    "quantityGrams": 150,
  },
  "alternatives": [
    {
      "foodId": "…",
      "name": "Batata inglesa cozida",
      "gramas": 290,
      "medidaCaseira": { "label": "unidade média", "grams": 145 },
      "nutrition": {
        // NOVO — porção das MESMAS gramas equivalentes
        "kcal": 151.4,
        "carb": 34.8,
        "protein": 3.5,
        "fat": 0.3,
        "carbPct": 90.2,
        "proteinPct": 9.1,
        "fatPct": 0.7,
      },
    },
  ],
}
```

## Regra do gate (idêntica ao `/today` — mesma função na borda)

| `patient.exposure` | Campo `nutrition` da alternativa              |
| ------------------ | --------------------------------------------- |
| `hidden`           | **Ausente** (omitido na origem; nada trafega) |
| `percent`          | Só `carbPct` / `proteinPct` / `fatPct`        |
| `macros`           | Macros em gramas + proporções; **sem** `kcal` |
| `full_kcal`        | Tudo (kcal + macros + proporções)             |

- O paciente dono é resolvido pelo servidor via o próprio item
  (`meal_item→meal_option→meal→day_type→plan→patient`); a rota **não muda**.
- `current` **não** ganha bloco de nutrição (fora de escopo — já visível no card via `/today`).
- Arredondamento: 1 casa decimal, mesmo comportamento do `/today` (`nutritionFor`).

## Invariantes preservadas (FR-004)

- Ordem, `gramas`, `medidaCaseira`, `group`, `current`: byte-a-byte como hoje para qualquer
  exposure (o campo novo é a única diferença).
- Item travado / sem grupo → **422** (inalterado). Item inexistente → **404** (inalterado).
- Grupo sem outras alternativas → **200** com `alternatives: []` (inalterado — ganha e2e
  explícito, FR-006).
- Sem cabeçalho/auth novo: v0 segue auth stub (guard de propriedade é EP-3, fora daqui).

## Clientes

- `packages/api-client`: nenhuma mudança de código (tipo flui de `@bamboo/types`).
- `apps/mobile/SubstitutionSheet`: exibe linha de nutrição **se** `nutrition` presente.
- `apps/mobile/CombineSheet`: consome o mesmo GET; **não** exibe nutrição (decisão de spec).
- OpenAPI (`apps/api/src/docs/swagger.models.ts` + `openapi:gen`): modelo da alternativa
  ganha o campo opcional; regen commitado no polish.

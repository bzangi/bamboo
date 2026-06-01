# Contract — POST /patients/:patientId/rebalance/option-choice

Prévia do rebalanceamento ao escolher uma opção desigual (gatilho P1). **Calcula e devolve; não persiste** (D9). Casca fina sobre `previewTrocaOpcao` do núcleo. US1.

## Request

```
POST /patients/:patientId/rebalance/option-choice
Content-Type: application/json
```

```jsonc
{
  "triggerMealId": "uuid", // refeição onde a escolha aconteceu
  "chosenOptionId": "uuid", // opção (não-default) escolhida nessa refeição
}
```

- `patientId` (path, uuid). v0: paciente fixo via env (auth stub); deve casar com o semeado.
- Validação **estrutural** no DTO (`class-validator`): uuids válidos. Validação de **negócio** (opção pertence à refeição, refeição pertence ao plano do paciente do dia) na casca → 404/422.

## Comportamento (casca)

1. Resolve o `day_type` corrente do paciente (mesma resolução do `/today`) e carrega suas refeições/opções/itens + macros/medidas.
2. Resolve os **parâmetros** (3 níveis): lê `patient.{band_tolerance_pct,floor_pct}` e `nutritionist.{default_band_tolerance_pct,default_floor_pct}`; chama `resolverParametros` com `PARAMETROS_SISTEMA`.
3. Monta `diaComEscolha` (a refeição do gatilho usa `chosenOptionId`; as demais, a default/atual) e `refeicoesDefault`.
4. Chama `previewTrocaOpcao(...)` (núcleo puro).
5. Mapeia o `RebalanceOutcome` → DTO de response **respeitando o gate de exposição** (`patient.exposure`).

## Response 200 (DTO — `packages/types`)

`outcome` é uma união discriminada espelhando o núcleo:

```jsonc
{
  "patientId": "uuid",
  "exposure": "hidden | percent | macros | full_kcal",
  "outcome": {
    "kind": "rebalanceado", // | "sem-acao" | "recusa-orientada"
    "refeicoesAfetadas": [
      {
        "mealId": "uuid",
        "name": "Jantar",
        "position": 4,
        "itensAjustados": [
          {
            "itemId": "uuid",
            "food": { "id": "uuid", "name": "Arroz branco cozido" },
            "gramasNovo": 90,
            "medidaCaseira": { "label": "colher de sopa", "grams": 30, "n": 3 }, // ou null → exibe gramas
          },
        ],
      },
    ],
    // presente conforme exposure (ausente em 'hidden'): nunca "% de caloria" (FR-023)
    "totalDepois": { "kcal": 2010, "carb": 230, "protein": 130, "fat": 60 },
  },
}
```

- `kind: "sem-acao"` → sem `refeicoesAfetadas` (cabe na faixa, FR-002/SC-004).
- `kind: "recusa-orientada"` → traz `motivo` (`estoura-piso`|`sem-alavanca`) e uma `mensagemKey` pra orientação ("hoje ficou acima, segue leve"). **200**, não erro (FR-009, D4 — "nunca barra").
- `hidden` → omite `totalDepois` e qualquer número nutricional; mostra só `gramasNovo`/`medidaCaseira` (ação, FR-023/FR-024/SC-006).

## Erros

- `404` paciente/refeição/opção inexistente ou fora do plano do dia.
- `422` `chosenOptionId` não pertence a `triggerMealId`.
- (recusa de rebalanceamento **não** é erro — ver 200 acima.)

## Notas

- Nada é persistido — a aplicação da escolha é estado local no app (FR-026).
- A response **nunca** serializa entidade do Drizzle crua (Princípio III): DTO por função pura.

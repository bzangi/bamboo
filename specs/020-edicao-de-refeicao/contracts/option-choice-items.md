# Contract — POST /patients/:patientId/rebalance/option-choice (extensão `items`)

Endpoint existente (002/014). Extensão **aditiva**: campo opcional `items`.

## Request

```jsonc
{
  "triggerMealId": "<uuid>", // refeição em edição (gatilho)
  "chosenOptionId": "<uuid>", // opção ativa da refeição (pode ser a default)
  "dayTypeId": "<uuid>", // opcional (014) — override de tipo-de-dia
  "items": [
    // opcional (020) — overlay da composição editada
    { "itemId": "<uuid>", "foodId": "<uuid>", "quantityGrams": 120 },
  ],
}
```

## Semântica

- `items` presente: o dia é montado com a refeição-gatilho na composição editada — cada item da
  opção escolhida com entradas no overlay contribui com o food/gramas do overlay; itens sem
  entrada contribuem como planejados. O motor então avalia o dia como na troca de opção
  (faixa-alvo → `sem-acao`; desvio → alavancas nas demais refeições não registradas; piso →
  `recusa-orientada`).
- A refeição-gatilho e refeições registradas **nunca** são alavancas (regra existente).
- `items` ausente: comportamento atual byte-a-byte (compat provada pela suíte existente).
- **Nada persiste.**

## Validação

| Caso                                                                                | Status      |
| ----------------------------------------------------------------------------------- | ----------- |
| `itemId`/`foodId` não-UUID, `quantityGrams` não numérico ou ≤ 0, `items` vazio `[]` | 400         |
| `itemId` não pertence à `chosenOptionId`                                            | 404         |
| `foodId` inexistente                                                                | 404         |
| item do overlay é travado ou sem grupo de substituição (não editável)               | 422         |
| demais validações existentes (paciente, gatilho, opção, dayTypeId)                  | inalteradas |

Grupo de substituição do `foodId` **não** é re-validado aqui (D4) — o `POST /registro` é o
ponto de enforcement (`consumo-fora-do-grupo` → 422).

## Response

`OptionChoiceResponse` **inalterado**: `{ patientId, exposure, outcome }` com
`outcome.kind ∈ { sem-acao, rebalanceado, recusa-orientada }`; `totalDepois` continua atrás do
gate de exposição.

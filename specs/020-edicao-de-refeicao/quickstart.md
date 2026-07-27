# Quickstart — 020 Edição de refeição em lote

Pré-requisito: Postgres de dev no ar + `pnpm --filter @bamboo/db seed` (Bruno sobe os servers).

## API (curl)

1. Descubra o dia: `GET /patients/$PATIENT_ID/today` → anote `currentMealId`, a opção default e
   2 itens flexíveis (`substitutable: true`).
2. Para cada item, pegue uma alternativa: `GET /meal-items/$ITEM_ID/substitutions` → anote
   `foodId` + `gramas` de uma alternativa.
3. Prévia da edição em lote:

   ```bash
   curl -s -X POST "$API/patients/$PATIENT_ID/rebalance/option-choice" \
     -H 'content-type: application/json' \
     -d '{"triggerMealId":"<mealId>","chosenOptionId":"<optionId>",
          "items":[{"itemId":"<i1>","foodId":"<f1>","quantityGrams":<g1>},
                   {"itemId":"<i2>","foodId":"<f2>","quantityGrams":<g2>}]}'
   ```

   Esperado: `outcome.kind` = `sem-acao` (trocas equivalentes ficam na faixa) — force um
   `quantityGrams` grande (ex.: 500) para ver `rebalanceado` com `refeicoesAfetadas` SEM o
   gatilho e SEM refeições registradas.

4. Compat: repita **sem** `items` → resposta idêntica à de antes da feature.
5. Nada persistiu: contagens de `meal_event`/`meal_event_item` inalteradas.

## App (simulador)

1. Na refeição do momento, tocar "editar refeição" → sheet lista os itens; travado desabilitado.
2. Trocar 2 itens (picker = folha de troca de sempre, com busca) → "Ver impacto".
3. Prévia: confirmar → refeição mostra a nova composição; snackbar com desfazer (atômico).
4. "Feito" → badge "troquei"; `GET .../today` mostra `registro: "troquei"`.
5. Desfazer do snackbar antes do Feito → composição e ajustes voltam juntos.

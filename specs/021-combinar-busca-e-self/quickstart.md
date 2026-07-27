# Quickstart: verificar manualmente

Pré-requisito: API rodando (`pnpm --filter api dev`, porta 3333) com seed aplicado
(`pnpm --filter db seed`, ou banco já semeado).

## API — `includeSelf`

```bash
# pega um meal_item flexível qualquer do seed
curl -s http://localhost:3333/meal-items/<ID_DO_ITEM_FLEXIVEL>/substitutions | jq '.alternatives | length'
# repete com includeSelf=true — deve vir +1 (o próprio food) e um dos foodId == current.foodId
curl -s "http://localhost:3333/meal-items/<ID_DO_ITEM_FLEXIVEL>/substitutions?includeSelf=true" | jq '.alternatives[] | select(.foodId == .foodId)'
```

Confirma: sem o parâmetro, a contagem e o conteúdo são os de sempre; com `includeSelf=true`, o
`current.foodId` aparece dentro de `alternatives` com `gramas` igual à quantidade atual do item.

## App — combinar

1. Abrir o app do paciente (simulador iOS), ir à home, tocar "Combinar" num item flexível de um
   grupo com vários alimentos (ex.: "Amidos e cereais").
2. Confirmar que agora existe campo de busca (a partir de ~8 candidatos, como na troca simples) e
   que a lista rola carregando mais conforme se aproxima do fim.
3. Confirmar que o **próprio alimento do item** aparece na lista de candidatos (ex.: combinando
   "Arroz branco cozido", "Arroz branco cozido" deve aparecer entre as opções).
4. Selecionar o alimento de origem + um segundo alimento do grupo; ajustar a proporção; confirmar
   que as duas partes calculadas somam de volta ao item original (dentro da tolerância já usada).
5. Confirmar "Usar combinação" e verificar que o item na tela reflete os dois alimentos.
6. Abrir a troca simples (não o combinar) do mesmo item e confirmar que o próprio alimento
   **continua ausente** da lista — comportamento inalterado.

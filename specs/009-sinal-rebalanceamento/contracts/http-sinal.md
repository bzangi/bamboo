# Contract — GET /patients/:id/today (adição da 009)

Esta feature **não cria endpoint**. Estende o contrato existente `GET /patients/:id/today` de forma **aditiva e não-quebrável**.

## Mudança 1 — campo aditivo `rebalanceado` por refeição

Cada item de `meals[]` ganha:

```jsonc
{
  "id": "…",
  "name": "Almoço",
  "position": 2,
  "registro": null,
  "rebalanceado": true,   // NOVO — refeição teve grama recalculada pela reconciliação
  "defaultOption": { "items": [ { "id": "…", "quantityGrams": 108.1, ... } ] },
  // …demais campos inalterados
}
```

- **Tipo**: `boolean`. **Sempre presente** (não-opcional) após esta feature; default `false`.
- **Semântica**: `true` ⇔ ≥1 item da opção default da refeição teve a grama ajustada pela reconciliação com o consumo (troca de tipo-de-dia). `false` em: sem override, sem gap (motor "sem-ação"), recusa do motor (estoura-piso/sem-alavanca), ou refeição registrada (single-count).
- **Não-quebrável**: clientes anteriores ignoram o campo; nenhum campo existente muda de forma/semântica.
- **Não vaza número**: booleano; nenhuma kcal/macro/percentual.

## Mudança 2 — `registro` preenchido por posição sob override (sem mudança de forma)

`registro: { state: 'feito'|'troquei'|'pulei' } | null` **mantém a forma**. Muda só o preenchimento:

- **Sem `?dayTypeId`** (tipo padrão): inalterado — estado vigente por `mealId` (Q1 da 004 preservada).
- **Com `?dayTypeId`** (override ativo): a refeição da `position` P reflete o estado vigente do consumo do dia naquela posição (type-agnostic), pareando os slots entre tipos-de-dia. Ex.: café (pos 1) registrado como `feito` no treino → no `?dayTypeId=descanso`, o café do descanso vem `registro: { state: 'feito' }`.

## Invariantes (verificáveis)

- **INV-1** (single-count): a refeição cuja posição está registrada vem `rebalanceado: false` e no planejado (grama = planejado), com `registro` preenchido.
- **INV-2** (só onde mudou): `rebalanceado: true` exatamente nas refeições com grama ≠ planejado por reconciliação; as demais `false`.
- **INV-3** (sem override): `rebalanceado: false` em todas e `registro` por `mealId` (comportamento da 004 intacto).
- **INV-4** (matemática intacta): as `quantityGrams` são idênticas às de antes da 009 (SC-006).
- **INV-5** (nunca barra): `GET /today` segue 200 em todos os casos; o campo nunca induz erro/bloqueio.

## Fora deste contrato

- O sinal da **troca de opção** é derivado no cliente (estado `swaps` da 005); não usa `rebalanceado` nem novo endpoint.
- Ações de desfazer/corrigir do badge sob override (display-only) são comportamento de cliente, não do contrato.

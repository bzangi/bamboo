# Quickstart — verificar o fix do desfazer vs. rebalanceamento

## Testes automatizados (lógica pura)

```bash
# na raiz do worktree
pnpm --filter mobile test          # Vitest sobre swaps.ts (reducer puro)
pnpm --filter mobile exec tsc --noEmit   # type-check do app (tsconfig Expo)
pnpm format                        # Prettier (cobre .tsx/.ts) — gate de "done"
```

Os testes de `swaps.test.ts` cobrem:

- **applySwap** monta `adjustments` a partir de um outcome `rebalanceado`; `sem-acao`/`recusa-orientada` → `adjustments` vazio.
- **undoSwap** remove opção + ajustes juntos (após desfazer, `flattenAdjustments` não tem os itens da troca e `activeOptionId` é `undefined`) — SC-001.
- **re-troca** (applySwap duas vezes na mesma refeição) deixa só os ajustes da 2ª troca, sem fantasma da 1ª — FR-006.
- **flattenAdjustments** une trocas de refeições distintas sem colidir.

## Verificação manual (UI — não coberta por teste automatizado)

Pré-requisito: `EXPO_PUBLIC_PATIENT_ID` apontando para o paciente semeado; API + Postgres no ar (ver docker-compose). `pnpm --filter mobile start`.

1. **Sem gap (FR-001 / SC-002)**: numa refeição com >1 opção, escolher uma opção não-default que rebalanceie as outras → confirmar. Nos itens **ajustados** das outras refeições, **não** deve haver "↺ desfazer". (Antes: havia, e tocá-lo deixava o dia inconsistente.)
2. **Snackbar (FR-004 / SC-003/005)**: logo após confirmar, aparece "↺ Desfazer" por ~5s. Tocar → opção volta à default e os ajustes somem (dia volta ao pré-troca). Não tocar → some em ~5s e a troca permanece.
3. **Chip durável (FR-005)**: após o snackbar sumir, re-tocar o chip da opção **default** da refeição trocada → desfaz a troca inteira (opção + ajustes).
4. **Re-troca (FR-006)**: trocar A→B, depois A→C → os ajustes refletem só C; nenhum resíduo de B.
5. **Desfazer por-item preservado (FR-002 / SC-004)**: **substituir** ou **combinar** um item → aquele item tem "↺ desfazer"; tocar reverte só ele, sem mexer nas outras refeições.
6. **Registro intacto (FR-007)**: o "↺ desfazer" do marcador de refeição registrada (feito/troquei/pulei) continua funcionando como antes, independente das trocas.

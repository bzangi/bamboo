# Tasks: Desfazer coerente com o rebalanceamento

**Input**: Design documents from `/specs/005-desfazer-vs-rebalanceamento/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md

**Tests**: o plano pede TDD do reducer puro (`swaps.ts`) — testes NÃO opcionais para ele (Princípio IV). O glue de UI (timer/render do snackbar, condição de render) é verificado por type-check + run manual (sem RTL — ver Complexity Tracking do plano), não por teste automatizado.

**Escopo**: tudo em `apps/mobile`. Sem mudança em `apps/api`, `packages/*` ou banco.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: dar ao `apps/mobile` um runner de teste para o módulo puro (não existia).

- [x] T001 [P] Adicionar Vitest ao `apps/mobile`: incluir devDep `vitest` em `apps/mobile/package.json` (na versão usada no workspace, `^4`), adicionar script `"test": "vitest run"`, e criar `apps/mobile/vitest.config.ts` com `test: { environment: 'node', include: ['src/**/*.test.ts'] }`. Critério: `pnpm --filter mobile test` roda (mesmo sem testes ainda) sem erro de config.

**Checkpoint**: runner de teste disponível no app.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: o reducer puro de estado de troca — backbone de todas as stories.

**⚠️ CRITICAL**: nenhuma user story começa antes desta fase.

- [x] T002 Escrever testes que FALHAM em `apps/mobile/src/swaps.test.ts` cobrindo o reducer: (a) `applySwap` com outcome `rebalanceado` produz `adjustments` = `itemId → rótulo` a partir de `refeicoesAfetadas[].itensAjustados[]` (usa `medidaCaseira` quando presente, senão gramas); (b) `applySwap` com `sem-acao`/`recusa-orientada` → `adjustments` vazio mas opção ativa setada; (c) `undoSwap` remove opção + ajustes juntos (depois: `activeOptionId` `undefined` e `flattenAdjustments` sem os itens) — SC-001; (d) re-troca (`applySwap` 2×) deixa só os ajustes da 2ª — FR-006; (e) `flattenAdjustments` une trocas de refeições distintas sem colisão. Critério: `pnpm --filter mobile test` falha por `swaps.ts` inexistente.
- [x] T003 Implementar `apps/mobile/src/swaps.ts`: tipos `ActiveSwap` (`chosenOptionId`, `previousOptionId`, `adjustments`) e `SwapState = Record<mealId, ActiveSwap>`; funções puras `applySwap(state, {mealId, chosenOptionId, previousOptionId, outcome})`, `undoSwap(state, mealId)`, `activeOptionId(state, mealId)`, `flattenAdjustments(state)` — sem I/O, sem mutação, retornam novo estado por spread; tipos de `@bamboo/types` só como import type. Critério: T002 passa (`pnpm --filter mobile test` verde).

**Checkpoint**: lógica de troca pronta e testada; UI pode consumir.

---

## Phase 3: User Story 1 - Desfazer a troca como unidade, sem gap (Priority: P1) 🎯 MVP

**Goal**: itens rebalanceados de outras refeições não têm desfazer por-item; a troca é desfeita inteira (opção + ajustes) re-tocando o chip da opção default.

**Independent Test**: trocar opção que rebalanceia outras → itens ajustados sem "↺ desfazer"; re-tocar o chip default da refeição trocada → dia volta ao pré-troca (quickstart §1, §3).

- [x] T004 [US1] Religar `apps/mobile/src/HomeScreen.tsx` ao estado `swaps`: substituir os states `optionOverrides` + `qtyOverrides` por um único `swaps: SwapState`; em `handleConfirmRebalance` chamar `applySwap` (gravando `previousOptionId = meal.defaultOption.id`); resolver a opção ativa via `activeOptionId(swaps, meal.id)`; computar o mapa de quantidades derivadas via `flattenAdjustments(swaps)` (memo) e passá-lo onde hoje vai `qtyOverrides`; `handleRegistrar` lê `activeOptionId(swaps, mealId)` em vez de `optionOverrides[mealId]`; `resetOverrides` limpa `swaps` (no lugar dos dois mapas). Critério: app compila e o comportamento de troca/exibição segue igual ao atual (sem regressão), agora sobre `swaps`.
- [x] T005 [US1] Em `apps/mobile/src/HomeScreen.tsx` (`ItemRow`), mudar a condição do botão "↺ desfazer" por-item de `nameOverride || qtyOverride` para **`nameOverride`** apenas (FR-001/FR-002); manter a linha de nutrição escondida quando há `qtyOverride` (quantidade ajustada). Critério: item rebalanceado (só `qtyOverride`) não mostra desfazer; item substituído/combinado (`nameOverride`) mostra.
- [x] T006 [US1] Em `apps/mobile/src/HomeScreen.tsx`, adicionar `handleUndoSwap(mealId)` (usa `undoSwap`) e passá-lo a `MealCard` como `onUndoSwap`; no chip de opção, quando há troca ativa (`activeOptionId(swaps, meal.id)` definido) e o chip tocado é o `meal.defaultOption.id`, chamar `onUndoSwap(meal.id)` em vez de `onChooseOption` (FR-005). Critério: com troca ativa, tocar o chip default desfaz opção + ajustes juntos; tocar outra opção não-default segue abrindo a prévia (re-troca).

**Checkpoint**: bug fechado e sempre reversível pelo chip — MVP funcional.

---

## Phase 4: User Story 2 - Botão temporário "Desfazer" (Priority: P2)

**Goal**: atalho de 1 toque para desfazer a troca, visível ~5s após confirmar.

**Independent Test**: confirmar troca → "↺ Desfazer" aparece; tocar dentro de ~5s reverte tudo; sem toque, some em ~5s (quickstart §2).

- [x] T007 [P] [US2] Criar `apps/mobile/src/UndoSwapToast.tsx`: snackbar posicionado no rodapé (View absoluto), props `{ visible: boolean; optionLabel: string; onUndo: () => void }`, com rótulo curto (ex.: "Trocado para {optionLabel}") e um `Pressable` "↺ Desfazer". Sem timer próprio (o pai controla o ciclo de vida). Critério: componente isolado, sem dependência de estado global.
- [x] T008 [US2] Em `apps/mobile/src/HomeScreen.tsx`, adicionar `swapToast: { mealId, optionLabel } | null`; setá-lo (objeto novo) em `handleConfirmRebalance` junto do `applySwap`; `useEffect` keyed em `swapToast` que agenda `setTimeout(…, 5000)` para limpar e faz `clearTimeout` no cleanup (reinicia em nova troca, limpa no unmount — US2 cenário 4); renderizar `UndoSwapToast`; "Desfazer" → `handleUndoSwap(swapToast.mealId)` + limpar o toast. Critério: snackbar aparece ~5s, reverte ao tocar, some sozinho; nova troca reinicia a janela.

**Checkpoint**: US1 + US2 funcionando; desfazer imediato e durável.

---

## Phase 5: User Story 3 - Desfazer por-item preservado para mudança direta (Priority: P3)

**Goal**: substituir/combinar um item mantém o desfazer daquele item (guarda de regressão).

**Independent Test**: substituir/combinar um item → "↺ desfazer" presente; tocar reverte só ele, sem mexer em outras refeições (quickstart §5).

- [X] T009 [US3] Verificar (leitura + run manual, quickstart §5) que após T005 o desfazer por-item permanece para itens com `nameOverride` (substituição/combinação) e reverte apenas aquele item via `handleReset`, sem afetar outras refeições; confirmar que `handleReset`/`nameOverrides`/`consumoOverrides` não foram alterados por T004–T006. Critério: SC-004 (100% dos itens diretamente alterados mantêm o desfazer); sem regressão.

**Checkpoint**: todas as stories funcionais e independentes.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T010 [P] Gate de "done": `pnpm --filter mobile test` (10/10 verde), `pnpm --filter mobile exec tsc --noEmit` (app tipa, exit 0), `pnpm format` (Prettier aplicado) e `pnpm lint` (0 erros; 84 warnings pré-existentes no `api`; mobile não tem task de lint). OK.
- [ ] T011 Smoke manual end-to-end conforme `quickstart.md` §1–6 (sem gap; snackbar ~5s; chip durável; re-troca sem fantasma; desfazer direto preservado; desfazer do registro intacto). **PENDENTE — requer simulador/emulador + API/Postgres semeados; não executável no ambiente atual. Deixado para o Bruno.**
- [ ] T012 [P] Atualizar `docs/estado-atual.md` e a seção SPECKIT do `CLAUDE.md` para refletir 005 implementada e testada (o que mudou no mobile, contagem de testes, "sem API/core/migration").

---

## Dependencies & Execution Order

- **Setup (T001)**: sem dependências.
- **Foundational (T002→T003)**: depende de T001; T003 depende de T002 (TDD: teste falha primeiro). BLOQUEIA todas as stories.
- **US1 (T004→T005→T006)**: depende de T003. Os três editam `HomeScreen.tsx` → sequenciais (sem [P] entre si).
- **US2 (T007, T008)**: depende de T003 + `handleUndoSwap` (T006). T007 (arquivo novo) pode ir em paralelo a US1; T008 depende de T007 e edita `HomeScreen.tsx` (após US1).
- **US3 (T009)**: verificação; depende de T005.
- **Polish (T010–T012)**: depois das stories desejadas.

### Within Each User Story

- Testes do reducer (T002) escritos e FALHANDO antes de T003.
- Reducer (T003) antes do consumo na UI (T004+).

## Parallel Opportunities

- T001 [P] isolado.
- T007 [P] (arquivo novo `UndoSwapToast.tsx`) em paralelo às edições de US1 em `HomeScreen.tsx`.
- T010 e T012 [P] (verificação vs. docs) ao final.
- Edições em `HomeScreen.tsx` (T004, T005, T006, T008) NÃO são paralelas entre si (mesmo arquivo).

## Implementation Strategy

### MVP First (US1)

1. T001 (setup) → T002/T003 (reducer TDD) → T004/T005/T006 (US1).
2. **PARAR e VALIDAR**: bug fechado, dia sempre reversível pelo chip. Demo possível.

### Incremental

1. Setup + Foundational → base pronta.
2. - US1 → testar → MVP (sem gap + chip durável).
3. - US2 → snackbar temporário.
4. - US3 → guarda de regressão do desfazer direto.

## Notes

- Commit após cada task ou grupo lógico (cadência das features anteriores).
- Mobile não tem harness de componente: timer/render do snackbar validados em T011 (manual), lógica de valor em T002/T003 (Vitest).

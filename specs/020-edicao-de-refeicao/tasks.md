# Tasks: Edição de refeição em lote

**Input**: `specs/020-edicao-de-refeicao/` (spec.md, plan.md, research.md D1–D9, data-model.md,
contracts/option-choice-items.md)

**Ordem de execução ≠ ordem de prioridade**: por D9, o backend (US2) roda ANTES do mobile (US1) —
há sessão paralela ativa na árvore do mobile; todo task de mobile re-lê o arquivo imediatamente
antes de editar. TDD em tudo que tem lógica: RED visto antes do verde.

## Phase 1: Setup

Nenhum scaffold novo — monorepo, Vitest e `buildScenario` (013) já existem.

## Phase 2: Foundational — backend da prévia (executa primeiro, D9)

- [x] **T001 [P]** e2e RED em `apps/api/test/edicao-refeicao.e2e-spec.ts`, self-contained via
      `buildScenario` (2 refeições flexíveis + 1 travada; alvo calibrado): (a) overlay equivalente →
      `sem-acao`; (b) overlay que estoura a faixa → `rebalanceado` com alavancas SEM o gatilho e SEM
      refeição registrada, e consumo real da registrada no total; (c) demais refeições registradas →
      `recusa-orientada`; (d) validações — `quantityGrams ≤ 0`/não-numérico/`items: []` → 400,
      `itemId` fora da opção → 404, `foodId` inexistente → 404, item travado no overlay → 422;
      (e) combinação: 2 entradas do mesmo `itemId` somam; (f) 0 escritas (contagens de
      `meal_event`/`meal_event_item` antes/depois). Gate: suíte falha (endpoint ignora `items`).
- [x] **T002** `items?: ReadonlyArray<{itemId; foodId; quantityGrams}>` em `OptionChoiceRequest`
      (`packages/types/src/rebalance.ts`), doc de contrato no JSDoc. Gate: `check-types` verde.
- [x] **T003** `apps/api/src/rebalance/rebalance.service.ts`: validação estrutural do overlay
      (padrão `registro.service`), pertencimento à opção escolhida (404), foods carregados por id
      (404 se faltar), item travado/sem grupo → 422, aplicação do overlay na montagem do
      `diaComEscolha` (gatilho: entradas do overlay substituem o item planejado; sem entrada →
      planejado). `ponytail:` grupo não re-validado (D4). `packages/core` INTOCADO. Gate: T001 verde.
- [x] **T004** Prova de compatibilidade: `rebalance.e2e-spec.ts` e demais suítes da api verdes com
      `git diff` vazio nos `*.e2e-spec.ts` pré-existentes; `git diff` vazio em `packages/core`.
- [x] **T005 [P]** `packages/api-client/src/rebalance.ts` aceita `items` (pass-through) + teste; NOTA da execução: nenhum código mudou no client — o corpo já é `OptionChoiceRequest` inteiro (pass-through por tipo); teste de pass-through seria testar `JSON.stringify`, dispensado;
      descrição no `@ApiOperation` (padrão 014 — sem requestBody modelado); OpenAPI regenerado.

**Checkpoint**: prévia de edição funciona por curl (quickstart §API) — mobile ainda intocado.

## Phase 3: US1 — modo de edição no app (P1) 🎯 MVP

**Goal**: trocar vários itens de uma vez e registrar "Feito" → "troquei" com a composição editada.

**Independent Test**: editar 2 itens, confirmar, ver a nova composição, "Feito" grava troquei.

- [x] **T006 [P] [US1]** `apps/mobile/src/edits.test.ts` RED: `applyEdit` captura `previous` dos
      overrides correntes; `undoEdit` restaura (repõe/remove) e descarta ajustes; re-editar substitui
      (last-edit-wins); `flattenEditAdjustments` agrega rótulos por item. Gate: falha sem `edits.ts`.
- [x] **T007 [US1]** `apps/mobile/src/edits.ts` (reducer puro, padrão `swaps.ts`). Gate: T006 verde.
- [x] **T008 [US1]** `apps/mobile/src/MealEditSheet.tsx` (arquivo NOVO — sem conflito com a sessão
      paralela): lista itens da opção ativa partindo da composição exibida (FR-010); item flexível
      abre `SubstitutionSheet` como picker aninhado; travado desabilitado; à vontade troca 1:1 (só
      nome, D7); pendências locais ao sheet; rodapé "Ver impacto" (desabilitado sem troca) +
      "Cancelar" (descarta). Gate: `tsc` do mobile verde.
- [x] **T009 [US1]** `apps/mobile/src/HomeScreen.tsx` (**re-ler o arquivo imediatamente antes** —
      sessão paralela): ação "editar refeição" quando `!meal.registro` e há item `substitutable`;
      estado `edits`; confirmar aplica `nameOverrides`/`consumoOverrides` + guarda `previous`; toast
      de desfazer atômico (padrão `UndoSwapToast`); troca de tipo-de-dia reseta `edits`
      (`resetOverrides`). Gate: fluxo completo no código; testes mobile verdes.
- [x] **T010 [P] [US1]** Colateral D7 (pré-existente): verificar que trocar item à vontade hoje
      põe `quantityGrams: 0` no consumo e quebraria o "Feito" com 400; se confirmado, guarda no
      `handleSubstitute`/`montarConsumo` (+ teste em `consumo.test.ts`). Se não confirmar, registrar
      o achado como não-bug na task.

**Checkpoint**: US1 completa — edição em lote aplicável e registrável (prévia entra na Phase 4).

## Phase 4: US2 — prévia de impacto no app (P2)

**Goal**: submeter mostra sem-impacto/ajustes/recusa antes de aplicar; confirmar é um ato só.

**Independent Test**: edição que estoura a faixa → prévia lista ajustes; confirmar aplica tudo;
recusa não aplica nada; falha de rede preserva a edição.

- [x] **T011 [US2]** `apps/mobile/src/RebalancePreviewSheet.tsx` (**re-ler antes** — sessão
      paralela): prop opcional com os itens editados entrando no corpo do `postOptionChoice`; textos
      da prévia adequados ao caso de edição (sem mudar os da troca de opção); `MealEditSheet` submete
      → prévia → `onConfirm` aplica trocas + ajustes num ato (T009), recusa/fechar não aplica; falha
      de rede: mensagem não bloqueante, edição preservada. Gate: cenários da US2 exercitados nos
      testes de reducer/formatadores + `tsc` verde.

## Phase 5: US3 — convivência + Polish

- [x] **T012 [US3]** Regressão: suítes existentes do mobile e da api verdes SEM mudança de
      expectativa (troca avulsa, combinação, troca de opção, feito/pulei/desfazer); entrar no modo de
      edição partindo de troca avulsa reflete a troca (coberto no teste do reducer/sheet).
- [x] **T013** Done geral: `pnpm lint` + `pnpm format` + `check-types` na raiz; OpenAPI
      regenerado; bloco SPECKIT do CLAUDE.md atualizado (020 implementada); smoke manual no simulador
      designado ao Bruno (julgamento de UX: timing de toast, gestos).

## Dependencies

- T001 → T003 → T004; T002 → T003; T005 após T002 (paralelo a T003/T004).
- T006 → T007 → T009; T008 paralelo a T006/T007 (arquivo novo); T009 → T011; T010 paralelo.
- Phase 2 inteira antes de qualquer edição em arquivo quente do mobile (D9).

## Implementation Strategy

MVP = Phase 2 + Phase 3 (US1): edição em lote com prévia disponível por API e aplicação local.
Phase 4 liga a prévia na UI. Cada checkpoint deixa a árvore verde e committável (commits diretos
na main, padrão do repo).

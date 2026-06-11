# Tasks: Coerência da troca de tipo-de-dia após consumo (009)

**Branch**: `009-sinal-rebalanceamento` | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

Test-first (Princípio IV). 0 core, 0 migration. Caminhos relativos à raiz do repo (no worktree).

## Phase 1 — Setup

- [ ] T001 Instalar deps no worktree e garantir baseline verde antes de codar: `pnpm install` na raiz; rodar `pnpm vitest run` em `packages/core` e `apps/api/test/today-daytype.e2e-spec.ts` (DB `bamboo-postgres` up) e `pnpm vitest run` em `apps/mobile`. Registrar contagem baseline.

## Phase 2 — Foundational (bloqueia US1/US2)

- [ ] T002 [P] Adicionar campo aditivo `readonly rebalanceado: boolean;` em `MealDto` (`packages/types/src/today.ts`), com doc "refeição teve grama recalculada pela reconciliação; default false". Refletir no modelo Swagger em `apps/api/src/docs/swagger.models.ts`.
- [ ] T003 Estender assinatura pura do mapper para receber `registroPorPosition?: ReadonlyMap<number, RegistrationStatus>` ao lado de `ajuste`, e default `rebalanceado: false` em `toMealDto` (`apps/api/src/plan/today.mapper.ts`). Refatorar `plan.service.getToday` (`apps/api/src/plan/plan.service.ts`) para ler o consumo **uma vez** e expor TANTO o mapa `ajuste` QUANTO `registroPorPosition` (derivado de `carregarConsumoDoDia.porMeal`), passando ambos a `toTodayResponse`. Critério: os 7 e2e de `today-daytype` seguem verdes (INV-3/INV-4), `rebalanceado:false` em tudo por ora.

## Phase 3 — US1 (P1): badge da refeição registrada pareado por posição

**Goal**: refeição registrada aparece registrada (feito/troquei/pulei) na mesma posição do novo tipo-de-dia.
**Independent test**: registrar pos P num tipo; trocar; o slot pos P do novo tipo mostra o mesmo estado.

- [ ] T004 [P] [US1] Teste unitário FALHANDO do mapeamento puro registro-por-posição em `apps/api/src/plan/today.mapper.test.ts`: dado `registroPorPosition`, `meal.registro` reflete o estado por posição; sem o mapa, mantém `estadoVigente` por mealId.
- [ ] T005 [US1] Implementar registro-por-posição em `toMealDto` (`apps/api/src/plan/today.mapper.ts`): quando `registroPorPosition` presente, `registro = registroPorPosition.get(position) ?? null`; senão, comportamento atual. Função pura. Fazer T004 passar.
- [ ] T006 [US1] Em `plan.service.getToday` (`apps/api/src/plan/plan.service.ts`): passar `registroPorPosition` **só com override ativo** (`dayTypeId` presente); sem override, `undefined` (preserva Q1 da 004).
- [ ] T007 [US1] e2e em `apps/api/test/today-daytype.e2e-spec.ts`: registrar café (pos 1) do tipo original como `feito` → `GET /today?dayTypeId=<outro>` → café do novo tipo vem `registro:{state:'feito'}`. Repetir `pulei` e `troquei`. Edge: posição sem par → sem badge (FR-004).
- [ ] T008 [US1] Mobile `apps/mobile/src/HomeScreen.tsx` (MealCard): badge **display-only** quando override ativo (`dayTypeId` setado) — suprimir as ações de desfazer/corrigir (pulei↔feito) do badge sob override (D3). Sem override: inalterado.

## Phase 4 — US2 (P1): sinal "ajustado" na troca de tipo-de-dia

**Goal**: refeições reconciliadas mostram sinal com frase de porquê, sem número.
**Independent test**: após consumo + troca, as refeições com grama ≠ planejado mostram o sinal.

- [ ] T009 [P] [US2] Teste unitário FALHANDO da derivação `rebalanceado` em `apps/api/src/plan/today.mapper.test.ts`: `true` sse algum item da opção default está no mapa `ajuste`; `false` sem mapa.
- [ ] T010 [US2] Implementar `rebalanceado` em `toMealDto` (`apps/api/src/plan/today.mapper.ts`): `options.find(isDefault).items.some(it => ajuste?.has(it.id)) ?? false`. Pura. Fazer T009 passar.
- [ ] T011 [US2] e2e em `today-daytype`: após `feito` + troca, almoço/jantar `rebalanceado:true`, café (registrada) `rebalanceado:false` (INV-1); refeições inalteradas `false`; `quantityGrams` idênticas ao baseline pré-feature (INV-4).
- [ ] T012 [P] [US2] Seletor puro novo `apps/mobile/src/meal-signal.ts` `deveSinalizar(meal, swaps)` (ramo servidor: `meal.rebalanceado === true`) + Vitest `apps/mobile/src/meal-signal.test.ts`.
- [ ] T013 [US2] Mobile `apps/mobile/src/HomeScreen.tsx` (MealCard): renderizar o sinal "ajustado" (frase de porquê, ex.: "Ajustei o resto do dia porque você já comeu"; **sem** número/percentual; persistente) quando `deveSinalizar` for true. Não exibir na registrada.

## Phase 5 — US3 (P2): precisão (só onde houve ajuste)

**Goal**: sinal exclusivamente nas reconciliadas; registrada e inalteradas não.
**Independent test**: conjunto sinalizado == conjunto com grama ≠ planejado; registrada fora dele.

- [ ] T014 [US3] e2e dedicado em `today-daytype` (INV-2/INV-3): sem override → `rebalanceado:false` em tudo + `registro` por mealId; com override → só reconciliadas `true`, registrada `false` com badge. (Sem nova implementação além de US1/US2; é guarda de regressão.)

## Phase 6 — US4 (P3): mesmo sinal na troca de opção

**Goal**: reconciliação por troca de opção mostra o mesmo sinal; desfazer remove.
**Independent test**: trocar opção → outras refeições sinalizam; desfazer (005) → some.

- [ ] T015 [P] [US4] Estender `deveSinalizar` (`apps/mobile/src/meal-signal.ts`) com o ramo `swaps`: refeição é alvo de ajustes do `swaps` vigente → sinaliza. Atualizar Vitest `apps/mobile/src/meal-signal.test.ts`.
- [ ] T016 [US4] Mobile: usar o seletor no render (mesmo componente de sinal do T013) para o caminho de troca de opção; confirmar que desfazer a troca (estado `swaps` zera) remove o sinal. Smoke manual.

## Phase 7 — Polish & verificação

- [ ] T017 `pnpm lint` + `pnpm format` na raiz; `tsc --noEmit` em `apps/api`; verificação de tipos do mobile (`pnpm build` antes, conforme convenção). Tudo limpo.
- [ ] T018 Rodar suítes completas: `packages/core` (deve seguir igual — 0 core), `apps/api` e2e + unit, `apps/mobile` Vitest. Regenerar OpenAPI se aplicável. Validar o `quickstart.md`.
- [ ] T019 Atualizar o bloco SPECKIT do `CLAUDE.md` com o resultado final (contagens de teste, commits). Smoke manual da UI (badge display-only + sinal) — registrar como pendente se exigir simulador.

## Dependencies

- T001 → (T002, T003) → US1 (T004–T008) e US2 (T009–T013).
- US2 depende de T002/T003 (campo + plumbing). US1 depende de T003 (plumbing do `registroPorPosition`).
- US3 (T014) depende de US1 + US2.
- US4 (T015–T016) depende de T012 (seletor existente).
- T017–T019 por último.

## Parallel opportunities

- T002 [P] (types/swagger) paralelo ao começo.
- T004 [P] e T009 [P] (testes unitários do mapper) podem ser escritos juntos (mesmo arquivo de teste — coordenar para evitar conflito de edição).
- T012 [P] / T015 [P] (seletor do app) independentes da casca.

## MVP

US1 + US2 (ambas P1) = o quadro coerente: a refeição comida aparece registrada **e** o resto do dia mostra que se ajustou. US3 é guarda; US4 estende ao segundo gatilho.

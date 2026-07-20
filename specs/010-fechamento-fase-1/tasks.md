# Tasks: Fechamento da Fase 1 — nutrição da alternativa na substituição

**Input**: specs/010-fechamento-fase-1/ (spec.md, plan.md, research.md D1–D9, data-model.md, contracts/, quickstart.md)
**Gates**: aprovados em 2026-07-20 (D1 = sim, sob gate; reconciliação ratificada).
**Disciplina**: test-first (vermelho observado antes de implementar); done-gate de toda task = `pnpm lint` + `pnpm format` verdes.

## Phase 1: Setup

- [x] T001 Subir ambiente de verificação: Postgres (`docker compose up -d`), seed (`node --env-file=.env --import tsx packages/db/scripts/seed.ts`), baseline das suítes atuais verde (`pnpm --filter @bamboo/core test`, `pnpm --filter api test:e2e`, `pnpm --filter mobile test`) — registrar contagens de baseline.

## Phase 2: User Story 1 — Nutrição da alternativa sob gate (P1)

**Goal**: `GET /meal-items/:id/substitutions` devolve `nutrition` opcional por alternativa, nível a nível igual ao `/today`; sheet exibe.
**Independent test**: e2e do gate (4 níveis) + conferência visual no app (quickstart).

- [x] T002 [US1] e2e RED em `apps/api/test/substitutions.e2e-spec.ts`: describe novo "US1-010 nutrição da alternativa sob gate" — `full_kcal` → `nutrition` completo e coerente com `gramas` (kcal+macros+pcts, 1 casa); `macros` → sem `kcal`; `percent` → só `*Pct`; `hidden` → campo AUSENTE; ordem/gramas/medidaCaseira inalterados. Muda `patient.exposure` por UPDATE e **restaura no `afterAll`** (lição a2894f3/KI-001). Rodar e **ver falhar**.
- [x] T003 [P] [US1] Types em `packages/types/src`: criar `nutrition.ts` com `NutritionDto` (movido de `today.ts`); `today.ts` importa de `./nutrition.js`; barrel `index.ts` re-exporta; `substitution.ts` ganha `readonly nutrition?: NutritionDto` em `SubstitutionAlternativeDto` (import de `./nutrition.js` — sem ciclo).
- [x] T004 [US1] Service `apps/api/src/substitution/substitution.service.ts`: passo 1 ganha joins `meal_option→meal→plan→patient` e seleciona `exposure`; passa `exposure` + macros do alvo ao montar cada alternativa.
- [x] T005 [US1] Mapper `apps/api/src/substitution/substitution.mapper.ts`: `toAlternativeDto` ganha `nutrition` via `nutritionFor` (import de `../plan/today.mapper`) calculado sobre as gramas equivalentes; ausente quando gate oculta.
- [x] T006 [US1] e2e GREEN: suíte `substitutions.e2e-spec.ts` inteira verde (casos novos + regressão da suíte).
- [x] T007 [P] [US1] OpenAPI: `apps/api/src/docs/swagger.models.ts` — modelo da alternativa ganha `nutrition` opcional (schema igual ao do item do today); regen `pnpm --filter api openapi:gen` e commit do diff.
- [x] T008 [P] [US1] Mobile display: `apps/mobile/src/format.ts` — formatter sobre `NutritionDto` (extrair miolo do `formatNutritionLine`, que passa a delegar); `apps/mobile/src/SubstitutionSheet.tsx` — linha discreta de nutrição sob nome/quantidade quando `alt.nutrition` presente. `pnpm build` + `tsc --noEmit` no mobile.

**Checkpoint US1**: e2e verdes + tsc/lint zero → commit `feat(api,types,mobile): 010 US1`.

## Phase 3: User Story 2 — Hardening de verificação (P2)

**Goal**: montagem do consumo (troquei) testada no app; contrato lista-vazia com e2e explícito.
**Independent test**: suítes novas falham sob regressão.

- [x] T009 [US2] Vitest RED em `apps/mobile/src/consumo.test.ts`: especificar `montarConsumo(activeOption, consumoOverrides, defaultOptionId)` — sem mudança → `undefined`; só substituição → `{chosenOptionId, items:[1 item efetivo]}`; combinação → 2 itens no mesmo `itemId`; opção não-default sem override → `{chosenOptionId}` sem `items`; override de item fora da opção ativa → ignorado. Rodar e **ver falhar**.
- [x] T010 [US2] Extrair `apps/mobile/src/consumo.ts` (função pura, padrão 005/`swaps.ts`) da lógica inline de `apps/mobile/src/HomeScreen.tsx` (handleRegistrar); `HomeScreen` delega (comportamento idêntico). Testes verdes + `tsc --noEmit`.
- [x] T011 [P] [US2] e2e em `apps/api/test/substitutions.e2e-spec.ts`: caso "grupo sem outras alternativas → 200 + `alternatives: []`" (cenário sem efeito colateral em outras suítes).

**Checkpoint US2**: mobile + e2e verdes → commit `test(mobile,api): 010 US2`.

## Phase 4: User Story 3 — Fase 1 formalmente encerrada (P3)

**Goal**: board/docs refletem a realidade; smoke da 005 executado ou registrado como pendência explícita.

- [x] T012 [US3] Notion (board Backlog & Roadmap): fechar BAM-38, BAM-55, BAM-56, BAM-57 com comentário-justificativa ("obsoleto — persistência via registro troquei, 003/D3b; handoff §8; ver specs/010") e BAM-40 ("sem objeto — app já consome os 5 endpoints reais; estado local é design da 005 FR-008"); BAM-39 → status refletindo a 010 (Concluído ao final da implementação, com referência).
- [x] T013 [US3] Docs: `docs/estado-atual.md` (Fase 1 concluída; 010 entregue; baselines novas) + bloco SPECKIT do `CLAUDE.md` (010 implementada e testada).
- [x] T014 [US3] Smoke manual da 005: executar o roteiro do `specs/010-fechamento-fase-1/quickstart.md` (7 itens, requer simulador + `pnpm mobile:dev`) e preencher a coluna Resultado; sem simulador disponível na sessão → registrar como pendência explícita designada ao Bruno (FR-009).

## Phase 5: Polish

- [x] T015 Regressão completa + done-gate: `pnpm --filter @bamboo/core test` · `pnpm --filter api test:e2e` · `pnpm --filter mobile test` · `pnpm lint` · `pnpm format` · check-types; comparar com baseline do T001 (zero regressão — SC-003); commit final e push.

## Notas pra execução (descobertas na sessão de planejamento, 2026-07-20)

Uma execução parcial de T001–T003 foi feita e **descartada** (handoff limpo). O que ela aprendeu:

- **T001 verificado nesta data**: docker/seed ok; baselines **core 138 · api e2e 113 (12 arquivos) · mobile 19** — todas verdes.
- **T002**: o describe novo deve ir **ANINHADO** dentro do describe existente de
  `substitutions.e2e-spec.ts` — o `afterAll` dele chama `pool.end()`, então um segundo
  describe top-level no mesmo arquivo quebra (pool fechado antes do beforeAll seguinte).
  RED confirmado nesse formato: 3 casos falham (full_kcal/macros/percent), hidden e FR-004
  passam trivialmente hoje (viram guarda de regressão).
- **Cadeia do join (T004)**: `meal_item → meal_option → meal → day_type → plan → patient`
  — a refeição pendura no **tipo-de-dia**, não direto no plano (data-model.md simplificou).
- **T003**: mover `NutritionDto` exige ajustar também o import de
  `packages/types/src/combination.ts` (hoje importa de `./today.js`).
- **T005**: `nutritionFor` já é exportado (`apps/api/src/plan/today.mapper.ts:106`);
  `FoodRow = {id, name, kcalPer100g, carbPer100g, proteinPer100g, fatPer100g}`. Semântica
  exata dos níveis: `kcal` = `Math.round` (**inteiro**), macros com **1 casa**, `*Pct`
  **inteiros** (proporção da massa carb+protein+fat) — os asserts do e2e devem refletir isso
  (tolerância ~1 kcal na coerência com gramas arredondadas).

## Dependencies

- US1 (T002–T008) e US2 (T009–T011) independentes entre si; T003∥T002; T007/T008 após T005.
- US3 (T012–T014) após US1+US2 verdes (docs/board declaram estado final).
- T015 fecha tudo.

## Implementation Strategy

MVP = US1 (valor visível). US2 na sequência (mesma sessão). US3 por último — reconciliação só com código verde. Commits por checkpoint na `main` (padrão do repo), Co-Authored-By conforme padrão.

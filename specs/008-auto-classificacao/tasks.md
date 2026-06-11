# Tasks: Auto-classificação de alimentos em grupos de substituição

**Input**: Design documents from `specs/008-auto-classificacao/` (plan.md, research.md D1–D9, data-model.md, contracts/, quickstart.md)

**Prerequisites**: plan aprovado pelo dono ("manda ver" + opção 3 do gate de granularidade, Sessão 2026-06-10). **TDD não-negociável**: teste antes, vê o vermelho, implementa.

**Organization**: por user story (US1–US3 da spec), com Setup + Foundational na frente.

## Path Conventions

Monorepo pnpm: núcleo em `packages/core/src/`, schema/migrations/scripts em `packages/db/`, e2e em `apps/api/test/`. Sem rota HTTP nova; sem mudança em `apps/mobile`.

---

## Phase 1: Setup

**Purpose**: migration 0004 (colunas) + esqueleto dos ~7 grupos canônicos

- [x] T001 Schema + migration: adicionar `food.taco_id` (integer, **unique**, nullable), `food.taco_category` (text, nullable) e `food_substitution_group.origin` (text, not null, **default `'manual'`**) a `packages/db/src/schema.ts`; gerar `packages/db/migrations/0004_*.sql` via drizzle-kit e aplicar no banco local. Confirmar que os vínculos existentes ficam `origin='manual'` pelo default.

---

## Phase 2: Foundational (bloqueia as user stories)

**Purpose**: a regra pura de classificação (core, TDD)

- [x] T002 **[TDD — escrever e VER FALHAR]** `packages/core/src/classificacao.test.ts` cobrindo `contracts/core-classificacao.md`: dados incompletos → `dados-incompletos`; categoria fora da taxonomia (Bebidas/Miscelâneas/preparados/industrializados/desconhecida) → `categoria-fora-da-taxonomia`; categoria mapeada com basis < 1 g/100 g → `nutriente-base-insuficiente`; porção derivada (âncora ÷ basis/100, arredondada a 5, mín 5) fora de [10,600] → `porcao-implausivel`; **split de Verduras** (carb≥10 → Amidos; <10 → Vegetais via `carbMinPer100g`); vínculo ok com `referencePortionGrams>0`; **fallback sem categoria** (macro dominante + perfil mais próximo); pureza/determinismo; `validarGabarito` (acerto/divergências, sem-grupo = erro)
- [x] T003 Implementar `packages/core/src/classificacao.ts` (`classificarAlimento`, `validarGabarito`, tipos `GrupoCanonico`/`GuardasClassificacao`/`Classificacao`) até T002 verde; exportar em `packages/core/src/index.ts`; `pnpm --filter @bamboo/core test` verde (baseline 120 + novos) e `check-types` limpo
- [x] T004 Definir o conjunto canônico compartilhado em `packages/db/src/groups.ts` (NOVO): os ~7 grupos (nome, basis, categoriasFonte, carbMinPer100g do Amidos=10, âncora-fallback) + o mapa legado→canônico (Carboidratos→Amidos e cereais, Proteínas→Proteínas, Frutas→Frutas, Vegetais→Vegetais) — fonte única consumida por seed e classify-foods; exportar em `packages/db/src/index.ts`

**Checkpoint**: regra testada + taxonomia canônica declarada

---

## Phase 3: User Story 1 — A base pré-classificada destrava a troca (P1) 🎯 MVP

**Goal**: a base ampliada classificada por categoria→grupo; itens flexíveis ganham mais opções de troca

**Independent Test**: rodar ingestão ampliada + seed + classify; conferir que alimentos antes sem vínculo ganham grupo + porção válida, e que um item flexível lista os novos como substitutos

- [x] T005 [US1] Ampliar `packages/db/scripts/ingest-taco.ts` (D5): ingerir TODAS as linhas do dataset com os 4 macros completos, upsert por `taco_id`, gravar `taco_category`; backfill de `taco_id`/`taco_category` nos 23 curados (por nome via CURATED); relatar excluídos por dados incompletos. Modo curado offline preservado (sem taco_id). Idempotente/FK-safe.
- [x] T006 [US1] Refatorar `packages/db/scripts/seed.ts` NÃO-DESTRUTIVO (D7): (a) `clearPlanTables` deixa de deletar `substitutionGroup`/`foodSubstitutionGroup` e passa a deletar `cyclePlanVigencia`/`cycle` antes de `patient` (corrige FK latente da 007); (b) upsert dos ~7 grupos de `@bamboo/db` groups (rename dos 4 antigos por id; novos criados); (c) vínculos curados via upsert por (food, group) com `origin='manual'`. Re-seed preserva vínculos `auto`/`manual`.
- [x] T007 [US1] `packages/db/scripts/classify-foods.ts` (NOVO, D8): carrega grupos canônicos (+ âncora = mediana da curadoria por grupo, fallback da tabela) e foods **sem vínculo** com dados completos; chama `classificarAlimento` (core) por alimento; insere `food_substitution_group` `origin='auto'` com a porção derivada; imprime **relatório de cobertura** (classificados por grupo / sem-grupo por motivo / grupos vazios / % cobertura). `--dry-run` não escreve.
- [x] T008 [US1] **[TDD — e2e]** Em `apps/api/test/substitutions.e2e-spec.ts`: após rodar a classificação no setup (ou inserir um vínculo `auto` direto), um item flexível de grupo Amidos lista alimentos auto-classificados como substitutos, com quantidade recalculada — sem mudança na mecânica. Rodar ingest+seed+classify e validar cobertura ≥ 80% (smoke) no quickstart

**Checkpoint**: MVP — base classificada, mais opções de troca, mecânica intacta

---

## Phase 4: User Story 2 — A correção humana vence, sempre (P2)

**Goal**: `origin` em todo vínculo; correção manual prevalece e nunca é sobrescrita por re-execução

**Independent Test**: mover um alimento auto pra outro grupo marcando `manual`; re-rodar classify; vínculo intacto

- [x] T009 [US2] **[TDD — escrever e VER FALHAR]** Teste de integração do script em `packages/db/scripts/classify-foods.test.ts` (Vitest com banco; seed antes) — ou caso no e2e: re-execução sobre base inalterada → 0 mudanças (idempotência, FR-010); vínculo `manual` movido → preservado após re-classificar (FR-008); só alimentos sem-vínculo são classificados (FR-011)
- [x] T010 [US2] Garantir no `classify-foods.ts` o filtro "só sem-vínculo" e o respeito a `origin='manual'` (idempotência/preservação) até T009 verde; `--validar-gabarito` implementado (classifica às cegas os `manual`, compara via `validarGabarito` do core, imprime acerto + divergências, **exit 1 se < 90%**)

**Checkpoint**: classificação clinicamente segura (humano dispõe)

---

## Phase 5: User Story 3 — Re-execução incremental + relatório de cobertura (P3)

**Goal**: re-execução incremental segura + relatório que mostra o que precisa de decisão

**Independent Test**: rodar 2×; adicionar alimento novo; re-rodar; só o novo classificado; relatório reflete o estado

- [x] T011 [US3] Fechar o relatório de cobertura (FR-012/SC-001): garantir que classificados + sem-grupo-com-motivo = 100% dos com-dados-completos; grupos vazios listados; rodar `--validar-gabarito` real contra o seed e **confirmar ≥ 90%** (esperado ~100% pelo alinhamento amido/proteína/fruta/vegetal); registrar o número obtido

**Checkpoint**: fundação de cobertura + gatilho de reversão verificados

---

## Phase 6: Polish & Cross-Cutting

- [x] T012 Validação manual do `quickstart.md` (migrate 0004 → ingest ampliado → seed → classify → --validar-gabarito); conferir os invariantes (idempotência, manual vence, re-seed seguro, mais opções no /substitutions)
- [x] T013 Atualizar `CLAUDE.md` (bloco SPECKIT — 008 implementada) + `docs/estado-atual.md` (migration 0004; base ampliada; ~7 grupos; cobertura/gabarito obtidos; `food.source`/`taco_id` no modelo)
- [x] T014 Done-gate: `pnpm --filter @bamboo/core test` (120+novos) · `pnpm --filter api test:e2e` (95+caso novo, seed antes) · `pnpm --filter api build` · `pnpm --filter @bamboo/db build` · `pnpm lint` · `pnpm format` — tudo verde; commits na main por fase (Setup/Foundational → US1 → US2 → US3 → polish) + push

---

## Dependencies & Execution Order

- **Setup** (T001) → **Foundational** (T002 → T003; T004 ∥ após T001) → US1 (T005 → T006 → T007 → T008) → US2 (T009 → T010) → US3 (T011) → Polish.
- T004 (groups canônicos) é consumido por T006 (seed) e T007 (classify) — vem antes deles.
- A ampliação da ingestão (T005) deve rodar antes do seed/classify pra a base existir.
- e2e: a suíte de substituições roda a classificação no próprio setup (ou insere vínculo `auto`) — não depende de estado de outras suítes; cleanup do que criar.

## Implementation Strategy

MVP = Phases 1–3 (US1: base classificada + mais opções). Incrementos: US2 (manual vence + gabarito), US3 (incremental + cobertura), Polish. Verificação adversarial no fim: suítes REAIS + baselines (120 core / 95 e2e) + novos, `--validar-gabarito` ≥ 90% (registrar o número), lint/format/build verdes antes do done.

---
description: "Task list — feature 001-alca-do-paciente"
---

# Tasks: Alça do paciente — ver "o agora" e substituir

**Input**: Design documents from `specs/001-alca-do-paciente/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Pela Constituição (Princípio IV — TDD não-negociável), toda regra de negócio em `packages/core` tem teste escrito **ANTES** da implementação (Vitest, sem banco) — para essas, testes **não são opcionais**. Para a casca (`apps/api`), incluímos testes de integração test-first dos endpoints (recomendado). UI (`apps/mobile`) é validada via quickstart/device.

**Organization**: tarefas agrupadas por user story para implementação e teste independentes.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência pendente).
- **[Story]**: US1 / US2 (só nas fases de user story).
- Caminhos de arquivo explícitos em cada tarefa.

## Mapeamento com o roadmap T0–T8

| Legado                      | Vira      | Fase             |
| --------------------------- | --------- | ---------------- |
| T0 scaffold                 | T001      | Setup (✅ feito) |
| T1 docker                   | T002      | Setup (✅ feito) |
| T4 core (substituir)        | T003–T007 | Foundational     |
| T2 db (schema/migration)    | T008–T010 | Foundational     |
| T3 ingestão TACO            | T011–T012 | Foundational     |
| T6 seed                     | T013–T014 | Foundational     |
| T5a + api-client + T7 Home  | T015–T019 | US1              |
| T5b + api-client + T8 troca | T020–T024 | US2              |

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: monorepo + Postgres. **Concluído no Bloco 1.**

- [x] T001 (T0) Scaffold do monorepo `@bamboo/*` (apps/{api,web,mobile} + packages/{core,db,types,api-client}, turbo, pnpm-workspace) — verificado: `pnpm install` + `turbo build` verdes, apps sobem.
- [x] T002 (T1) Postgres no Docker em `docker-compose.yml` + `.env.example` — verificado: `docker compose ps` healthy, `SELECT` ok.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: o núcleo de domínio (`packages/core`), o banco (`packages/db`), a base TACO e o seed. **⚠️ Bloqueia US1 e US2.**

**Paralelismo**: o bloco core (T003–T007) e o bloco db (T008–T010) são independentes e rodam em paralelo. TACO (T011–T012) depende do db; seed (T013–T014) depende de db + TACO.

### Núcleo puro — `packages/core` (T4, test-first)

- [x] T003 [P] Implementar `Result<T,E>` + `ok`/`err` em `packages/core/src/result.ts` (substitui o placeholder).
- [x] T004 [P] **TEST-FIRST**: escrever `packages/core/src/substitution.test.ts` (Vitest) cobrindo: troca normal (`ok`), arredondamento para medida caseira, alvo com nutriente-base zero (`err: nutriente-base-zero`), alvo fora do grupo (`err: fora-do-grupo`), preservação do nutriente-base ≤ 2%. Os testes DEVEM FALHAR antes da implementação.
- [x] T005 Implementar `substituir()` + `SubstitutionError` em `packages/core/src/substitution.ts` conforme `contracts/core-substituir.md`, até T004 passar (depende de T003, T004).
- [x] T006 [P] **TEST-FIRST** + impl do cálculo nutricional por porção em `packages/core/src/nutrition.ts` (+ `nutrition.test.ts`): dado food (macros/100g) e gramas, retorna kcal/macros; apoia o gate de exposição da US1.
- [x] T007 Re-exports do núcleo em `packages/core/src/index.ts` (`result`, `substitution`, `nutrition`) (depende de T005, T006).

### Banco — `packages/db` (T2)

- [x] T008 [P] Migrar o schema de `docs/schema.ts` para `packages/db/schema.ts` e **adicionar o campo `meal.horario`** (tipo `time` nullable — decisão da T2 conforme data-model.md).
- [x] T009 Configurar `packages/db/drizzle.config.ts` (aponta `DATABASE_URL`), `packages/db/client.ts` (`export const db`) e scripts `db:generate`/`db:migrate` no `packages/db/package.json` (depende de T008).
- [x] T010 Gerar e aplicar a migration inicial (`drizzle-kit generate` + `migrate`); validar que as tabelas existem (psql/studio) (depende de T009; usa o Postgres do T002).

### Ingestão TACO — `packages/db/scripts` (T3)

- [x] T011 Implementar `packages/db/scripts/ingest-taco.ts`: mapear colunas da TACO → `food` (kcal/carb/protein/fat/fiber por 100g) e medidas caseiras → `food_household_measure`; caminho do arquivo configurável por env; sourcing via conversão pública JSON/CSV da TACO ou arquivo fornecido (depende de T010).
- [x] T012 Rodar a ingestão e validar: `food` count > 0 com medidas caseiras; spot-check de 3–4 alimentos confere com a tabela (depende de T011).

### Seed — `packages/db/scripts` (T6)

- [x] T013 Implementar `packages/db/scripts/seed.ts`: 1 nutri, 1 paciente; grupos `Carboidratos` (basis=carb) e `Proteínas` (basis=protein); associar foods da TACO aos grupos com `reference_portion_grams`; 1 plano com tipos-de-dia (treino, descanso), `day_schedule` da semana, refeições (com `horario` informativo em algumas), `meal_option` (incl. um almoço com 2–3 opções), `meal_item` com mix travado/flexível; garantir ≥ 1 item flexível com substitutos no grupo (depende de T010, T012).
- [x] T014 Rodar o seed e validar: existe ≥ 1 item flexível com substitutos; o plano é consultável (depende de T013).

**Checkpoint**: núcleo testado, banco migrado, TACO ingerida, plano semeado → US1 e US2 podem começar (em paralelo).

---

## Phase 3: User Story 1 — Ver "o agora" (Priority: P1) 🎯 MVP

**Goal**: o paciente abre o app e vê a refeição do momento + o tipo-de-dia anunciado + a lista do dia, respeitando o gate de exposição.

**Independent Test**: com o plano semeado, abrir o app e confirmar tipo-de-dia anunciado, refeição do momento (1ª refeição no v0) e lista do dia, sem navegar; números nutricionais conforme `exposure`.

- [x] T015 [P] [US1] DTOs de `/today` em `packages/types/src/today.ts` (`TodayResponse`, `MealDto`, `MealOptionDto`, `MealItemDto`, `NutritionDto`) conforme `contracts/get-today.md`.
- [x] T016 [US1] **TEST-FIRST**: teste de integração de `GET /patients/:id/today` em `apps/api/test/today.e2e-spec.ts` (seed → request → assertivas: dayType.label, meals ordenadas, currentMealId = 1ª refeição, exposição aplicada). Deve falhar antes da impl (depende de T014, T015).
- [x] T017 [US1] (T5a) Implementar `GET /patients/:id/today` em `apps/api/src/plan/` (controller + service casca): resolve `day_type` pelo weekday via `day_schedule`, carrega refeições → opção default → itens, aplica `@bamboo/core` (nutrition) + gate de exposição, monta **DTO puro**, marca `currentMealId` = 1ª refeição; até T016 passar (depende de T006, T010, T015).
- [x] T018 [P] [US1] `getToday()` tipado em `packages/api-client/src/index.ts` usando `@bamboo/types` (depende de T015).
- [x] T019 [US1] (T7) Tela Home "o agora" em `apps/mobile`: auth stub (paciente fixo por env), busca `/today` via `@bamboo/api-client`, mostra tipo-de-dia anunciado ("Hoje: …") + refeição do momento + lista do dia + `horario` quando definido; respeita exposição (depende de T017, T018).

**Checkpoint**: US1 funcional e testável de forma independente — MVP entregável.

---

## Phase 4: User Story 2 — Substituir num toque (Priority: P2)

**Goal**: o paciente troca um item flexível dentro do grupo, vê a quantidade recalculada + medida caseira e a refeição atualiza; item travado não troca.

**Independent Test**: tocar num item flexível e ver alternativas do mesmo grupo com quantidade equivalente + medida caseira; selecionar e ver a refeição atualizar; item travado não abre opção.

- [x] T020 [P] [US2] DTOs de `/substitutions` em `packages/types/src/substitution.ts` (`SubstitutionsResponse`, `AlternativeDto`, `MedidaCaseiraDto`) conforme `contracts/get-substitutions.md`.
- [x] T021 [US2] **TEST-FIRST**: teste de integração de `GET /meal-items/:id/substitutions` em `apps/api/test/substitutions.e2e-spec.ts` (alternativas do mesmo grupo com gramas+medida; alvo nutriente-base-zero excluído; item travado/sem-grupo → não-substituível; grupo sem substitutos → lista vazia 200). Deve falhar antes da impl (depende de T014, T020, T005).
- [x] T022 [US2] (T5b) Implementar `GET /meal-items/:id/substitutions` em `apps/api/src/substitution/` (casca): carrega item + grupo + foods do grupo, chama `substituir()` do `@bamboo/core` por alvo, exclui `err` (nutriente-base-zero), converte `Result`→`HttpException` via `ts-pattern`, monta DTO; até T021 passar (depende de T005, T010, T020).
- [x] T023 [P] [US2] `getSubstitutions()` tipado em `packages/api-client/src/index.ts` (depende de T020).
- [x] T024 [US2] (T8) Bottom-sheet de substituição em `apps/mobile`: tocar item flexível → busca `/substitutions` → mostra alternativas com gramas + medida caseira → seleciona → atualiza a refeição (estado local); item travado não abre opção (depende de T019, T022, T023).

**Checkpoint**: US1 e US2 funcionam de forma independente — a alça que prova a tese.

---

## Phase 5: Polish & Cross-Cutting

- [x] T025 Rodar `quickstart.md` de ponta a ponta e confirmar os critérios (SC-001..SC-007) (depende de T019, T024).
- [x] T026 [P] Cobrir bordas faltantes com testes unitários no `packages/core` (ex.: medida caseira por múltiplos, empates de arredondamento).

---

## Dependencies & Execution Order

### Grafo (T-legado)

```
T0 ─┐
    ├─> T2 ─┬─> T3 ─┐
T1 ─┘       │       ├─> T6 ─┐
T0 ─> T4 ───┴───────┘       │
                            ▼
T2,T4 ─> T5a ─> (api-client) ─> T7 ─┐  (US1)
T2,T4 ─> T5b ─> (api-client) ───────┴─> T8  (US2; T8 depende de T7)
```

### Por fase

- **Setup (Phase 1)**: ✅ concluído.
- **Foundational (Phase 2)**: bloqueia US1/US2. Core (T003–T007) ‖ db (T008–T010); depois TACO (T011–T012); depois seed (T013–T014).
- **US1 (Phase 3)** e **US2 (Phase 4)**: começam após Foundational. Podem ser tocadas em paralelo (no Bloco 3, com git worktrees). T024 (US2 UI) depende de T019 (US1 Home).
- **Polish (Phase 5)**: após US1 + US2.

### Dentro de cada bloco

- Testes test-first onde marcados (core sempre; endpoints recomendados) → DEVEM falhar antes da impl.
- DTOs (`packages/types`) antes do endpoint e do api-client que os usam.
- Endpoint antes da tela que o consome.

---

## Parallel Opportunities

- **Foundational**: T003 [P] / T004 [P] / T006 [P] (core) ‖ T008 [P] (db) — pacotes diferentes.
- **US1**: T015 [P] (DTOs) e T018 [P] (api-client) paralelos entre si; T016/T017/T019 sequenciais.
- **US2**: T020 [P] (DTOs) e T023 [P] (api-client) paralelos; T021/T022/T024 sequenciais.
- **Entre stories**: US1 e US2 em paralelo após o Checkpoint da Foundational (exceto T024 que espera T019).

---

## Implementation Strategy

### MVP First (US1)

1. Foundational completa (núcleo + db + TACO + seed).
2. US1 (T015–T019) → **STOP & VALIDATE**: ver o plano do dia no device.

### Incremental

3. US2 (T020–T024) → validar a troca com recálculo + medida caseira.
4. Polish (T025–T026).

### Parallel (Bloco 3, git worktrees)

- Worktree A: core (T003–T007). Worktree B: db→TACO→seed (T008–T014). Sincroniza no Checkpoint.
- Depois: Worktree US1 (T015–T019) ‖ Worktree US2 (T020–T024), com gates de verificação (testes verdes) antes do merge.

---

## Notes

- `[P]` = arquivos diferentes, sem dependência pendente.
- Verificar testes falhando antes de implementar (core obrigatório).
- Commit após cada tarefa ou grupo lógico.
- A atualização de `docs/plano-implementacao-fase0-fase1.md` para apontar a `specs/001-alca-do-paciente` é passo de housekeeping do Bloco 2 (fora desta lista de implementação).

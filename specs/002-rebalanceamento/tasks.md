---
description: "Task list — feature 002-rebalanceamento"
---

# Tasks: Motor de rebalanceamento — negociar o dia

**Input**: Design documents from `specs/002-rebalanceamento/`

**Prerequisites**: plan.md, spec.md, research.md (D1–D10), data-model.md, contracts/

**Tests**: Pela Constituição (Princípio IV — TDD não-negociável), toda regra de negócio em `packages/core` tem teste escrito **ANTES** da implementação (Vitest, sem banco) — para essas, testes **não são opcionais**. Para a casca (`apps/api`), testes de integração test-first dos endpoints. UI (`apps/mobile`) é validada via quickstart/device.

**Organization**: tarefas agrupadas por user story para implementação e teste independentes. **US1 e US2 são entregues como núcleo + API (testáveis headless); US3 é a camada mobile** que consome tudo — conforme a sequência aprovada no plano (provar o motor antes da tela).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência pendente).
- **[Story]**: US1 / US2 / US3 (só nas fases de user story).
- Caminhos de arquivo explícitos em cada tarefa.

## Mapeamento gatilho → story

| Gatilho / camada                                  | Story | Onde mora                                   |
| ------------------------------------------------- | ----- | ------------------------------------------- |
| P1 — escolher opção desigual + prévia (motor+API) | US1   | `core` (motor) + `api` (POST option-choice) |
| Regra de troca de tipo-de-dia no núcleo (FR-020)  | US1   | `core` (adaptador `previewTrocaTipoDia`)    |
| P2 — combinação 1→2 (motor+API)                   | US2   | `core` (`combinar`) + `api` (POST combine)  |
| P3 — app mobile consome tudo + troca tipo-de-dia  | US3   | `mobile` + `?dayTypeId` no `/today`         |

---

## Phase 1: Setup

**Purpose**: garantir baseline verde antes de começar. Sem novo scaffold (monorepo da Fase 0/1).

- [x] T001 Sanity baseline: `pnpm install`, `pnpm -r build`, `pnpm --filter @bamboo/core test` e e2e da API verdes (estado Fase 0/1) antes de iniciar a Fase 2.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: schema (config 3 níveis), dados semeados e o primitivo nutricional compartilhado. **⚠️ Bloqueia US1, US2 e US3.**

**Paralelismo**: o bloco core (T004) é independente do bloco db (T002–T003, T005–T006).

- [x] T002 [P] Schema: adicionar 4 colunas de config nullable em `packages/db/src/schema.ts` — `nutritionist.default_band_tolerance_pct`, `nutritionist.default_floor_pct`, `patient.band_tolerance_pct`, `patient.floor_pct` (todas `double precision`, nullable), conforme `data-model.md`.
- [x] T003 Gerar e aplicar a migration (`drizzle-kit generate` + `migrate`); validar as colunas no banco (depende de T002).
- [x] T004 [P] **TEST-FIRST**: `Nutrientes` + `somaNutrientes()` em `packages/core/src/nutrition.ts` (+ casos em `nutrition.test.ts`): soma sobre múltiplos itens/refeições; lista vazia → zeros. Reusa `nutrientesDaPorcao`. Testes DEVEM FALHAR antes da impl.
- [x] T005 Estender `packages/db/scripts/seed.ts`: plano com **≥2 tipos-de-dia** (treino/descanso) + `day_schedule`; refeições com **opções desiguais** (almoço leve/pesado); refeições seguintes com mix **flexível + travado** (garantir alavanca); um caso só-travado (pra exercitar `sem-alavanca`); (opcional) semear `patient.*_pct` e `nutritionist.default_*_pct` pra ver a resolução de 3 níveis (depende de T003).
- [x] T006 Rodar o seed e validar: ≥1 refeição com opções desiguais; ≥1 refeição seguinte com item flexível; ≥1 caso só-travado; (se semeado) config legível (depende de T005).

**Checkpoint**: schema migrado + dados semeados + primitivo nutricional → US1/US2 podem começar (em paralelo).

---

## Phase 3: User Story 1 — Escolher outra opção e ver o efeito no resto do dia (Priority: P1) 🎯 MVP

**Goal**: o motor recalcula os macros do dia ao escolher uma opção desigual e devolve a **prévia** das refeições seguintes (ou `sem-acao`, ou `recusa-orientada`), respeitando faixa e piso; exposto por um endpoint testável headless. Inclui a **regra de troca de tipo-de-dia no núcleo** (FR-020).

**Independent Test**: com o plano semeado, `POST /rebalance/option-choice` com uma opção pesada devolve as refeições seguintes reescaladas (kcal de volta à faixa) sem tocar travados; opção leve → aumenta; desvio grande → `recusa-orientada` (200); escolha pequena → `sem-acao`. Verificável por testes do core + e2e, sem a tela.

### Núcleo puro — `packages/core` (test-first)

- [x] T007 [P] [US1] **TEST-FIRST**: `params.ts` — `ParametrosAdaptacao`, `PARAMETROS_SISTEMA` (`{toleranciaPct:10, pisoPct:50}`) e `resolverParametros()` (+ `params.test.ts`): precedência por campo `paciente ?? nutri ?? sistema` (todas as combinações), conforme `contracts/core-parametros.md`.
- [x] T008 [P] [US1] **TEST-FIRST**: `alvoDoDia()` + `avaliarFaixa()` em `packages/core/src/nutrition.ts` (+ testes): alvo = soma das opções default; faixa por nutriente nos dois sentidos; borda (`≤` é dentro); alvo zero → `dentro` (depende de T004).
- [x] T009 [US1] **TEST-FIRST**: primitivo `rebalancearPorKcal()` em `packages/core/src/rebalance.ts` (+ `rebalance.test.ts`) conforme `contracts/core-rebalancear.md`: `sem-acao`; reduzir proporcional respeitando piso; aumentar; transbordo multi-passe; `recusa-orientada(estoura-piso)` (nada abaixo do piso); `recusa-orientada(sem-alavanca)`; kcal-priority (macros residuais reportados). Testes DEVEM FALHAR antes da impl (depende de T004).
- [x] T010 [US1] **TEST-FIRST**: adaptador `previewTrocaOpcao()` em `packages/core/src/rebalance.ts` (+ testes): monta alvo (defaults) + total (com escolha), avalia faixa, calcula `deltaKcal`, seleciona alavancas (`position > trigger`, flexíveis) → `rebalancearPorKcal` (depende de T008, T009).
- [x] T011 [US1] **TEST-FIRST**: adaptador `previewTrocaTipoDia()` em `packages/core/src/rebalance.ts` (+ testes) — regra por total-do-dia (FR-020): `deltaKcal = (consumido + restantePlanejado) − alvoNovo`; `consumido=0` (início do dia) → `sem-acao`; `consumido > alvoNovo+faixa` → recusa. **Engine-level** (sem consumidor no app v0) (depende de T008, T009).
- [x] T012 [US1] Re-exports do núcleo em `packages/core/src/index.ts` (`params`, `rebalance`, e os novos de `nutrition`). ⚠️ `index.ts` também recebe o export da US2 (T021) — linhas diferentes (depende de T007, T010, T011).
- [x] T013 [US1] Exportar `basisPer100g` e `medidaMaisProxima` de `packages/core/src/substitution.ts` (hoje privados) p/ reuso pela combinação (US2) e pela medida caseira do rebalanceamento — pequeno refactor sem mudar comportamento (depende de T001).

### Casca + contrato — `packages/types`, `apps/api`, `packages/api-client`

- [x] T014 [P] [US1] DTOs em `packages/types/src/rebalance.ts` (`RebalanceOutcomeDto` união `sem-acao|rebalanceado|recusa-orientada`, `RefeicaoAfetadaDto`, `ItemAjustadoDto`, `totalDepois?`) conforme `contracts/post-rebalance-option-choice.md`.
- [x] T015 [P] [US1] Estender `MealDto` em `packages/types/src/today.ts` com `options: MealOptionDto[]` (default marcada; mantém `defaultOption`/`otherOptionsCount` por retrocompat) conforme `contracts/get-today-extension.md`.
- [x] T016 [US1] **TEST-FIRST** e2e: `apps/api/test/today-options.e2e-spec.ts` — `/today` traz `meals[].options` (default + não-default), exposição aplicada em todas as opções. Deve falhar antes da impl (depende de T006, T015).
- [x] T017 [US1] Implementar a expansão de opções no `GET /today` em `apps/api/src/plan/` (monta todas as `meal_option` + itens via DTO puro, respeitando exposição), até T016 passar (depende de T016).
- [x] T018 [US1] **TEST-FIRST** e2e: `apps/api/test/rebalance.e2e-spec.ts` — `POST /patients/:id/rebalance/option-choice`: `rebalanceado` (seguintes reescaladas, travados intactos), `sem-acao`, `recusa-orientada` (**200**, não erro), exposição (`hidden` → sem números), 404/422. Deve falhar antes da impl (depende de T006, T014, T012).
- [x] T019 [US1] Implementar módulo `apps/api/src/rebalance/` (controller + service casca): resolve parâmetros lendo config (`resolverParametros`), monta `diaComEscolha`+`refeicoesDefault`, chama `previewTrocaOpcao`, mapeia `RebalanceOutcome`→DTO com exposição; recusa-orientada = 200 (depende de T018, T012, T014).
- [x] T020 [P] [US1] `postOptionChoice()` + `getToday()` (com `options`) tipados em `packages/api-client/src/index.ts` (depende de T014, T015).

**Checkpoint**: US1 funcional e testável headless — **MVP** (o motor que negocia o dia).

---

## Phase 4: User Story 2 — Combinar um alimento em dois (Priority: P2)

**Goal**: trocar 1 item flexível por 2 alvos do mesmo grupo, preservando o nutriente-base (split 50/50 ajustável), com medida caseira — exposto por endpoint testável headless.

**Independent Test**: `POST /meal-items/:id/combine` com 2 alvos do grupo devolve gramas de cada (soma do nutriente-base = original, ≤2%) + medida caseira; split 70/30 recalcula; alvo base-zero/fora-do-grupo → 422; item travado → 422.

- [x] T021 [US2] **TEST-FIRST**: `combinar()` + `CombinacaoError` em `packages/core/src/combination.ts` (+ `combination.test.ts`) conforme `contracts/core-combinar.md`: 50/50, split ajustado, alvo `basisPer100g≤0` → `err(alvo-sem-nutriente-base)`, alvo fora do grupo → `err(fora-do-grupo)`, medida caseira (e null→gramas), preserva base ≤2%. Reusa `basisPer100g`/`medidaMaisProxima` (T013). + export no `index.ts` (depende de T013).
- [x] T022 [P] [US2] DTOs em `packages/types/src/combination.ts` (`partes[2]` com `food`, `gramas`, `medidaCaseira`, `fracao`, `nutrition?`) conforme `contracts/post-combine.md`.
- [x] T023 [US2] **TEST-FIRST** e2e: `apps/api/test/combine.e2e-spec.ts` — `POST /meal-items/:id/combine`: partes corretas + exposição; 422 item travado/sem-grupo, alvo fora-do-grupo, alvo sem nutriente-base; 404 item inexistente. Deve falhar antes da impl (depende de T006, T022, T021).
- [x] T024 [US2] Implementar módulo `apps/api/src/combination/` (controller + service casca): guarda item flexível, carrega alvos + basis do grupo, chama `combinar()`, converte `Result`→`HttpException` via `ts-pattern` (422), monta DTO com exposição (depende de T023, T021, T022).
- [x] T025 [P] [US2] `postCombine()` tipado em `packages/api-client/src/index.ts` (depende de T022).

**Checkpoint**: US1 + US2 funcionam headless de forma independente.

---

## Phase 5: User Story 3 — App do paciente consome o motor (Priority: P3)

**Goal**: o app mobile (cliente fino) põe o motor na mão do paciente: ver/escolher opções + prévia, combinar com slider de split, e trocar o tipo-de-dia (que no v0 só re-exibe o cardápio + re-ancora "o agora").

**Independent Test**: no device, escolher uma opção → ver a prévia (ou recusa orientada) e confirmar; combinar um item em dois com slider; trocar o tipo-de-dia no rótulo → app re-exibe o novo cardápio com "o agora" re-ancorado, sem rebalancear; tudo respeitando exposição.

- [x] T026 [US3] **TEST-FIRST** e2e: `apps/api/test/today-daytype.e2e-spec.ts` — `GET /today?dayTypeId=<id>` re-exibe o tipo-de-dia, re-ancora `currentMealId`, `dayType.label` correto, **sem** números de rebalanceamento; `dayTypeId` fora do plano → 404. Deve falhar antes da impl (depende de T006, T017).
- [x] T027 [US3] Implementar o override `?dayTypeId` (display-only) no `GET /today` em `apps/api/src/plan/` (FR-021/FR-022), até T026 passar (depende de T026).
- [x] T028 [P] [US3] Suporte a `getToday(dayTypeId?)` no `packages/api-client/src/index.ts` (depende de T020).
- [x] T029 [US3] Mobile — seletor de opções + folha de **prévia do rebalanceamento** em `apps/mobile`: lista as opções da refeição, ao escolher chama `postOptionChoice`, mostra a consequência nas refeições seguintes **antes** de confirmar; renderiza `recusa-orientada` como orientação (não erro); exposição `hidden` → mostra ação (gramas/medidas) sem números (depende de T019, T020).
- [x] T030 [US3] Mobile — UI de **combinação** com slider de split em `apps/mobile`: dispara `postCombine`, mostra os 2 alvos (gramas + medida caseira), ajusta proporção, aplica no estado local (depende de T024, T025).
- [x] T031 [US3] Mobile — **troca de tipo-de-dia** no rótulo anunciado em `apps/mobile`: toca → `getToday(dayTypeId)` → re-exibe o cardápio + re-ancora "o agora", **sem** rebalancear (depende de T027, T028, T029).

**Checkpoint**: as três alças na mão do paciente; v0 completo da Fase 2.

---

## Phase 6: Polish & Cross-Cutting

- [x] T032 Rodar `quickstart.md` de ponta a ponta e confirmar SC-001..SC-010 (depende de US1, US2, US3).
- [x] T033 [P] Bordas extras no `packages/core` (testes unitários): transbordo multi-passe até o piso; empates de medida caseira; faixa exatamente na borda; split 0/1 degenerado; resolução de parâmetros com nulls parciais.
- [x] T034 `pnpm lint` + `pnpm format` verdes na raiz (regra de "done"); revisar que nenhuma entidade do Drizzle é serializada crua e que recusa-orientada nunca vira 4xx.

---

## Dependencies & Execution Order

### Grafo

```
T001 ─> (Foundational)
T002 ─> T003 ─> T005 ─> T006
T004 ────────────────────┐ (core compartilhado)
                         ▼
US1: T007[P] T008(←T004) T009(←T004) ─> T010 ─> T012
                                   └──> T011
     T013 ; T014[P] T015[P] ; T016 ─> T017 ; T018 ─> T019 ; T020
US2: T013 ─> T021 ; T022[P] ; T023 ─> T024 ; T025
US3: T017 ─> T026 ─> T027 ; T020 ─> T028 ; (T019,T020)─>T029 ; (T024,T025)─>T030 ; (T027,T028,T029)─>T031
Polish: T032 (←US1,US2,US3) ; T033[P] ; T034
```

### Por fase

- **Setup (T001)**: sem dependências.
- **Foundational (T002–T006)**: bloqueia tudo. Core (T004) ‖ db (T002–T003, T005–T006).
- **US1 (T007–T020)** e **US2 (T021–T025)**: começam após Foundational; **independentes entre si** (arquivos diferentes), podem ir em paralelo. Único toque comum: `packages/core/src/index.ts` (T012 vs T021) e `api-client/src/index.ts` (T020 vs T025) — linhas diferentes, merge trivial.
- **US3 (T026–T031)**: depende de US1 (T017/T019/T020) e US2 (T024/T025) — é o cliente que consome.
- **Polish (T032–T034)**: após as três stories.

### Dentro de cada story

- Testes test-first (core sempre; endpoints e2e) → DEVEM falhar antes da impl.
- DTOs (`packages/types`) antes do endpoint e do api-client.
- Núcleo antes da casca; casca antes da tela.

---

## Parallel Opportunities

- **Foundational**: T004 [P] (core) ‖ T002 [P] (schema).
- **US1**: T007 [P] ‖ T008 [P] (core, arquivos/áreas distintas); T014 [P] ‖ T015 [P] (types); T020 [P] (api-client).
- **US2**: T022 [P] (types) ‖ início do core; T025 [P] (api-client).
- **Entre stories**: US1 ‖ US2 após o Checkpoint da Foundational (worktrees), sincronizando antes da US3.
- **Polish**: T033 [P].

---

## Implementation Strategy

### MVP First (US1)

1. Setup + Foundational (schema + seed + primitivo nutricional).
2. US1 (T007–T020) → **STOP & VALIDATE**: o motor negocia o dia via API (prévia, recusa orientada, faixa, piso) — provável headless.

### Incremental

3. US2 (T021–T025) → combinação 1→2 testável.
4. US3 (T026–T031) → as três alças no app.
5. Polish (T032–T034).

### Parallel (worktrees)

- Worktree A: US1 core+api. Worktree B: US2 core+api. Sincroniza nos `index.ts` compartilhados.
- US3 só depois que US1+US2 estiverem verdes.

---

## Notes

- `[P]` = arquivos diferentes, sem dependência pendente.
- Verificar testes falhando antes de implementar (core obrigatório, Princípio IV).
- **Recusa-orientada é desfecho `ok` → HTTP 200** (D4, "nunca barra") — não mapear pra 4xx.
- Nada de estado de escolha persiste (FR-026); só as 4 colunas de **config** (T002) tocam o schema.
- Commit após cada tarefa ou grupo lógico; `pnpm lint` + `pnpm format` verdes no "done" de cada uma.
- `previewTrocaTipoDia` (T011) é construído e testado no núcleo, mas **sem consumidor no app v0** (FR-021) — acende quando o registro existir.

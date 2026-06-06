---
description: "Task list — Motor de rebalanceamento lê o registro"
---

# Tasks: Motor de rebalanceamento lê o registro

**Input**: `specs/004-motor-le-registro/` (plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md)

**Tests**: TDD NON-NEGOTIABLE (Constituição IV). Núcleo e e2e escritos ANTES e que FALHAM antes de implementar. **Sem migration** (sem schema novo).

**Organization**: por user story (P1→P2→P3). Engine math NÃO muda (`rebalancearPorKcal` já trata os 2 sentidos).

## Format: `[ID] [P?] [Story?] Descrição com caminho`

---

## Phase 1: Setup

- [x] T001 Confirmar DB acessível (`localhost:5434`) + seed roda (`node --env-file=.env --import tsx packages/db/scripts/seed.ts`) + baseline verde (`pnpm --filter @bamboo/core test` = 85; `pnpm --filter api test:e2e` = 45). Sem migration nesta feature.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: núcleo ciente do registro + escrita exata do troquei + helper de consumo. Bloqueia todas as stories.

- [x] T002 [P] **[TDD]** Em `packages/core/src/rebalance.test.ts`, adicionar casos (FALHAM primeiro): (a) refeição com `isRegistered:true` **não vira alavanca** (fica intacta; só não-registradas ajustam); (b) registrada com consumo real **alimenta o totalAtual** (déficit→aumenta restante; excesso→reduz); (c) todas as outras registradas → `recusa-orientada` `sem-alavanca`; (d) gatilho registrado segue excluído por position. (contracts/core-motor.md)
- [x] T003 Implementar no `packages/core/src/rebalance.ts`: `isRegistered: boolean` (obrigatório) em `RefeicaoDia`; filtro de alavancas `r.position !== triggerPosition && !r.isRegistered` em `previewTrocaOpcao`. Atualizar TODOS os literais `RefeicaoDia`: `packages/core/src/rebalance.test.ts`, `packages/core/src/phase2.edge.test.ts` (~L86-87), e `apps/api/src/rebalance/rebalance.service.ts` (placeholder `isRegistered:false` por ora). `pnpm --filter @bamboo/core test` verde (T002 passa; `previewTrocaTipoDia` segue verde). (depende de T002)
- [x] T004 **[TDD]** Escrita exata do troquei (D3b, Fase 3) — **lógica de carga NOVA, não só "mais linhas"**. Atualizar `apps/api/test/registro.e2e-spec.ts` (FALHA primeiro): troquei-por-substituição grava `meal_event_item` = **refeição inteira**; **combinação 1→2** grava 2 linhas no slot combinado; troquei-por-opção-não-default **também** grava todos os itens da opção. Depois, em `apps/api/src/registro/registro.service.ts`: (1) carregar TODOS os `meal_item` da opção cumprida (id, food_id, quantity_grams); (2) **overlay por `itemId`** (remover a linha do plano do itemId trocado e inserir TODAS as entradas de `consumo.items` desse itemId, 1..N); (3) gravar todas as linhas (travados+mantidos+substitutos). Sem migration. `pnpm --filter api test:e2e` verde. (paralelo a T002/T003 — arquivos distintos)
- [x] T005 Criar `apps/api/src/registro-consumo.ts` (helper de casca): carrega `meal_event` por **(patientId, planId, `localToday()`)** — type-agnostic, NÃO restringe `mealId` a um tipo —, reduz por refeição com `estadoVigente` (core), e expõe (a) **consumo real por refeição** (feito = itens da opção cumprida nas gramas planejadas, fallback p/ default/1ª opção se `chosen_meal_option_id` nulo; troquei = soma de `meal_event_item`; pulei = vazio) e (b) **vetor `consumido` agregado**. (depende de T004 para o troquei refletir o snapshot completo)

**Checkpoint**: núcleo verde, troquei grava snapshot completo, helper pronto.

---

## Phase 3: User Story 1 — Não recalcular o que já foi feito (Priority: P1) 🎯

**Goal**: trocar a opção de uma refeição não recalcula refeições já registradas.

**Independent Test**: registrar uma refeição anterior como feito; `POST option-choice` numa posterior → a registrada não aparece nos ajustes e sua grama não muda.

- [x] T006 [P] [US1] **[TDD]** Em `apps/api/test/rebalance.e2e-spec.ts`, casos (FALHAM primeiro): registrar `feito` numa refeição anterior → `POST /patients/:id/rebalance/option-choice` numa posterior → 200 e a refeição registrada **não** está nos `alavancas`/ajustes (SC-001); **desfazer (FR-003)**: feito → option-choice (não-alavanca) → `POST registro {intent:'desfazer'}` → option-choice → a refeição **volta a ser alavanca**; todas as outras registradas → recusa orientada `sem-alavanca` (mensagem por motivo, D10). (contracts/http-motor.md)
- [x] T007 [US1] Em `apps/api/src/rebalance/rebalance.service.ts`: usar o helper (T005) para carregar estado vigente + consumo real; montar `diaComEscolha` com `isRegistered` real e itens reais nas registradas (≠ gatilho); gatilho = opção escolhida; `refeicoesDefault` inalterado; mapear `recusa-orientada.motivo` → mensagem (D10). `pnpm --filter api test:e2e` verde. (depende de T003, T005)

**Checkpoint**: Bug B resolvido — registradas não são recalculadas.

---

## Phase 4: User Story 2 — Total do dia pelo consumo real (Priority: P2)

**Goal**: pulei vira déficit; troquei conta o consumo real; feito conta o planejado.

**Independent Test**: registrar `pulei` → rebalancear → restante sugerido a **aumentar** (déficit), sem furar o piso; `troquei` mais calórico → restante **reduz**.

- [x] T008 [P] [US2] **[TDD]** Em `apps/api/test/rebalance.e2e-spec.ts`, casos (FALHAM primeiro): `pulei` numa refeição → option-choice → restante **aumenta** em direção ao alvo, dentro do piso (SC-002); `troquei` (consumo real ≠ planejado) → total reflete o **real** (soma do snapshot) e restante **reduz** (FR-006); **recusa estoura-piso nos 2 ramos**: déficit grande que não cabe → recusa "hoje ficou abaixo…"; excesso grande → "hoje ficou acima…" (D10); **D9**: feito com `chosen_meal_option_id` nulo (legado/seed) → consumo = opção default (fallback), nunca zero; um caso de **macros mistos** confirmando que SC-004 vale em **kcal** (risco kcal-anchored documentado). A implementação vem do helper na US1; se faltar, ajustar `rebalance.service.ts`. (depende de T007)

**Checkpoint**: o total do dia reflete o que foi realmente consumido.

---

## Phase 5: User Story 3 — Trocar tipo-de-dia recalcula pelo consumido (Priority: P3)

**Goal**: com tipo-de-dia override ativo + consumo, o cardápio do novo tipo vem ajustado, direto na tela.

**Independent Test**: registrar refeições; `GET /today?dayTypeId=<outro>` → cardápio ajustado (≠ planejado); reload com override ativo segue ajustado; tipo padrão não ajusta.

- [x] T009 [P] [US3] **[TDD]** Em `apps/api/test/today-daytype.e2e-spec.ts` (**passa a importar `RegistroModule`** — hoje só `PlanModule` — p/ criar consumo via `POST /registro`), casos (FALHAM primeiro): sem consumo → `GET /today?dayTypeId=<outro>` no planejado; **registrar o café do tipo ORIGINAL** depois trocar → itens flexíveis da opção default do novo tipo com **gramas ajustadas** (≠ planejado), respeitando piso, caindo nos itens do **novo** tipo (por `itemId`); o consumido vem de refeição do tipo original (**type-agnostic**) e o **slot do café NÃO é double-counted** (SC-003); registrar com `?dayTypeId` ativo + recarregar `?dayTypeId=<mesmo>` → segue ajustado; `GET /today` **sem** `dayTypeId` → planejado + badges (padrão não auto-ajusta). (contracts/http-motor.md)
- [x] T010 [US3] Em `apps/api/src/plan/plan.service.ts` (`getToday`): quando há `?dayTypeId` override **e** consumo hoje, computar `consumido` (helper T005, type-agnostic) e chamar `previewTrocaTipoDia` com `refeicoesRestantes` = refeições do novo tipo nos **slots NÃO registrados hoje** (pareado por `position` — **evita double-count**) → `AlavancaAjustada[]`. Em `apps/api/src/plan/today.mapper.ts`: `toTodayResponse(input, ajustePorItem?)` aplica `gramasNovo`/`medidaCaseira` + **recomputa `nutrition`** apenas nos itens flexíveis da **opção default** (casamento por `itemId`). `pnpm --filter api test:e2e` verde. (depende de T005)

**Checkpoint**: Bug A resolvido — trocar tipo-de-dia recalcula pelo consumido.

---

## Phase 6: Polish & Cross-Cutting

- [x] T011 [P] Rodar o cenário do `quickstart.md` ponta a ponta (6 cenários, incl. override-ativo-no-reload e recusa por motivo). Mobile: smoke test manual (nenhuma mudança de código esperada — já renderiza gramas do `/today`/prévia).
- [x] T012 Atualizar `docs/estado-atual.md` (Fase 4 — motor lê o registro) e o bloco SPECKIT do `CLAUDE.md` (status → implementada e testada). **Done-gate**: `pnpm --filter @bamboo/core test` + `pnpm --filter api test:e2e` verdes; `pnpm lint` + `pnpm format` na raiz verdes.

---

## Dependencies & Execution Order

### Cadeia crítica

T002 → T003; T004 → T005; (T003, T005) → T007 → T008; T005 → T010. T009 (teste) antes de T010. Polish (T011/T012) por último.

### Within each story

- e2e/teste (TDD) escrito e FALHANDO antes de implementar.
- Núcleo (T003) e helper (T005) antes da casca dos gatilhos (T007/T010).
- `rebalance.service.ts` é tocado em T003 (placeholder) e T007 (lógica real) — sequencial.

### Parallel Opportunities

- Foundational: **T002** (core test) ‖ **T004** (registro troquei e2e+impl) — arquivos distintos. T003 após T002; T005 após T004.
- Stories: **T006** (e2e US1) ‖ **T009** (e2e US3) — arquivos de teste distintos. T008 depende de T007.

---

## Implementation Strategy

### MVP First (US1)

1. Setup (T001) → Foundational (T002–T005) → **US1 (T006–T007)** → para e valida (Bug B resolvido).

### Incremental

1. Foundational → US1 (não-recalcular-feito) → US2 (consumo real: pulei/troquei) → US3 (troca-tipo-de-dia). Cada uma testável e demoável.
2. Polish (T011–T012): quickstart + docs + done-gate.

---

## Notes

- **Sem migration** — só leitura + a escrita do troquei (snapshot completo, mesma tabela).
- Engine math inalterada; mudança no core = 1 campo (`isRegistered`) + 1 filtro.
- `localToday()` em toda carga de `meal_event` (registro + /today + helper) — coerência de fuso.
- Consumido **type-agnostic** (por paciente+plano+data); NÃO restringir a `mealId` do tipo.
- `isRegistered` obrigatório → atualizar literais em `rebalance.test`, `phase2.edge.test`, `rebalance.service` (T003).
- Rebalanceamento segue **efêmero** (não persiste).

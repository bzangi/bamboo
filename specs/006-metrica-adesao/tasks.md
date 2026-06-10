# Tasks: Métrica de adesão a partir do registro (só-nutri)

**Input**: Design documents from `specs/006-metrica-adesao/` (plan.md, research.md D1–D8, data-model.md, contracts/, quickstart.md)

**Prerequisites**: plan aprovado pelo dono (Sessão 2026-06-10). **TDD não-negociável** (Princípio IV): toda task de teste vem ANTES da implementação e precisa FALHAR primeiro.

**Organization**: por user story (US1–US4 da spec), com Setup + Foundational bloqueantes na frente.

## Path Conventions

Monorepo pnpm: núcleo em `packages/core/src/`, casca em `apps/api/src/`, e2e em `apps/api/test/`. Sem mudança em `apps/mobile`/`packages/api-client` (SC-007).

---

## Phase 1: Setup

**Purpose**: env + esqueleto do módulo (nada de regra ainda)

- [ ] T001 Adicionar `NUTRI_API_KEY` a `.env.example` (comentário: credencial stub da nutri; guard é fail-closed — sem a env, a via da nutri nega tudo) e à `.env` local de dev
- [ ] T002 Criar esqueleto do módulo: `apps/api/src/adesao/adesao.module.ts` (vazio) e registrá-lo em `apps/api/src/app.module.ts`

---

## Phase 2: Foundational (bloqueia todas as user stories)

**Purpose**: a fórmula pura (core, TDD) e o guard — tudo das US depende daqui

- [ ] T003 **[TDD — escrever e VER FALHAR]** Testes do núcleo em `packages/core/src/adesao.test.ts` cobrindo as invariantes do contrato `contracts/core-adesao.md`: saturação (dentro/borda exata ⇒ 100, SC-009) · desvio a partir da borda mais próxima (acima e abaixo) · simetria (SC-003) · clamp em 0 · alvo-zero (D2: 0/0 ⇒ 100; 0/>0 ⇒ 0 sem divisão por zero) · flags por macro = `avaliarFaixa` (kcal nunca em flags) · cobertura (e `refeicoesDoTipo === 0` ⇒ `err entrada-invalida`; tolerância fora de [0,100] ⇒ err) · `mediaAdesao` (média aritmética; `[]` ⇒ `null`) · pureza (entrada não mutada)
- [ ] T004 Implementar `packages/core/src/adesao.ts` (`adesaoDoDia` + `mediaAdesao`, reusando `avaliarFaixa`/`Nutrientes` — nenhuma função existente muda) até T003 verde; exportar em `packages/core/src/index.ts`; `pnpm --filter @bamboo/core test` verde (baseline 90 + novos) e `check-types` limpo
- [ ] T005 Implementar `apps/api/src/adesao/nutri-key.guard.ts` (`CanActivate`: header `x-nutri-key` === `process.env.NUTRI_API_KEY`; env ausente/vazia ⇒ nega; sem match ⇒ `ForbiddenException`) — validado por e2e na US4 (T014)

**Checkpoint**: fórmula testada e guard pronto — user stories destravadas

---

## Phase 3: User Story 1 — A nutri lê a adesão de um dia (P1) 🎯 MVP

**Goal**: `GET /nutri/patients/:id/adesao?from=X&to=X` devolve a adesão de um dia derivada do registro real

**Independent Test**: com plano semeado e registros conhecidos num dia, consultar com `x-nutri-key` e conferir valor/classificação/cobertura contra a definição; sem plano/data futura/sem registro ⇒ `sem-dado`

- [ ] T006 [US1] **[TDD — escrever e VER FALHAR]** e2e `apps/api/test/adesao.e2e-spec.ts` (com `x-nutri-key`; seed antes; `fileParallelism:false`): US1.1 dia todo **feito** ⇒ `com-dado`, `valorPct=100`, `dentroFaixa=true` · US1.2 **pulei** sem compensação (total abaixo da faixa) ⇒ fora de adesão, `valorPct<100` · US1.3 registro corrigido/desfeito ⇒ consulta seguinte reflete (anulação do único registro ⇒ `sem-dado`) · US1.4 sem plano ativo / data futura / anterior ao 1º registro ⇒ `sem-dado` (nunca 0%, nunca erro); paciente inexistente ⇒ 404 · validação: `from>to` ou formato inválido ⇒ 400
- [ ] T007 [P] [US1] Loader batch `apps/api/src/adesao/adesao-consumo.ts`: `carregarConsumoPorPeriodo(db, {patientId, planId, from, to})` → `Map<date, ConsumoDia>` — 4 selects (eventos do range + join meal.position; opções cumpridas dos `feito` com fallback D9; `meal_item` das opções; `meal_event_item` dos `troquei` vigentes), `estadoVigente` (core) por (data, refeição), `dayTypeId` do evento vigente incluído (D5)
- [ ] T008 [US1] `apps/api/src/adesao/adesao.service.ts`: plano ativo do paciente (404 se paciente inexistente; sem plano ativo ⇒ tudo sem-dado) · tolerância via `resolverParametros` (patient/nutritionist) · por data: tipo-de-dia = `dayTypeId` uniforme dos registros vigentes, fallback `day_schedule[weekday]` (D3) · alvo = `alvoDoDia` (opções default do tipo) · pareamento por position p/ cobertura/consumo (D4) · dia futuro/cobertura zero ⇒ sem-dado (D7) · chama `adesaoDoDia`; `Result`→`HttpException` na borda
- [ ] T009 [US1] `apps/api/src/adesao/adesao.controller.ts` (`@Controller('nutri')`, `@UseGuards(NutriKeyGuard)`, `GET patients/:patientId/adesao`) + DTO de query (`class-validator`: `from`/`to` obrigatórios `YYYY-MM-DD`, `from ≤ to`, ≤ 366 dias) + `apps/api/src/adesao/adesao.mapper.ts` (DTO de response puro conforme `contracts/http-adesao.md` — nunca entidade Drizzle); registrar tudo no `adesao.module.ts`
- [ ] T010 [US1] T006 verde (rodar `pnpm --filter api test:e2e` com seed antes); `pnpm --filter api build` limpo

**Checkpoint**: MVP — a nutri lê a adesão de um dia real

---

## Phase 4: User Story 2 — Adequar conta como aderente (P2)

**Goal**: substituições/opções/compensações que fecham na faixa têm a MESMA adesão de um dia "todo feito" — a fórmula nunca pune a identidade do alimento

**Independent Test**: registrar um dia com troquei equivalente dentro do grupo (total na faixa) e conferir adesão idêntica à de um dia todo feito

- [ ] T011 [US2] **[TDD — escrever, ver passar ou corrigir]** e2e em `apps/api/test/adesao.e2e-spec.ts`: US2.1 **troquei** equivalente (desfecho nutricional = planejado) ⇒ adesão **idêntica** ao dia todo feito (SC-002) · US2.2 **opção não-default** cumprida com total na faixa ⇒ aderente · US2.3 **pulei compensado** (total na faixa) ⇒ `valorPct=100` (saturação) · US2.4 **troquei** que estoura a faixa ⇒ fora de adesão (consumo real conta fielmente). Qualquer falha aqui é bug de T007–T009 — corrigir lá (a fórmula do core não muda sem voltar ao contrato)

**Checkpoint**: a tese ("% da intenção cumprida") verificada ponta a ponta

---

## Phase 5: User Story 3 — Série por dia + média do período (P3)

**Goal**: período devolve a série diária ordenada (sem-dado marcado) + média aritmética dos dias com dado (a métrica final)

**Independent Test**: registros em dias distintos (montados direto no banco pelo teste — `logged_date` passado); consultar o período; série + média exatas

- [ ] T012 [US3] **[TDD — escrever e VER FALHAR]** e2e: helper de teste que insere `meal_event`(+`meal_event_item`) com `logged_date` de dias passados direto via `@bamboo/db` · US3.1 série em ordem cronológica, um item por dia, sem-dado explícito (nunca 0%) · US3.2 período inteiro anterior ao 1º registro ⇒ série toda sem-dado e `media: null` · US3.3 média = média aritmética EXATA só dos com-dado (SC-010) · dia com tipos-de-dia **divergentes** nos registros ⇒ fallback no default da programação (edge da spec)
- [ ] T013 [US3] Fechar a série no service/mapper (iterar [from..to] dia a dia, `mediaAdesao` do core pros com-dado) até T012 verde

**Checkpoint**: a matéria-prima da "linha dos 80%" existe

---

## Phase 6: User Story 4 — O paciente nunca vê (P4)

**Goal**: invariante negativo verificado: a métrica é inalcançável e invisível pros fluxos do paciente

**Independent Test**: exercitar fluxos do paciente e a via da nutri sem credencial; nenhuma adesão aparece, acesso negado

- [ ] T014 [US4] **[TDD — escrever e VER FALHAR onde aplicável]** e2e: `GET /nutri/...` **sem** header ⇒ 403 (a chamada "com identidade de paciente" — SC-008) · header **errado** ⇒ 403 · US4.1/4.2: `GET /patients/:id/today` (incl. `exposure` máximo) e respostas de registro/substituição/rebalance **sem nenhum campo de adesão** (asserção de chaves) · FR-009: estado do banco idêntico antes/depois da consulta de adesão (count de `meal_event`)
- [ ] T015 [US4] Ajustes que T014 revelar (esperado: nenhum — o guard e o isolamento do módulo já garantem)

**Checkpoint**: LGPD/exposição verificadas — SC-005/007/008

---

## Phase 7: Polish & Cross-Cutting

- [ ] T016 Regenerar OpenAPI (`apps/api/src/gen-openapi.ts`) com o endpoint novo documentado (Swagger no controller: header `x-nutri-key`, query, response)
- [ ] T017 Validação manual do `quickstart.md` (API + Postgres locais; curl com e sem chave) e atualização do bloco SPECKIT em `CLAUDE.md` + `docs/estado-atual.md` (006 implementada; novas contagens de teste)
- [ ] T018 Done-gate: `pnpm --filter @bamboo/core test` (90+novos) · `pnpm --filter api test:e2e` (61+novos, seed antes) · `pnpm --filter api build` · `pnpm lint` · `pnpm format` — tudo verde; commits na main por fase (Foundational → US1 → US2 → US3 → US4 → polish)

---

## Dependencies & Execution Order

- **Setup (P1)** → **Foundational (P2)** → US1 → US2 → US3 → US4 → Polish (sequencial; executor solo).
- T003 antes de T004 (TDD); T006 antes de T007–T010; T012 antes de T013; T014 antes de T015.
- T007 é [P] com T006 (arquivos distintos), mas T008/T009 dependem de T007.
- US2 e US4 são majoritariamente **testes** sobre o que US1 construiu — qualquer vermelho corrige na implementação existente, nunca relaxando o teste.

## Implementation Strategy

MVP = Phases 1–3 (US1). Incrementos: US2 (verificação da tese), US3 (série+média), US4 (privacidade), Polish. Verificação adversarial no fim: rodar as suítes REAIS e conferir baselines (90 core / 61 e2e) + novos, lint/format verdes, antes de declarar done.

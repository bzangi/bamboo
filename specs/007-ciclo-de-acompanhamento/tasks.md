# Tasks: Ciclo de acompanhamento como objeto

**Input**: Design documents from `specs/007-ciclo-de-acompanhamento/` (plan.md, research.md D1–D8, data-model.md, contracts/, quickstart.md)

**Prerequisites**: plan aprovado pelo dono ("manda ver", Sessão 2026-06-10). **TDD não-negociável** (Princípio IV): toda task de teste vem ANTES da implementação e precisa FALHAR primeiro.

**Organization**: por user story (US1–US3 da spec), com Setup + Foundational bloqueantes na frente.

## Path Conventions

Monorepo pnpm: núcleo em `packages/core/src/`, schema/migrations em `packages/db/`, casca em `apps/api/src/`, e2e em `apps/api/test/`. Sem mudança em `apps/mobile`/`packages/api-client` (SC-003).

---

## Phase 1: Setup

**Purpose**: guard compartilhado + migration 0003 (sem regra ainda)

- [x] T001 Extrair o guard pra `apps/api/src/nutri/nutri-key.guard.ts` (movido de `adesao/`, comportamento idêntico), atualizar o import em `apps/api/src/adesao/` e confirmar `adesao.e2e-spec.ts` ainda verde (refactor sem mudança de comportamento — D7)
- [x] T002 Schema + migration: adicionar `cycle` e `cyclePlanVigencia` a `packages/db/src/schema.ts` (colunas/regras do data-model.md, incl. **índice único parcial** `cycle(patient_id) WHERE closed_on IS NULL`), gerar `packages/db/migrations/0003_*.sql` via drizzle-kit e aplicar no banco local

---

## Phase 2: Foundational (bloqueia todas as user stories)

**Purpose**: regras puras do ciclo (core, TDD) + esqueleto do módulo

- [x] T003 **[TDD — escrever e VER FALHAR]** Testes do núcleo em `packages/core/src/ciclo.test.ts` cobrindo o contrato `contracts/core-ciclo.md`: `atribuirCiclo` (cobertura inclusiva; aberto cobre dali em diante; dia anterior/lacuna → null; **fronteira fechou-e-reabriu → startedOn mais recente**, empate → createdAtMs; determinismo/ordem irrelevante; pureza) · `decidirAbertura` (duração ≤ 0 ou não-inteira → err; com ativo → fecharAnteriorEm = hoje; sem ativo → null; nunca recusa por já-existe-ativo) · `decidirFechamento` (sem ativo → no-op-orientado; com ativo → fechar hoje; **não olha a duração** — prazo não fecha sozinho)
- [x] T004 Implementar `packages/core/src/ciclo.ts` (`CicloJanela`, `atribuirCiclo`, `decidirAbertura`, `decidirFechamento`) até T003 verde; exportar em `packages/core/src/index.ts`; `pnpm --filter @bamboo/core test` verde (baseline 109 + novos) e `check-types` limpo
- [x] T005 Esqueleto do módulo: `apps/api/src/ciclo/ciclo.module.ts` (importa DbModule) registrado em `apps/api/src/app.module.ts`

**Checkpoint**: regras puras testadas, tabelas existem — user stories destravadas

---

## Phase 3: User Story 1 — Abrir o ciclo na consulta (P1) 🎯 MVP

**Goal**: `POST /nutri/patients/:id/cycles` cria o ciclo ativo com duração obrigatória + vigência inicial = plano ativo

**Independent Test**: abrir um ciclo via via da nutri e conferir (a) ciclo ativo com início/duração/vigência, (b) duração ausente → 400, (c) app do paciente idêntico

- [ ] T006 [US1] **[TDD — escrever e VER FALHAR]** e2e `apps/api/test/ciclo.e2e-spec.ts` (com `x-nutri-key`; dados próprios + cleanup no afterAll — apagar ciclos/vigências criados; hoje dos registros fica intacto): US1.1 abrir com `expectedDurationDays` → 201, `startedOn = hoje`, `closedOn null`, vigência inicial = plano ativo · US1.3 duração ausente/zero/negativa → 400 · paciente sem plano ativo (inserir paciente extra) → 422 · paciente inexistente → 404 · US1.4 `GET /patients/:id/today` idêntico antes/depois (snapshot profundo) e sem nenhuma chave de ciclo (SC-003/SC-006)
- [ ] T007 [P] [US1] `apps/api/src/ciclo/ciclo.mapper.ts` (DTOs puros: ciclo, vigência, linha do tempo, atribuição, no-op orientado — nunca entidade Drizzle)
- [ ] T008 [US1] `apps/api/src/ciclo/ciclo.service.ts` — `abrir(patientId, duracaoDias)`: carrega ciclo ativo + plano ativo (404 paciente; 422 sem plano ativo), `decidirAbertura` (core; err → 400), e num `db.transaction`: fecha o anterior se houver (`closed_on = hoje` + `valid_to = hoje` na vigência corrente dele), insere o ciclo e a vigência inicial; devolve DTO com `fechouAnterior`
- [ ] T009 [US1] `apps/api/src/ciclo/ciclo.controller.ts` (`@Controller('nutri')` + `@UseGuards(NutriKeyGuard)`, `POST patients/:patientId/cycles` + Swagger) registrado no módulo; T006 verde (`pnpm --filter api exec vitest run test/ciclo.e2e-spec.ts` com seed antes)

**Checkpoint**: MVP — o objeto existe, com vigência, invisível ao paciente

---

## Phase 4: User Story 2 — Fechar na reavaliação e abrir o próximo (P2)

**Goal**: fechar delimita a janela sem tocar dado cru; abrir com ativo fecha o anterior; ativar plano grava vigência

**Independent Test**: partindo de ciclo aberto com registros (montados por insert direto em dias passados), fechar e conferir janela + registros intactos + reabertura sem sobreposição

- [ ] T010 [US2] **[TDD — escrever e VER FALHAR]** e2e: US2.1 fechar com ativo → 200, `closedOn = hoje`, vigência corrente fechada; **SC-004**: contagem e conteúdo de `meal_event`/`meal_event_item` idênticos antes/depois · US2.3 fechar sem ativo → 200 `no-op-orientado` (nunca erro destrutivo; fechar 2× idem) · US2.2 reabrir no mesmo dia → anterior auto-fechado, **0 sobreposição** e nunca 2 ativos (`SC-002`: select direto no banco) · **active-plan**: criar 2º plano por insert direto; `POST active-plan` → `is_active` flipado E nova vigência no ciclo aberto (anterior com `valid_to = hoje`); plano de outro paciente → 404; re-ativar o mesmo → 200 no-op; **sem ciclo aberto** → troca acontece e nenhuma vigência é gravada
- [ ] T011 [US2] Implementar no `ciclo.service.ts`: `fechar(patientId)` (decidirFechamento; transação: `closed_on` + `valid_to`) e `ativarPlano(patientId, planId)` (404 plano não-do-paciente; no-op se já ativo; transação: desativa atual + ativa novo + vigência no ciclo aberto se houver — D2); rotas `POST cycles/close` e `POST active-plan` no controller
- [ ] T012 [US2] T010 verde; suíte completa da API ainda verde (regressão 006 + fases anteriores)

**Checkpoint**: ciclo de vida A+C completo; "observa" funcionando

---

## Phase 5: User Story 3 — O ciclo responde por um período (P3)

**Goal**: linha do tempo, detalhe (janela + vigências + registros do período) e atribuição determinística de um dia

**Independent Test**: com dois ciclos consecutivos (montados por insert direto com datas passadas), consultar atribuição dentro/fronteira/fora e o detalhe com registros

- [ ] T013 [US3] **[TDD — escrever e VER FALHAR]** e2e: montar por **insert direto** 2 ciclos passados consecutivos (fronteira compartilhada: `closed_on` do 1º = `started_on` do 2º) + registros em dias de cada janela (padrão da 006: dias passados, cleanup) · US3.1 `GET cycle-do-dia` dentro do 1º → 1º; repetida → idêntica · fronteira → o **2º** (aberto mais recentemente) · US3.2 dia em lacuna/anterior a tudo → `cycleId null` · `GET cycles` → ordem cronológica com vigências · US3.3 `GET cycles/:cycleId` → janela exata + vigências + **registros do período** (estado vigente: anulado não aparece; estados/datas/positions corretos; **nenhuma métrica** no payload) · ciclo de outro paciente → 404 · `date` inválida → 400 · **403 sem chave em TODAS as rotas de ciclo** (FR-013)
- [ ] T014 [US3] Implementar leituras no `ciclo.service.ts`: `linhaDoTempo` (ciclos + vigências, asc), `detalhe` (janela + vigências + registros via `meal_event` da janela com `estadoVigente` do core — D6), `cicloDoDia` (carrega janelas e delega ao `atribuirCiclo` puro); rotas `GET cycles`, `GET cycles/:cycleId`, `GET cycle-do-dia?date=` no controller
- [ ] T015 [US3] T013 verde; suíte completa verde

**Checkpoint**: a fundação que adesão (006) e relatório consomem está completa

---

## Phase 6: Polish & Cross-Cutting

- [ ] T016 Regenerar OpenAPI (`pnpm --filter api openapi:gen`) com as 6 rotas novas documentadas
- [ ] T017 Validação manual do `quickstart.md` (migrar + seed + curls com/sem chave; invariantes da tabela) e atualização de `CLAUDE.md` (bloco SPECKIT) + `docs/estado-atual.md` (007 implementada; migration 0003; novas contagens; tabela `cycle` sai da lista "Adiado")
- [ ] T018 Done-gate: `pnpm --filter @bamboo/core test` (109+novos) · `pnpm --filter api test:e2e` (78+novos, seed antes) · `pnpm --filter api build` · `pnpm lint` · `pnpm format` — tudo verde; commits na main por fase (Setup/Foundational → US1 → US2 → US3 → polish) + push

---

## Dependencies & Execution Order

- **Setup** (T001 ∥ T002) → **Foundational** (T003 → T004; T005 ∥) → US1 (T006 → T007 ∥ T008 → T009) → US2 (T010 → T011 → T012) → US3 (T013 → T014 → T015) → Polish.
- US2/US3 dependem do service/controller criados na US1 (mesmo arquivo — sequencial; executor solo).
- e2e nunca usa registros de HOJE (banco compartilhado com as outras suítes; padrão da 006).

## Implementation Strategy

MVP = Phases 1–3 (US1). Incrementos: US2 (ciclo de vida + observa), US3 (leituras-fundação), Polish. Verificação adversarial no fim: suítes REAIS + baselines (109 core / 78 e2e) + novos, lint/format/build verdes antes de declarar done.

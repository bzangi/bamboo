---
description: "Task list — Registro pendurado na consulta (feito/troquei/pulei)"
---

# Tasks: Registro pendurado na consulta — feito / troquei / pulei

**Input**: `specs/003-registro-consulta/` (plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md)

**Tests**: TDD é NON-NEGOTIABLE (Constituição IV). O núcleo puro (`packages/core`) tem teste ANTES da implementação; cada user story tem e2e (Vitest) escrito ANTES e que FALHA antes de implementar.

**Organization**: por user story (P1→P2→P3), cada uma entregável e testável de forma independente.

## Format: `[ID] [P?] [Story] Descrição com caminho`

- **[P]**: paralelizável (arquivos diferentes, sem dependência pendente).
- **[Story]**: US1/US2/US3.

## Path Conventions (monorepo)

`packages/{db,core,types,api-client}`, `apps/{api,mobile}`. Núcleo puro em `packages/core`; casca em `apps/api`; contratos em `packages/types`.

---

## Phase 1: Setup

**Purpose**: garantir que o ferramental de migration/seed roda neste ambiente antes de mexer no schema.

- [ ] T001 Verificar que `drizzle-kit` e `tsx` executam (com `DATABASE_URL` no `.env` da raiz): rodar `pnpm --filter @bamboo/db db:generate --help` e `node --import tsx --eval ""` sem erro (ver MEMORY sobre build-scripts no sandbox; usar `allowBuilds` se travar no install).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: schema, núcleo puro, tipos e esqueleto da casca — pré-requisitos de TODAS as stories.

**⚠️ CRITICAL**: nenhuma user story começa antes desta fase.

- [ ] T002 [P] Adicionar `pgEnum("meal_event_state", ["feito","troquei","pulei"])` + tabela `mealEvent` (FKs patient/plan/meal/dayType notNull, `chosenMealOptionId` nullable, `state` enum **NULLABLE**, `loggedDate date` notNull, `createdAt` defaultNow) + tabela filha `mealEventItem` (`mealEventId`/`foodId` notNull, `quantityGrams doublePrecision`) + `mealEventRelations`/`mealEventItemRelations`; remover a linha `meal_event / log` do bloco ADIADO em `packages/db/src/schema.ts` (data-model.md).
- [ ] T003 Gerar e aplicar a migration: `pnpm --filter @bamboo/db db:generate` (→ `packages/db/migrations/0002_*.sql` + `_journal.json`) e `pnpm --filter @bamboo/db db:migrate` (depende de T002; NÃO escrever SQL à mão).
- [ ] T004 [P] Em `packages/db/scripts/seed.ts`, adicionar como duas PRIMEIRAS linhas de `clearPlanTables(tx)`: `await tx.execute(sql`DELETE FROM ${mealEventItem}`)` e `await tx.execute(sql`DELETE FROM ${mealEvent}`)` (antes de `meal_item`); importar `mealEvent`/`mealEventItem` (depende de T002).
- [ ] T005 [P] Criar `packages/types/src/registro.ts` (`RegistroIntent`, `RegistroConsumo` com `chosenOptionId?`/`items?`, `RegistroRequest`, `RegistroResponse`) e exportar em `packages/types/src/index.ts` (contracts/http-registro.md).
- [ ] T006 [P] Estender `packages/types/src/today.ts`: `RegistrationStatus = "feito"|"troquei"|"pulei"`; em `MealDto` adicionar `registro: { state: RegistrationStatus } | null` e `isCurrent: boolean`; em `TodayResponse` tornar `currentMealId: string | null` e adicionar `diaConcluido: boolean`.
- [ ] T007 [P] **[TDD]** Escrever `packages/core/src/registro.test.ts` (Vitest) que FALHA, cobrindo: `classificarEstado` (pulei; feito; troquei-por-opção; troquei-por-substituição válida; itens vazio→`consumo-invalido`; `consumo-fora-do-grupo`; gramas ≤ 0→`consumo-invalido`; ordem de guarda grupo-antes-de-gramas; troca-desfeita→feito); `estadoVigente` (vazio→null; maior seq vence; array fora de ordem; tombstone→null; feito→pulei→feito→desfazer→null); `decidirRegistro` (no-op/inserir/desfazer); `derivarOAgora` (1ª não-registrada; ausente do map=não-registrada; refeição esquecida; dia-concluido; lista vazia) — ver contracts/core-registro.md.
- [ ] T008 Implementar `packages/core/src/registro.ts` (tipos + as 4 funções puras: `classificarEstado`/`estadoVigente`/`decidirRegistro`/`derivarOAgora`) até T007 passar; `export * from "./registro.js"` em `packages/core/src/index.ts` (depende de T007; zero I/O/throw/mutação).
- [ ] T009 Scaffold do módulo em `apps/api/src/registro/`: `registro.module.ts` (imports `[DbModule]`), `registro.controller.ts` (`@Controller('patients')`, `@Post(':patientId/registro')` `@HttpCode(200)` `ParseUUIDPipe`), `registro.service.ts` (esqueleto: `@Inject(DB)`, validação de borda `UUID_RE`+enum→`BadRequestException`, ainda sem regra), `registro.mapper.ts`; registrar `RegistroModule` em `apps/api/src/app.module.ts` (depende de T005, T008).

**Checkpoint**: schema migrado, núcleo verde, tipos e módulo prontos — stories podem começar.

---

## Phase 3: User Story 1 — Registrar feito/pulei num toque (Priority: P1) 🎯 MVP

**Goal**: marcar a refeição corrente como feito/pulei num toque; "o agora" avança; estado persiste e reaparece.

**Independent Test**: com plano semeado, POST feito na 1ª refeição → 200, `currentMealId` avança, GET /today reflete `registro.state` e `isCurrent`; reload + reabrir sessão mantêm o estado; registrar a última → `diaConcluido`.

- [ ] T010 [P] [US1] **[TDD]** Criar `apps/api/test/registro.e2e-spec.ts` (Vitest) que FALHA, cobrindo US1: POST feito (sem `consumo`→assume default) avança "o agora"; POST pulei avança; GET /today reflete `registro.state`/`isCurrent`; persistência após reload e após nova consulta (SC-006); registrar a última → `currentMealId=null`+`diaConcluido=true`; 404 paciente sem plano (quickstart passos 1-3, 6, 10, 13).
- [ ] T011 [US1] Implementar o caminho feito/pulei em `apps/api/src/registro/registro.service.ts` dentro de `db.transaction` + `pg_advisory_xact_lock(hash(patientId,mealId,loggedDate))`: resolver plano ativo + `dayTypeId` em vigor + `loggedDate`; **pertencimento** (meal→dayType→plan(isActive)→patient, 404); carregar histórico→`estadoVigente`; `classificarEstado` (consumiu+sem adequação→feito / não-consumiu→pulei); `decidirRegistro`; INSERT `meal_event` (`chosen_meal_option_id` = opção default em feito); `derivarOAgora`; `Result`→`HttpException` via `match().exhaustive()` (depende de T009; contracts/http-registro.md).
- [ ] T012 [US1] Implementar `apps/api/src/registro/registro.mapper.ts` (função pura entidade→`RegistroResponse`: `vigente`, `currentMealId`, `diaConcluido`; sem entidade Drizzle crua, sem número) (depende de T011).
- [ ] T013 [US1] Estender `GET /today`: em `apps/api/src/plan/plan.service.ts` carregar estado vigente do dia (`selectDistinctOn([mealEvent.mealId]).orderBy(asc(mealId),desc(createdAt))` OU carregar+reduzir com `estadoVigente` do core) por (paciente, plano, `loggedDate` de hoje); em `apps/api/src/plan/today.mapper.ts` derivar `currentMealId` via `derivarOAgora` + `registro`/`isCurrent` por refeição + `diaConcluido` (depende de T008, T002).
- [ ] T014 [P] [US1] Atualizar e2e existentes `apps/api/test/today.e2e-spec.ts` / `today-options.e2e-spec.ts` / `today-daytype.e2e-spec.ts` para `currentMealId` nullable + novos campos; atualizar o modelo Swagger em `apps/api/src/docs/swagger.models.ts` (+ `gen-openapi.ts`) com `registro`/`isCurrent`/`diaConcluido` e `currentMealId` nullable (depende de T013).
- [ ] T015 [P] [US1] Em `packages/api-client/src` adicionar método tipado `POST /patients/:id/registro` (RegistroRequest→RegistroResponse) e ajustar os tipos do `getToday` (currentMealId nullable + registro/isCurrent + diaConcluido) (depende de T005, T006).
- [ ] T016 [US1] Mobile `apps/mobile/src/HomeScreen.tsx`: botões **feito**/**pulei** no card de "o agora" (MealCard), badge do estado registrado nas refeições já registradas, estado "dia concluído"; chamar o registro e recarregar o /today; tratar `currentMealId` nullable (depende de T015).

**Checkpoint**: MVP — registrar feito/pulei num toque com "o agora" avançando, ponta a ponta.

---

## Phase 4: User Story 2 — "troquei" derivado da troca existente (Priority: P2)

**Goal**: ao confirmar substituição/combinação/opção-não-default e marcar feito, gravar `troquei` com o consumo efetivo, sem botão extra.

**Independent Test**: POST feito com `items` (within-group, grupos resolvidos no banco) → `vigente.state="troquei"`; POST feito com `chosenOptionId` não-default → `troquei`; food fora do grupo → 422.

- [ ] T017 [P] [US2] **[TDD]** Estender `apps/api/test/registro.e2e-spec.ts` (FALHA primeiro): feito com `items` within-group → `troquei` com `meal_event_item`; feito com `chosenOptionId` não-default → `troquei`; 422 `consumo-fora-do-grupo` (foodId de outro grupo); 422 itens vazio em troquei-por-substituição (quickstart passos 4, 5, 12).
- [ ] T018 [US2] Estender `apps/api/src/registro/registro.service.ts`: resolver `is_default` da `chosenOptionId`; **resolver no banco** `groupIdEsperado` (`meal_item.substitutionGroupId`) e o grupo do food consumido (`food_substitution_group`) reusando os joins de `apps/api/src/substitution/substitution.service.ts`; montar `Adequacao` (opcao-nao-default | substituicao-combinacao); `classificarEstado` (ramos troquei); INSERT das linhas `meal_event_item` + `chosen_meal_option_id` (depende de T011).
- [ ] T019 [US2] Mobile `apps/mobile/src/HomeScreen.tsx`: ao marcar **feito** numa refeição com substituição/combinação/opção-não-default ativa, enviar `consumo { chosenOptionId, items }` (estado de sessão) para o servidor derivar `troquei`; badge "troquei" (depende de T016, T018).

**Checkpoint**: US1 + US2 funcionando — troquei capturado como subproduto.

---

## Phase 5: User Story 3 — Corrigir um toque errado (Priority: P3)

**Goal**: corrigir (pulei↔feito↔troquei-rótulo) e desfazer um registro; última-escrita-vence; idempotência sob reenvio.

**Independent Test**: pulei→feito reflete feito; reenvio idêntico → 0 duplicata observável; desfazer → vigente null e "o agora" volta; desfazer+re-registrar troca diferente → novo troquei.

- [ ] T020 [P] [US3] **[TDD]** Estender `apps/api/test/registro.e2e-spec.ts` (FALHA primeiro): pulei→feito (correção, vigente=feito); reenvio idêntico do mesmo estado → 200, 0 duplicata observável; `intent:"desfazer"` → vigente null + "o agora" re-ancora; desfazer + re-registrar com troca diferente → novo `troquei` (quickstart passos 7, 8, 9).
- [ ] T021 [US3] Estender `apps/api/src/registro/registro.service.ts`: tratar `intent="desfazer"` (INSERT evento com `state=NULL`, tombstone); correção entre estados já decidida por `decidirRegistro`/`estadoVigente` (garantir no-op vs inserir); re-derivar "o agora" após correção/desfazer (depende de T011).
- [ ] T022 [US3] Mobile `apps/mobile/src/HomeScreen.tsx`: afordância de **corrigir**/**desfazer** nas refeições já registradas; ao desfazer, "o agora" re-ancora na refeição (depende de T016, T021).

**Checkpoint**: as 3 stories independentes e funcionando.

---

## Phase 6: Polish & Cross-Cutting

- [ ] T023 [P] Rodar o cenário do `quickstart.md` ponta a ponta (seed → 13 passos) e confirmar cada Success Criteria (SC-001..SC-006).
- [ ] T024 [P] Atualizar `docs/estado-atual.md` (Fase 3 — registro implementado) e o bloco SPECKIT do `CLAUDE.md` (status → implementada e testada).
- [ ] T025 **Done de task** (Constituição IV / CLAUDE.md): `pnpm --filter @bamboo/core test` + `pnpm --filter @bamboo/api test:e2e` verdes; `pnpm lint` + `pnpm format` na raiz verdes.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (P1)**: sem dependências.
- **Foundational (P2)**: depende do Setup; **bloqueia todas as stories**.
- **User Stories (P3-P5)**: dependem da Foundational. US1 é o MVP; US2/US3 estendem o mesmo service (sequenciais por prioridade, mesmo arquivo).
- **Polish (P6)**: depois das stories desejadas.

### Cadeia crítica

T002 → T003/T004; T007 → T008 → T009; (T005,T008) → T009 → T011 → T012; (T008,T002) → T013; T011 → T018 → T019; T011 → T021 → T022.

### Within each story

- e2e (TDD) escrito e FALHANDO antes de implementar.
- Núcleo (T008) antes da casca (T011/T018/T021).
- Service antes do mapper/UI.
- `registro.service.ts` é editado em T011 (US1), T018 (US2), T021 (US3) — **sequencial** (mesmo arquivo), não-paralelo entre stories.

### Parallel Opportunities

- Foundational: **T002, T005, T006, T007** em paralelo (arquivos diferentes); T004 após T002 (paralelo a T003).
- US1: **T010** (e2e) e **T015** (api-client) em paralelo; **T014** após T013.
- Cada bloco **[TDD]** roda isolado antes da implementação da sua story.

---

## Parallel Example: Foundational

```bash
# Em paralelo (arquivos diferentes, sem dependência pendente):
T002 schema (packages/db/src/schema.ts)
T005 tipos registro (packages/types/src/registro.ts)
T006 tipos today (packages/types/src/today.ts)
T007 [TDD] core test (packages/core/src/registro.test.ts)
```

---

## Implementation Strategy

### MVP First (US1)

1. Setup (T001) → Foundational (T002–T009) → **US1 (T010–T016)**.
2. **PARAR e VALIDAR**: registrar feito/pulei, "o agora" avança, persiste. Demo do MVP.

### Incremental

1. Foundational pronta → US1 (MVP) → US2 (troquei) → US3 (correção/desfazer), cada uma testada e demoável sem quebrar a anterior.
2. Polish (T023–T025) fecha com quickstart + lint/format/testes verdes.

---

## Notes

- `[P]` = arquivos diferentes, sem dependência pendente.
- TDD: confirmar que o teste FALHA antes de implementar (núcleo e e2e).
- Commitar após cada task ou grupo lógico (padrão do repo: direto na main).
- **Breaking**: `currentMealId` vira nullable — varrer mobile/api-client/swagger/e2e (T013–T015).
- LGPD: pertencimento na escrita (T011); leitura da nutri é fase posterior.
- `troquei` é sempre DERIVADO (T018) — o cliente nunca envia `state:"troquei"`.

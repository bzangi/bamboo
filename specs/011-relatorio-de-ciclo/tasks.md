# Tasks: Relatório de ciclo

**Input**: Design documents from `specs/011-relatorio-de-ciclo/` (plan.md, research.md D1–D9, data-model.md, contracts/http-relatorio.md, quickstart.md)

**Prerequisites**: gates Specify→Plan e Plan→Tasks aprovados pelo Bruno (2026-07-20), incluindo A1/A2/A3. **TDD não-negociável** (Princípio IV): toda task de teste vem ANTES da implementação e precisa FALHAR primeiro (RED observado).

**Organization**: por user story (US1–US3 da spec), com Setup + Foundational bloqueantes na frente.

## Path Conventions

Monorepo pnpm: núcleo em `packages/core/src/`, DTOs compartilhados em `packages/types/src/`, casca em `apps/api/src/`, e2e em `apps/api/test/`. **Sem migration; sem mudança em `apps/mobile`** (SC-003 — o paciente nunca vê nada disso).

## Decisões de implementação herdadas do plan (não repetir gate)

- **D6/Plano B**: o loader novo (`relatorio.loader.ts`) resolve o tipo-de-dia alvo por dia com a MESMA regra Q3-B da 006 (snapshot uniforme dos registros; senão fallback `day_schedule`), mas **duplicada** ali — `adesao.service.ts` fica intocado (zero risco à suíte da 006). Diferença consciente: o fallback aqui é **vigência-aware** (usa o plano vigente naquele dia, via `cycle_plan_vigencia`, não só o plano ativo hoje) — mais correto pro "padrão de registro" sem violar a régua única da adesão (que segue vindo, sem alteração, de `AdesaoService.serie()`).
- **"Ciclo anterior" (D3)**: `encontrarCicloAnterior` (core) decide com `id/startedOn/closedOn` apenas — não precisa de `createdAt`, então `ciclo.mapper.ts`/`CicloDto` não são tocados. Desempate: `closedOn` desc, depois `startedOn` desc (cobre o caso do edge case do spec; o caso ainda-mais-degenerado de startedOn TAMBÉM empatado não tem consumidor no v0).
- **Janela do ciclo anterior > 366 dias**: tratado como "sem comparativo utilizável" (`comparativo: null`), não como erro — coerente com a filosofia "nunca erro" do spec para o comparativo (FR-006); o teto de 422 (D8) vale só pro ciclo CONSULTADO.
- **Reuso via export Nest**: `AdesaoModule`/`CicloModule` ganham `exports: [...]` do respectivo service (wiring puro, zero mudança de comportamento) pra `RelatorioModule` importar.

---

## Phase 1: Setup

**Purpose**: baseline observável + wiring de reuso entre módulos

- [x] T001 Confirmar baseline pós-010 rodando as suítes completas ANTES de qualquer mudança: `pnpm --filter @bamboo/core test` (138) · `pnpm --filter api test:e2e` (119, com seed) · `pnpm --filter mobile test` (24) — registrar as 3 contagens como ponto de partida da regressão zero (SC-007)
- [x] T002 [P] Adicionar `exports: [AdesaoService]` em `apps/api/src/adesao/adesao.module.ts` e `exports: [CicloService]` em `apps/api/src/ciclo/ciclo.module.ts` (wiring Nest puro — nenhuma lógica tocada); confirmar `adesao.e2e-spec.ts` e `ciclo.e2e-spec.ts` ainda verdes

**Checkpoint**: baseline registrado, serviços da 006/007 importáveis pelo módulo novo

---

## Phase 2: Foundational (bloqueia todas as user stories)

**Purpose**: núcleo puro de agregação (core, TDD) + contrato de DTOs

- [x] T003 **[TDD — escrever e VER FALHAR]** Testes do núcleo em `packages/core/src/relatorio.test.ts`: `fatiarSemanas` (janela múltiplo exato de 7 → todas completas; não-múltiplo → última fatia com `parcial: true` e intervalo real; janela de 1 dia → 1 semana parcial; `fim < início` → `err`) · `agregarAdesao` (mistura com/sem-dado; todos sem-dado → `media`/`coberturaMedia` null; `diasDentroFaixa` só conta com-dado; `flagsFrequencia` só inclui macro/lado com contagem > 0 — macro com tudo zero fica ausente do objeto) · `agregarEstados` (totais + `porRefeicao` por position; `semRegistro` = esperado − vigente; lista de slots vazia → tudo zerado; nome "melhor esforço" quando há empate entre dias) · `encontrarCicloAnterior` (escolhe o `closedOn` mais recente ≤ `startedOnAtual`; desempate por `startedOn` desc; exclui o próprio id; nenhum candidato válido ou lista vazia → `null`) · `compararCiclos` (deltas = atual − anterior quando ambos têm dado; **um dos lados com `media: null` → os 5 campos de delta vêm `null`**, nunca um cálculo parcial)
- [x] T004 Implementar `packages/core/src/relatorio.ts` (tipos `AdesaoAgregada`/`RegistroAgregado`/`SemanaSlice`/`RelatorioError`/`DeltasComparativo` + funções `fatiarSemanas`/`agregarAdesao`/`agregarEstados`/`encontrarCicloAnterior`/`compararCiclos`; reusa `mediaAdesao` de `./adesao.js`, sem duplicar a média) até T003 verde; exportar em `packages/core/src/index.ts`; `pnpm --filter @bamboo/core test` verde (138 + novos) e `check-types` limpo
- [x] T005 [P] DTOs em `packages/types/src/relatorio.ts` (`CycleReportResponse` e sub-DTOs — janela/adesão/registro/semanas/comparativo — conforme `contracts/http-relatorio.md`, campo a campo) + barrel `export * from "./relatorio.js"` em `packages/types/src/index.ts`

**Checkpoint**: agregações puras testadas, contrato de resposta fechado — user stories destravadas

---

## Phase 3: User Story 1 — O retrato do ciclo (adesão + padrão de registro) (P1) 🎯 MVP

**Goal**: `GET /nutri/patients/:patientId/cycles/:cycleId/report` devolve janela + adesão agregada + padrão de registro (totais e por refeição) numa chamada

**Independent Test**: paciente-cenário com ciclo e registros conhecidos → relatório bate com os agregados esperados; ciclo sem registros → relatório válido "sem dado" (nunca erro)

- [x] T006 [US1] **[TDD — escrever e VER FALHAR]** e2e novo `apps/api/test/relatorio.e2e-spec.ts` — **self-contained (D7)**: `beforeAll` cria paciente-cenário PRÓPRIO (nunca o do seed) com plano + ≥1 tipo-de-dia + refeições (`meal`) + opção default + itens referenciando `food` já existente (TACO) + `daySchedule`; `afterAll` apaga TUDO em ordem reversa de FK. Casos desta fase: (a) ciclo fechado com registros feito/troquei/pulei + dias sem registro → janela completa, `adesao` batendo com valores calculados no teste via `@bamboo/core`, `registro.totais`/`porRefeicao` corretos; (b) ciclo **aberto** → `aberto: true`, `janelaEfetiva.to = hoje`; (c) ciclo recém-aberto sem nenhum registro → `200` com adesão sem-dado e contagens zeradas (nunca erro); (d) **consistência (SC-002)**: mesma janela em `GET /nutri/patients/:id/adesao?from&to` e no relatório → `adesao.media` e dias idênticos; (e) `403` sem `x-nutri-key`; (f) `404` ciclo de outro paciente / inexistente; (g) janela efetiva > 366 dias → `422` orientado; (h) **no-write (SC-006)**: contagens de `meal_event`/`cycle`/`cyclePlanVigencia` idênticas antes/depois do GET
- [x] T007 [P] [US1] `apps/api/src/relatorio/relatorio.loader.ts` — `carregarRegistroDaJanela(db, {patientId, from, to, vigencias, hoje})`: 1 query de `meal_event` (plan-agnostic, como `ciclo.service.registrosDaJanela`) + `estadoVigente` (core) por (dia, meal) → registros vigentes; resolve o tipo-de-dia alvo por dia (snapshot uniforme dos registros do dia; senão fallback `day_schedule` do plano vigente naquele dia via `vigencias`); devolve `Map<data, {refeicoesEsperadas: {position,nome}[], vigentesPorPosition: Map<position,EstadoRegistro>}>` (ver decisão D6/Plano B no topo do arquivo)
- [x] T008 [US1] `apps/api/src/relatorio/relatorio.mapper.ts` — funções puras `toCycleReportResponse`/auxiliares que montam `CycleReportResponse` (`packages/types`) a partir da janela do ciclo + dos agregados do core; nunca serializa entidade Drizzle
- [x] T009 [US1] `apps/api/src/relatorio/relatorio.service.ts` — `report(patientId, cycleId)`: `cicloService.detalhe` (404 herdado) → janela efetiva (`closedOn ?? hoje`) → teto de 366 dias (`422 UnprocessableEntity` ANTES de chamar a 006, pra não deixar o `400` interno da adesão escapar) → `adesaoService.serie(patientId, from, to)` (reuso intocado da 006) + `relatorioLoader.carregarRegistroDaJanela` → `agregarAdesao`/`agregarEstados` (core) → `mapper.toCycleReportResponse` (sem `semanas`/`comparativo` ainda — US2/US3 completam)
- [x] T010 [US1] `apps/api/src/relatorio/relatorio.controller.ts` (`@Controller('nutri')` + `@UseGuards(NutriKeyGuard)`, `GET patients/:patientId/cycles/:cycleId/report` + Swagger) e `relatorio.module.ts` (importa `DbModule`+`AdesaoModule`+`CicloModule`) registrado em `apps/api/src/app.module.ts`; T006 (casos desta fase) verde

**Checkpoint**: retrato do ciclo funcional e testável de forma independente

---

## Phase 4: User Story 2 — Evolução semana a semana (P2)

**Goal**: o mesmo relatório traz `semanas[]` (A1 — relativa ao início do ciclo, última fatia parcial marcada)

**Independent Test**: ciclo de 3 semanas com adesões distintas por semana → série reflete cada semana; última semana parcial marcada

- [x] T011 [US2] **[TDD — escrever e VER FALHAR]** Ampliar `relatorio.e2e-spec.ts`: ciclo com padrões diferentes por semana → `semanas` em ordem, cada uma com `from`/`to`/`parcial`/`adesao`/`registro` corretos; janela não-múltiplo de 7 (ou ciclo aberto há N<7 dias) → última semana com intervalo real `parcial: true`; ciclo aberto → série cobre só até hoje (sem semana futura da duração prevista); semana inteira sem registro → aparece na série com adesão sem-dado e estados zerados (não desaparece)
- [x] T012 [US2] `relatorio.service.ts`: computar `semanas` via `fatiarSemanas(from, to)` (core) + para cada fatia, recortar os dias de `serie.days` e os slots do loader pelo intervalo da fatia → `agregarAdesao`/`agregarEstados(...).totais` por semana; acrescentar ao `CycleReportResponse` via mapper
- [x] T013 [US2] T011 verde; suíte completa da API ainda verde (regressão US1 + fases anteriores)

**Checkpoint**: retrato + evolução semanal funcionais

---

## Phase 5: User Story 3 — Comparativo com o ciclo anterior (P3)

**Goal**: quando existe ciclo anterior terminado antes do início do atual, o relatório traz suas métricas + deltas

**Independent Test**: paciente com dois ciclos semeados → comparativo presente com deltas corretos; paciente com um ciclo → comparativo ausente sem erro

- [x] T014 [US3] **[TDD — escrever e VER FALHAR]** Ampliar `relatorio.e2e-spec.ts`: paciente com ciclo anterior fechado + o consultado → `comparativo.cicloAnterior` (janela + agregados) e `comparativo.deltas` corretos (atual − anterior); primeiro ciclo do paciente → `comparativo: null` (sem erro, sem bloco vazio); ciclo anterior sem nenhum dia com dado → métricas do anterior "sem dado" e `deltas` todos `null`; dois ciclos anteriores fechados no mesmo dia → desempate determinístico (o de `startedOn` mais recente)
- [x] T015 [US3] `relatorio.service.ts`: `cicloService.linhaDoTempo(patientId)` → filtra fechados (exclui o atual) → `encontrarCicloAnterior` (core); se achou, `cicloService.detalhe` do anterior (vigências dele) + `adesaoService.serie` + `relatorioLoader` na janela dele → `agregarAdesao`/`agregarEstados` → `compararCiclos` (core) → `Comparativo` no mapper; janela do anterior > 366 dias → trata como `comparativo: null` (decisão documentada no topo do arquivo, não é erro)
- [x] T016 [US3] T014 verde; suíte completa verde

**Checkpoint**: relatório completo (US1 + US2 + US3) — a feature que vende, fechada

---

## Phase 6: Polish & Cross-Cutting

- [x] T017 Regenerar OpenAPI (`pnpm --filter api openapi:gen`) com a rota nova documentada (modelos em `apps/api/src/docs/swagger.models.ts`)
- [x] T018 Validação manual do `quickstart.md` (docker + seed + curls com/sem chave; conferir os 6 pontos de invariante do arquivo)
- [x] T019 Atualizar `docs/estado-atual.md` + bloco SPECKIT do `CLAUDE.md` (011 implementada; EP-5 concluído); fechar BAM-23/EP-5 no board Notion se houver acesso ao MCP — senão registrar como pendência explícita no resumo final
- [x] T020 Done-gate: `pnpm --filter @bamboo/core test` (138+novos) · `pnpm --filter api test:e2e` (119+novos, seed antes) · `pnpm --filter mobile test` (24, sem regressão) · `pnpm --filter api build` · `pnpm lint` · `pnpm format` — tudo verde; commits na main por fase (Setup/Foundational → US1 → US2 → US3 → Polish)

---

## Dependencies & Execution Order

- **Setup** (T001 → T002) → **Foundational** (T003 → T004 ∥ T005) → US1 (T006 → T007 ∥ T008 → T009 → T010) → US2 (T011 → T012 → T013) → US3 (T014 → T015 → T016) → Polish.
- US2/US3 dependem do `relatorio.service.ts`/`relatorio.mapper.ts` criados na US1 (mesmos arquivos — sequencial; executor solo).
- e2e nunca usa o paciente do seed compartilhado (D7) — sem risco de colidir com `ciclo.e2e-spec.ts`.

## Implementation Strategy

MVP = Phases 1–3 (US1). Incrementos: US2 (semanas), US3 (comparativo), Polish. Verificação adversarial no fim: suítes REAIS + baselines (138 core / 119 e2e / 24 mobile) + novos, lint/format/build verdes antes de declarar done.

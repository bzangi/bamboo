# Bamboo — Estado Atual

> **Status:** pré-MVP · **não é greenfield** (fundação + alça do paciente já implementadas e testadas) · RN-first.
> **Atualizado em:** 2026-06-05.

Documento vivo — snapshot do estado real do repositório nesta data, verificado por leitura direta dos arquivos e do histórico git. Em conflito com o cabeçalho do `CLAUDE.md` ("monorepo greenfield, só `.git`"), **este snapshot vence**: o scaffold já foi executado e há código de aplicação funcional commitado.

---

## Estado do repositório

Monorepo **pnpm workspaces + Turborepo**, Node 20+, TypeScript strict. `pnpm@11.5.0` (cravado em `package.json › packageManager`), `turbo ^2.9.16`. Workspaces: `apps/*` + `packages/*`, com `nodeLinker: hoisted` (exigência Expo/Metro em monorepo).

**Apps (três — não dois):**

| App | Stack | Estado |
|---|---|---|
| `apps/api` | NestJS 11 | 2 endpoints (casca fina sobre `@bamboo/core`): `GET /patients/:id/today` (US1), `GET /meal-items/:id/substitutions` (US2). e2e em `test/`. |
| `apps/mobile` | Expo SDK 56 / RN 0.85 / React 19 | `HomeScreen.tsx` (Home "o agora") + `SubstitutionSheet.tsx` (bottom-sheet de substituição), consumindo `@bamboo/api-client`. |
| `apps/web` | Next.js | Só boilerplate `create-turbo` — sem feature (UI da nutri é fase posterior). |

**Packages (seis — não quatro):**

- `packages/core` — o "cérebro", TS puro sem I/O: `result.ts` (`Result`/`ok`/`err`), `nutrition.ts` (`nutrientesDaPorcao`), `substitution.ts` (`substituir()` — preserva nutriente-base, escolhe medida caseira mais próxima, retorna `Result`, nunca lança). **13 testes verdes** (2 arquivos).
- `packages/db` — Drizzle: `src/schema.ts` (12 tabelas), `client.ts`, `query.ts`, `drizzle.config.ts`. Migration `migrations/0000_loud_ulik.sql` gerada e aplicável. Scripts `ingest-taco.ts` (ingestão TACO, idempotente por upsert) + `seed.ts`. **O schema canônico vive aqui** (não mais em `docs/schema.ts`); ganhou o campo `meal.horario`.
- `packages/types` — DTOs compartilhados (`today.ts`, `substitution.ts`).
- `packages/api-client` — client tipado da API (`today.ts`, `substitution.ts`).
- `packages/typescript-config` + `packages/eslint-config` — configs base do `create-turbo` (não listadas no `CLAUDE.md`).

Imports internos sob o scope `@bamboo/*`.

**Infra:** `docker-compose.yml` (Postgres 17-alpine, healthcheck, volume nomeado), `.env.example`, `pnpm-lock.yaml`.

**Git (verificado ao vivo — diverge do "clean / 1 commit" do snapshot do prompt):**

- **15 commits.** Linha do tempo: `5d1b7d8 first commit` → `8ccb826` (adota Spec Kit + ratifica constituição v1.0.0) → `ddbd803` (scaffold T0 + Postgres T1) → `681ddb1`/`34fa5c2`/`f1e7ffd` (spec/plan/tasks da feature 001) → `cb418f2` (foundational: core + db/schema/migration + TACO + seed) → builds/deps → `43d1d6c` (backend US1 `/today` + US2 `/substitutions` + e2e) → `2b614ca` (mobile Home + bottom-sheet) → `b3b5b28` (fix ingest-taco idempotente FK-safe) → `8a322b3` (OpenAPI/Swagger na API + Prettier e regra de lint/format aplicados) = **HEAD**.
- **Working tree limpo** (verificado). A documentação OpenAPI/Swagger da API (`apps/api/src/docs/`, `apps/api/openapi.json`, `apps/api/src/gen-openapi.ts`) — fora do escopo T0–T8 — já foi commitada em `8a322b3`, junto com a aplicação do Prettier e da regra de lint/format no "done".

**Versões instaladas (dos `package.json`):** NestJS `^11`, `@nestjs/swagger ^11.4.4`, `ts-pattern ^5.9.0` · Drizzle ORM `^0.45.2`, drizzle-kit `^0.31.10`, pg `^8.21.0` · Expo `~56.0.8`, RN `0.85.3`, React `19.2.3` · Vitest `^4.1.7`, TypeScript `5.9.2`, Turborepo `^2.9.16`, pnpm `11.5.0`.

---

## Produto & arquitetura

**O que é:** SaaS **B2B2C** para nutricionistas. A nutri paga (assinatura por pool de pacientes); o paciente usa de graça. App mobile (paciente, RN/Expo) construído primeiro — a retenção do paciente segura a da nutri. Web da nutri (Next.js) em fase posterior. Detalhe em [[decisoes-produto]] e [[plano-de-build]].

**Tese central:** o valor não é *ver* o plano (commodity); é **adaptar** à vida real. O paciente **segue + adequa**; plano que dobra sem quebrar mantém adesão. Diferenciar em **autonomia + rebalanceamento + ciclo de acompanhamento**, não na commodity.

**Assinatura de UX:** *"Mostra o certo por padrão, deixa trocar num toque, nunca barra."* Home = "o agora"; tipo-de-dia = default anunciado e trocável; registro pendurado na consulta; faixa-alvo (não teto); rebalanceamento dá **ação**, não número.

**Arquitetura — Functional Core / Imperative Shell (obrigatório):**

- **Núcleo puro** (`packages/core`): função pura, sem I/O, sem `throw`, sem mutação; retorna `Result<T, E>`; erros de domínio = discriminated unions casados com `ts-pattern` (`.exhaustive()`). Roda no servidor **e** no app.
- **Casca** (`apps/api`): I/O (Drizzle, `db.transaction`, locks) e orquestração; **só ela lança `HttpException`**, na borda (costura HTTP **Opção 1**: service converte `Result` → `HttpException` antes de retornar; controllers finos).
- Imutabilidade (`readonly`/`ReadonlyArray`, spread); sem estado mutável em service (providers são singleton); validação em dois níveis (estrutural no DTO via `class-validator` / de negócio no núcleo via `Result`); responses sempre via DTO puro (nunca serializar entidade do Drizzle).
- Libs: `neverthrow` ou `Result` à mão + `ts-pattern`. **Deferido:** `Effect`, `fp-ts`.

Detalhamento do paradigma com exemplos canônicos em `CLAUDE.md`; invariantes governantes em `.specify/memory/constitution.md`.

---

## Processo & governança

**GitHub Spec Kit** adotado e em uso. 10 skills `speckit-*` (specify/plan/tasks/implement + clarify/checklist/analyze/constitution/agent-context-update/taskstoissues). Templates em `.specify/templates/`. `.specify/feature.json` aponta `specs/001-alca-do-paciente`.

**Constituição v1.0.0** (`.specify/memory/constitution.md`, ratificada 2026-05-31) — 6 princípios; em conflito, **a constituição vence**:

| # | Princípio | Status |
|---|---|---|
| I | Adaptar, não apenas mostrar (ver é commodity) | — |
| II | Mostra o certo por padrão, deixa trocar num toque, nunca barra | — |
| III | Functional Core / Imperative Shell | **NON-NEGOTIABLE** |
| IV | Spec-Driven Development (Constitution→Specify→Plan→Tasks→Implement; TDD) | **NON-NEGOTIABLE** |
| V | LGPD desde o dia zero | **NON-NEGOTIABLE** |
| VI | YAGNI / MVP-first (seed-first, RN-first; infra de efeitos deferida) | — |

**Gates de aprovação humana (Bruno):** Specify→Plan e Plan→Tasks só avançam com aprovação explícita. Ambiguidade no Implement → para e pergunta (não inventa regra de negócio).

**Regra de "done":** lint (ESLint) + Prettier passando em toda task (`pnpm lint` + `pnpm format` via Turborepo) antes de concluir.

**LGPD transversal:** dado de saúde sensível desde a Fase 0 (acesso, criptografia, consentimento). Hoje materializado apenas como `FR-016` na spec + o gate de exposição (`exposure_level`) no schema e no `/today`; o endurecimento (criptografia, consentimento, controle de acesso real) ainda está pendente. **Auth real não existe** (v0 = stub, paciente fixo por env).

---

## Roadmap, tarefas & modelo de dados

**A fila de trabalho viva migrou** de [[plano-implementacao-fase0-fase1]] (agora **histórico** — o "porquê" das tasks) para `specs/001-alca-do-paciente/`: `spec.md` (QUE/PORQUÊ) → `plan.md` (COMO) → `tasks.md` (T001–T026), + `research.md`, `data-model.md`, `contracts/`, `quickstart.md`, `checklists/`.

**Roadmap por fases** ([[plano-de-build]]):

| Fase | Conteúdo | Estado |
|---|---|---|
| 0 — Fundação | monorepo, NestJS+Postgres+Drizzle+migrations, schema, ingestão TACO | **Implementada** |
| 1 — O batimento | seed de plano + Home "o agora" + substituir dentro do grupo (recálculo + medida caseira) | **Implementada** |
| 2 — Rebalanceamento | recálculo multi-refeição, gatilhos, piso, prévia antes de confirmar | **Implementada** (`002-rebalanceamento`) |
| 3 — Inteligência da nutri | **registro (feito/troquei/pulei) — implementada e testada** (`003-registro-consulta`); ciclo, adesão, **relatório de ciclo**, UI da nutri (web) — não iniciados | Em andamento |
| 4 — Reduzir fricção | import por IA (PDF→estruturado), offline, notificações, comida fora da lista | Não iniciada |
| 5+ — Negócio | billing, Pix/Stripe, deploy/infra | Não iniciada |

> **Integração `004-motor-le-registro` (rotulada "Fase 4" no `CLAUDE.md`) — implementada e testada:** o motor de rebalanceamento passa a **ler o registro**. Corrigiu 2 bugs: (a) trocar a opção recalculava refeições já feitas; (b) trocar o tipo-de-dia não recalculava pelo consumido. **Sem migration** (lê `meal_event`/`meal_event_item` da Fase 3); a matemática da engine não mudou (D1). Núcleo: `isRegistered` (obrigatório) em `RefeicaoDia` + `previewTrocaOpcao` exclui registradas das alavancas. Casca: novo `apps/api/src/registro-consumo.ts` (consumo real type-agnostic), `rebalance.service` (troca de opção ciente do registro), `getToday` (troca de tipo-de-dia recalcula pelo consumido com `?dayTypeId` override ativo; tipo padrão nunca auto-ajusta — Q1), `registro.service` (troquei grava snapshot COMPLETO em `meal_event_item` — D3b). Rebalanceamento efêmero. `core 90 + e2e 61` verdes.

**T0–T8 — todas implementadas e commitadas** (T0 scaffold · T1 docker · T2 schema/migration · T3 TACO · T4 `substituir()` · T5 endpoints · T6 seed · T7 Home · T8 substituição). Mapeamento legado→Spec Kit em `tasks.md` (T0→T001 … T5b+T8→T020–T024).

> **Discrepância a registrar:** `specs/001-alca-do-paciente/tasks.md` marca como `[X]` apenas T001/T002; T003–T026 seguem `[ ]`. **Os checkboxes estão defasados** — o código e o git provam que T003+ está feito.

**Cobertura de teste (atual):** **90 testes** em `packages/core` (substituição + nutrição + rebalanceamento, incl. `isRegistered`/registro-aware); **61 e2e** em `apps/api` (today, substitutions, rebalance, registro, today-daytype). _(As contagens menores citadas em seções acima são herança da Fase 1 — drift de doc a reconciliar.)_

**Modelo de dados — 12 tabelas (migration `0000_loud_ulik.sql`)**, schema canônico em `packages/db/src/schema.ts` (= [[schema]] + acréscimo de `meal.horario`):

- **Enums:** `exposure_level` (gate de quanto número o paciente vê), `equivalence_basis` (nutriente que a troca preserva).
- **Pessoas:** `nutritionist`, `patient` (com `exposure`).
- **Base TACO:** `food` (macros/100g), `food_household_measure` (medidas caseiras).
- **Grupos:** `substitution_group` (+ `basis`), `food_substitution_group` (carrega `reference_portion_grams` — o que faz a conta de substituição existir).
- **Plano:** `plan` (direto no paciente no v0), `day_type`, `day_schedule` (weekday→tipo-de-dia), `meal` (+ `horario` informativo), `meal_option` (itens penduram aqui — suporta os "3 almoços"), `meal_item` (`is_locked` + `substitution_group_id` = a marcação de flexibilidade).
- **Fase 3 (registro):** `meal_event` + `meal_event_item` (append-only, `state` enum NULLABLE = anulação) — migration `0002_clear_cammi.sql`.
- **Adiado (não existe ainda):** `cycle`, `day_selection`, `adherence`/`cycle_report`, índices/constraints de performance.

---

## Próximos passos

> Os três passos do briefing original tratavam bootstrap e T0–T8 como **pendentes**. Verificação no repo (15 commits, testes verdes) mostra que **já estão concluídos**; ficam aqui reconciliados com o estado real, seguidos do que de fato falta.

**Já concluído (reconciliação factual):**

1. **Bloco 1 — bootstrap do monorepo (T0 + T1 + `apps/web`):** **FEITO** (commit `ddbd803`; `apps/web` é boilerplate `create-turbo`).
2. **Migrar T0–T8 pro Spec Kit (feature `001-alca-do-paciente`):** **MATERIALIZADO** — rodado via Specify → Plan → Tasks com os gates (`spec.md`/`plan.md`/`tasks.md`/`contracts/` commitados em `681ddb1`/`34fa5c2`/`f1e7ffd`).
3. **Executar T2–T8 via Workflow:** **FEITO** (foundational `cb418f2`, backend `43d1d6c`, mobile `2b614ca`, fix `b3b5b28`).

**Pendente de verdade (a partir daqui):**

- **Reconciliar a documentação desatualizada:** cabeçalho do `CLAUDE.md` ("greenfield, só `.git`") e os checkboxes de `specs/001-alca-do-paciente/tasks.md` (marcar T003–T026 como feitas).
- **Fase 2+:** motor de rebalanceamento; registro/ciclo/adesão/relatório + UI da nutri (web); import por IA, offline, notificações; billing.
- **Endurecer LGPD/auth:** sair do gate de exposição + `FR-016` para controle de acesso, criptografia e consentimento reais; substituir o auth stub.

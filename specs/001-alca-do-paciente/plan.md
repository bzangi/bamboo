# Implementation Plan: Alça do paciente — ver "o agora" e substituir

**Branch**: `main` (sem branch dedicada; feature rastreada por `.specify/feature.json`) | **Date**: 2026-05-31 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-alca-do-paciente/spec.md`

## Summary

Entregar a primeira alça end-to-end do lado do paciente: **(US1)** abrir o app e ver "o agora" (a refeição do momento) sob o rótulo anunciado do tipo-de-dia, com a lista do dia; **(US2)** substituir um alimento flexível dentro do seu grupo, com quantidade recalculada (preservando o nutriente-base) e medida caseira — item travado não troca.

Abordagem técnica: a **matemática de substituição vive em `packages/core`** como função pura `substituir()` que retorna `Result` (testável sem banco, roda no servidor e no device). A **API NestJS** (`apps/api`) é casca fina que carrega dados via Drizzle, chama o núcleo e converte `Result`→`HttpException` na borda, serializando via DTO puro respeitando o gate de exposição. O **app Expo** consome dois endpoints via `@bamboo/api-client` tipado. Dados são **semeados** (sem UI da nutri). "O agora" no v0 resolve para a primeira refeição (registro diferido).

## Technical Context

**Language/Version**: TypeScript strict; Node 20+ (máquina atual: Node 26). Monorepo pnpm 11 + Turborepo 2.x.

**Primary Dependencies**:
- `packages/core`: **TS puro** — `Result`/`ok`/`err` à mão (zero dep de plataforma) + `ts-pattern` para match exaustivo. **Sem** `neverthrow`/`Effect`/`fp-ts` (decisão MVP; `Result` à mão segue o exemplo canônico do CLAUDE.md e mantém o núcleo sem dependências).
- `packages/db`: `drizzle-orm`, `drizzle-kit`, `pg`.
- `apps/api`: NestJS 11 (`class-validator` + `ValidationPipe` na borda).
- `apps/mobile`: React Native + Expo SDK 56.
- `packages/types`: DTOs compartilhados; `packages/api-client`: client tipado.

**Storage**: PostgreSQL (Docker, T1) via Drizzle. Schema migra de `docs/schema.ts` para `packages/db/schema.ts` na T2, **+ campo `horario` em `meal`** (opcional).

**Testing**: **Vitest** no núcleo (`packages/core`) e em utilitários do `packages/db`. Testes de domínio são **test-first** (Princípio IV). Endpoints validados via quickstart (seed → request) no MVP.

**Target Platform**: paciente em **iOS/Android (Expo)**; API em Node. (Web da nutri fora desta feature.)

**Project Type**: Mobile + API em monorepo (`apps/{api,mobile}` + `packages/{core,db,types,api-client}`).

**Performance Goals**: substituição calculada **localmente e instantânea** (cálculo O(n) sobre os alimentos do grupo, < 16 ms); `GET /today` resolve o plano do dia numa única travessia.

**Constraints**: núcleo **sem I/O, sem `throw`, sem mutação**; substituição **determinística**. O cálculo é local por design (habilita offline depois), mas **offline robusto/cache/fila está fora de escopo**.

**Scale/Scope**: 2 user stories, 2 endpoints REST, 1 função pura de domínio, 1 paciente semeado no v0.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **Núcleo puro** (Princípio III): `substituir()` (e o cálculo nutricional por porção) vivem em `packages/core` como funções **puras** — sem I/O, sem `throw`, sem mutação — retornando `Result<…, SubstitutionError>` com erro como **discriminated union** (`fora-do-grupo`, `nutriente-base-zero`), casado com `ts-pattern`.
- [x] **Casca fina** (Princípio III): I/O (Drizzle, `db.transaction` quando necessário), orquestração e conversão `Result`→`HttpException` ficam **só em `apps/api`**; a response é montada por **DTO puro** (nunca entidade do Drizzle crua) e respeita o gate de exposição.
- [x] **Tese** (Princípios I/II): serve "seguir + adequar" (substituição = adequar); "mostra o certo por padrão" (default anunciado, refeição do momento), "troca num toque", "nunca barra" (sem substitutos → informa, não bloqueia); **faixa-alvo não teto** e **sem bucket de % de caloria** (FR-015).
- [x] **LGPD** (Princípio V): dados **patient-scoped** por design; **gate de exposição** respeitado (FR-005/FR-016). ⚠️ *Auth real é stub no v0* — deferral consciente, **justificado no Complexity Tracking** (sem PII real; design encaixa auth depois sem refactor de domínio).
- [x] **Escopo** (Princípio VI): dentro do MVP; respeita "Fora de escopo" (sem rebalanceamento, combinação, registro/adesão, UI da nutri, offline, auth real); **sem** `Effect`/`fp-ts`.
- [x] **TDD** (Princípio IV): teste vem **antes** da implementação no núcleo (T4: `substitution.test.ts` antes de `substitution.ts`), cobrindo troca normal, arredondamento, alvo com nutriente-base zero (retorna `err`), alvo fora do grupo e preservação do nutriente-base dentro da tolerância.

Resultado: **gates passam**; a única ressalva (auth stub) é deferral consciente registrado abaixo.

## Project Structure

### Documentation (this feature)

```text
specs/001-alca-do-paciente/
├── plan.md              # Este arquivo
├── research.md          # Phase 0 — decisões técnicas
├── data-model.md        # Phase 1 — entidades (de docs/schema.ts + meal.horario)
├── quickstart.md        # Phase 1 — como rodar/verificar a fatia
├── contracts/           # Phase 1
│   ├── get-today.md           # GET /patients/:id/today
│   ├── get-substitutions.md   # GET /meal-items/:id/substitutions
│   └── core-substituir.md     # assinatura da função pura substituir()
├── checklists/requirements.md # (Specify)
└── tasks.md             # Phase 2 (/speckit-tasks — não criado aqui)
```

### Source Code (repository root)

```text
packages/core/src/
├── result.ts              # Result<T,E> + ok/err (já placeholder; vira real na T4)
├── substitution.ts        # substituir() pura + SubstitutionError (T4)
├── substitution.test.ts   # Vitest, test-first (T4)
├── nutrition.ts           # cálculo nutricional por porção (apoia exposição)
└── index.ts               # re-exports

packages/db/
├── schema.ts              # migra de docs/schema.ts + meal.horario (T2)
├── drizzle.config.ts      # aponta DATABASE_URL (T2)
├── client.ts              # export const db (T2)
├── migrations/            # geradas por drizzle-kit (T2)
└── scripts/
    ├── ingest-taco.ts     # popular food + medidas caseiras (T3)
    └── seed.ts            # nutri+paciente+grupos+plano+refeições+itens (T6)

packages/types/src/
├── today.ts               # DTOs de GET /today
├── substitution.ts        # DTOs de GET /substitutions
└── index.ts

packages/api-client/src/
└── index.ts               # client tipado: getToday(), getSubstitutions()

apps/api/src/
├── plan/                  # GET /patients/:id/today (T5a)
│   ├── plan.controller.ts
│   ├── plan.service.ts    # casca: I/O + monta DTO + exposição
│   └── plan.module.ts
└── substitution/          # GET /meal-items/:id/substitutions (T5b)
    ├── substitution.controller.ts
    ├── substitution.service.ts  # casca: I/O + chama @bamboo/core + Result→HttpException
    └── substitution.module.ts

apps/mobile/                # paciente
├── (tela Home "o agora" — T7)
└── (bottom-sheet de substituição — T8)
```

**Structure Decision**: Mobile + API em monorepo `@bamboo/*`. A regra de domínio (substituição, cálculo nutricional) concentra-se em `packages/core` (puro, testável, reusável servidor+device); `apps/api` é casca; `apps/mobile` é cliente fino via `@bamboo/api-client`. DTOs em `packages/types`. Esta feature **não** toca `apps/web`.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| **Auth stub no v0** (LGPD Princípio V parcialmente diferido — controle de acesso real ausente) | Provar a tese (alça do paciente) sem antecipar o custo de auth real; no v0 os dados são **semeados/fictícios**, sem PII de paciente real. Consta explicitamente na lista "Fora de escopo agora" (`auth de verdade — v0 = auth stub, paciente fixo por env`). | Implementar auth real agora atrasaria a prova da tese sem reduzir risco (sem dado real). O **gate de exposição** (controle de privacidade central) já é respeitado, e o domínio é **patient-scoped**, então auth real encaixa na borda depois **sem refactor** do núcleo. |

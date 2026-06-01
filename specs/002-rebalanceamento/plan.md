# Implementation Plan: Motor de rebalanceamento — negociar o dia

**Branch**: `main` (sem branch dedicada; feature rastreada por `.specify/feature.json`) | **Date**: 2026-06-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/002-rebalanceamento/spec.md`

## Summary

Entregar **o motor que adapta o resto do dia** quando o paciente desvia do plano — um motor único alimentado por três gatilhos: **(P1)** escolher uma opção desigual de uma refeição → recalcula todos os macros e espalha a diferença nas refeições seguintes, com **prévia antes de confirmar**; **(P2)** combinação 1→2 (preserva o nutriente-base, split 50/50 ajustável); **(P3)** troca de tipo-de-dia (regra por total-do-dia no núcleo; no app v0 só exibe o novo cardápio). Sempre com **faixa-alvo (não teto)**, **piso inviolável + recusa orientada** e **ação, não número**.

**Abordagem técnica** (Functional Core / Imperative Shell): todo o cálculo vive em **`packages/core`** como funções **puras** que retornam `Result` — um **primitivo** `rebalancearPorKcal` + adaptadores finos por gatilho (D1), `combinar()` (prima de `substituir()`, D7) e a resolução de parâmetros de 3 níveis (D5). A correção é **ancorada em kcal** (D2), distribuída **proporcionalmente** entre alavancas respeitando o piso (D3); **recusa orientada é desfecho `ok`** (D4 — "nunca barra"). A **casca NestJS** (`apps/api`) é fina: carrega dados via Drizzle, resolve os parâmetros lendo config, chama o núcleo e monta DTO **respeitando o gate de exposição** — sem persistir nada (D9). O **app Expo** (cliente fino, US3) consome via `@bamboo/api-client`. Único acréscimo de persistência: **4 colunas de config nullable** (faixa/piso por nutri e por paciente, D5) — semeadas, não escolha.

## Technical Context

**Language/Version**: TypeScript strict; Node 20+. Monorepo pnpm 11 + Turborepo 2.x.

**Primary Dependencies**:

- `packages/core`: **TS puro** — `Result`/`ok`/`err` à mão + `ts-pattern` (match exaustivo). **Reusa** `nutrition.ts` (`nutrientesDaPorcao`) e `substitution.ts` (`basisPer100g`, `medidaMaisProxima`). **Sem** `neverthrow`/`Effect`/`fp-ts`/solver numérico (D10).
- `packages/db`: `drizzle-orm`, `drizzle-kit`, `pg` — nova migration (4 colunas config).
- `apps/api`: NestJS 11 (`class-validator` + `ValidationPipe` na borda).
- `apps/mobile`: React Native + Expo SDK 56 (US3).
- `packages/types`: novos DTOs (rebalance/combine + extensão do today); `packages/api-client`: novos métodos tipados.

**Storage**: PostgreSQL via Drizzle. Acréscimo: `nutritionist.{default_band_tolerance_pct, default_floor_pct}` + `patient.{band_tolerance_pct, floor_pct}` (todas `double precision`, nullable, config). Nenhuma tabela nova; estado de escolha **não** persiste (FR-026).

**Testing**: **Vitest** no `packages/core`, **test-first** (Princípio IV) — o motor é o grosso da cobertura. Endpoints via e2e (seed → request) como na Fase 1.

**Target Platform**: paciente em iOS/Android (Expo); API em Node.

**Project Type**: Mobile + API em monorepo (`apps/{api,mobile}` + `packages/{core,db,types,api-client}`).

**Performance Goals**: rebalanceamento **local e instantâneo** — O(n) sobre os itens do dia (poucas dezenas), passes de transbordo limitados; < 16 ms. Cálculo determinístico, pronto pra rodar offline depois (offline robusto fora de escopo).

**Constraints**: núcleo **sem I/O, sem `throw`, sem mutação**, determinístico; recusa orientada é `ok` (não 4xx); efêmero (sem persistência de escolha).

**Scale/Scope**: 3 user stories; ~4 funções puras novas no núcleo (primitivo + 2 adaptadores + combinar + resolução de params); 2 endpoints novos + 1 extensão do `/today`; 1 migration (4 colunas); 1 paciente semeado com plano de ≥2 tipos-de-dia, refeições com opções desiguais e itens flexíveis/travados.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- [x] **Núcleo puro** (Princípio III): motor (`rebalancearPorKcal`, `previewTrocaOpcao`, `previewTrocaTipoDia`), `combinar()`, `resolverParametros`, `alvoDoDia`, `avaliarFaixa` vivem em `packages/core` como funções **puras** — sem I/O, sem `throw`, sem mutação — retornando `Result` com erro como **discriminated union** casado com `ts-pattern`. Desfechos de produto (incl. recusa orientada) são `ok`.
- [x] **Casca fina** (Princípio III): I/O (Drizzle), leitura de config, orquestração e conversão `Result`→`HttpException` ficam **só em `apps/api`**; recusa orientada é **200** (não exceção); response por **DTO puro** respeitando o gate de exposição.
- [x] **Tese** (Princípios I/II): é a alça de **adequar** por excelência; "avisa, não surpreende" (prévia antes de confirmar), **faixa-alvo não teto**, **piso inviolável** + recusa orientada, **ação não número** (sem bucket de % de caloria), troca num toque, nunca barra.
- [x] **LGPD** (Princípio V): dados **patient-scoped**; **gate de exposição** respeitado nas prévias/combinações. ⚠️ Auth real segue **stub** no v0 — deferral consciente (mesmo do 001), justificado no Complexity Tracking.
- [x] **Escopo** (Princípio VI): dentro do MVP; respeita "Fora de escopo" (sem registro real, sem persistência de escolha, sem UI da nutri, sem offline, sem 1→N). **Sem** `Effect`/`fp-ts`. A única exceção ao "sem persistência nova" — 4 colunas de **config** — foi **aprovada pelo dono do produto** (FR-012a–c) e é mínima/justificada.
- [x] **TDD** (Princípio IV): testes vêm **antes** da implementação no núcleo, cobrindo critérios + bordas + recusas (ver casos nos contratos `core-*.md`).

Resultado: **gates passam**. Ressalvas conscientes (auth stub; colunas de config) registradas abaixo.

## Project Structure

### Documentation (this feature)

```text
specs/002-rebalanceamento/
├── plan.md              # Este arquivo
├── research.md          # Phase 0 — decisões D1–D10 + pontos de gate
├── data-model.md        # Phase 1 — entidades reusadas + 4 colunas de config
├── quickstart.md        # Phase 1 — como rodar/verificar a fatia
├── contracts/           # Phase 1
│   ├── core-parametros.md         # resolução 3 níveis + alvo do dia + faixa
│   ├── core-rebalancear.md        # primitivo + adaptadores P1/P3
│   ├── core-combinar.md           # combinação 1→2
│   ├── post-rebalance-option-choice.md  # POST prévia P1
│   ├── post-combine.md            # POST combinação
│   └── get-today-extension.md     # extensão do /today (opções + override display)
├── checklists/requirements.md     # (Specify)
└── tasks.md             # Phase 2 (/speckit-tasks — não criado aqui)
```

### Source Code (repository root)

```text
packages/core/src/
├── rebalance.ts            # rebalancearPorKcal + previewTrocaOpcao + previewTrocaTipoDia (núcleo)
├── rebalance.test.ts       # Vitest, test-first
├── combination.ts          # combinar() (reusa substitution.ts)
├── combination.test.ts     # Vitest, test-first
├── params.ts               # ParametrosAdaptacao + PARAMETROS_SISTEMA + resolverParametros
├── params.test.ts          # Vitest, test-first
├── nutrition.ts            # (reuso) Nutrientes/somaNutrientes/alvoDoDia/avaliarFaixa — estende aqui
├── substitution.ts         # (reuso) basisPer100g, medidaMaisProxima exportados p/ combinar
├── result.ts               # (reuso)
└── index.ts                # re-exports (+ os novos)

packages/db/
├── schema.ts               # + colunas config em nutritionist e patient
├── migrations/             # nova migration (drizzle-kit generate)
└── scripts/seed.ts         # estende: 2 tipos-de-dia, opções desiguais, itens flexíveis/travados, (opcional) config semeada

packages/types/src/
├── rebalance.ts            # DTOs do POST option-choice (RebalanceOutcomeDto)
├── combination.ts          # DTOs do POST combine
├── today.ts                # (estende) MealDto.options
└── index.ts

packages/api-client/src/
└── index.ts                # + postOptionChoice(), postCombine(); getToday(dayTypeId?)

apps/api/src/
├── rebalance/              # POST /patients/:id/rebalance/option-choice
│   ├── rebalance.controller.ts
│   ├── rebalance.service.ts   # casca: I/O + resolve params + chama núcleo + DTO/exposição
│   └── rebalance.module.ts
├── combination/            # POST /meal-items/:id/combine
│   ├── combination.controller.ts
│   ├── combination.service.ts # casca: guarda flexível + chama combinar + Result→HttpException
│   └── combination.module.ts
└── plan/                   # (estende) /today: options + ?dayTypeId

apps/mobile/                # paciente (US3, cliente fino)
├── (seletor de opções + folha de prévia do rebalanceamento)
├── (UI de combinação com slider de split)
└── (troca de tipo-de-dia no rótulo → re-exibe cardápio)
```

**Structure Decision**: Mobile + API em monorepo `@bamboo/*`. O motor concentra-se em `packages/core` (puro, testável, reusável servidor+device); `apps/api` é casca; `apps/mobile` é cliente fino via `@bamboo/api-client`; DTOs em `packages/types`. Esta feature **não** toca `apps/web`. Reaproveita ao máximo o núcleo da Fase 1 (`nutrition.ts`, `substitution.ts`).

## Complexity Tracking

| Violation                                                                                       | Why Needed                                                                                                                               | Simpler Alternative Rejected Because                                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Auth stub no v0** (LGPD Princípio V parcialmente diferido — controle de acesso real ausente)  | Provar a alça de rebalanceamento sem antecipar o custo de auth real; dados semeados/fictícios, sem PII real. Consta em "Fora de escopo". | Auth real agora atrasaria a prova sem reduzir risco (sem dado real); o gate de exposição já é respeitado e o domínio é patient-scoped, então auth encaixa na borda depois **sem refactor** do núcleo.                       |
| **4 colunas de config** (`nutritionist`/`patient`) — exceção ao "sem persistência nova" da spec | Honrar os parâmetros faixa/piso em 3 níveis (FR-012a–c), pedido explícito do dono do produto, sem UI da nutri (valores semeados).        | Constantes fixas matariam os níveis nutri/paciente; tabela/JSON de settings é over-engineering pra 2 campos × 2 níveis. Colunas nullable são acréscimo mínimo, FK-free, e a **resolução é pura** no núcleo (a casca só lê). |
| **POST pra "prévia"** (em vez de GET)                                                           | Entrada estruturada (opção escolhida; 2 alvos + split) e semântica de "computa esta prévia".                                             | GET com query grande é frágil; e a feature não persiste, então não há recurso a "ler". POST é idempotente e sem efeito colateral aqui.                                                                                      |

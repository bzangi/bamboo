# Implementation Plan: Fechamento da Fase 1 — nutrição da alternativa na substituição

**Branch**: `010-fechamento-fase-1` (planejada na `main`, padrão 006–008) | **Date**: 2026-07-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/010-fechamento-fase-1/spec.md`

> **Gate duplo pendente**: por pedido do Bruno ("planeje a tarefa"), spec e plan foram
> produzidos juntos nesta rodada. Os gates **Specify→Plan** e **Plan→Tasks** serão
> apresentados juntos para aprovação; nada é implementado antes do aval. A decisão **D1**
> (incluir nutrição da alternativa — recomendação: sim, sob gate) derruba ou mantém a US1.

## Summary

A US1 **liga dados que já existem** — nenhuma matemática nova, nenhuma persistência nova:

- O core já tem `nutrientesDaPorcao()` (`packages/core/src/nutrition.ts:22`) — pura, testada.
- A borda já tem a política do gate pronta e exportada: `nutritionFor(food, gramas, exposure)`
  (`apps/api/src/plan/today.mapper.ts:106`) — cobre os 4 níveis (`hidden` omite o campo,
  `percent` só proporções, `macros` sem kcal, `full_kcal` tudo).
- O `substitution.service` **já carrega os macros de cada alvo** (passo 4 da query) e os
  descarta ao montar o DTO.

Mudança real: (1) `SubstitutionAlternativeDto` ganha campo **opcional** `nutrition?`
(aditivo, mesma convenção do `MealItemDto`); (2) o service passa a conhecer o **paciente dono
do item** (join `meal_item→meal_option→meal→plan→patient`) para obter o `exposure`;
(3) o mapper chama `nutritionFor` com as gramas equivalentes; (4) o `SubstitutionSheet`
exibe a linha quando presente. US2 adiciona os testes que faltam (com uma extração de helper
puro no mobile, padrão da 005). US3 é fechamento: smoke da 005, board Notion e docs.

**Sem migration. Sem mudança no core. Sem endpoint novo. Sem dependência nova.**

## Technical Context

**Language/Version**: TypeScript 5.9 strict (Node 20+) — monorepo pnpm + Turborepo

**Primary Dependencies**: NestJS 11 + Drizzle (`apps/api`) · Expo SDK 56 / RN 0.85 / React 19 (`apps/mobile`) · `@bamboo/core`/`types`/`api-client` (workspace) · `ts-pattern`

**Storage**: PostgreSQL 17 (docker-compose) — **nenhuma mudança de schema nesta feature**

**Testing**: Vitest — e2e da API em `apps/api/test` (`fileParallelism:false`, seed antes), unit no core e no mobile (lógica pura só; runtime RN é smoke manual — handoff §7)

**Target Platform**: API Node local + app iOS/Android via Expo (dev: simulador iOS)

**Project Type**: web-service + mobile-app (monorepo)

**Performance Goals**: sem meta nova — 1 join a mais na consulta de alternativas (desprezível); nenhum request novo no app

**Constraints**: resposta omite nutrição na origem quando `exposure='hidden'` (LGPD/gate — zero vazamento, régua do SC-005/007 da 006); apresentação neutra (sem ranking/delta — FR-015 da 001); rebalanceamento intocado

**Scale/Scope**: 1 endpoint alterado (aditivo), ~6 arquivos de produto + 2 de teste; board: 6 cards reconciliados

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- [x] **Núcleo puro** (Princípio III): nenhuma regra nova de domínio — reuso de
      `nutrientesDaPorcao` (pura, no core). A política de exposição é mapeamento de borda
      (`nutritionFor`, função pura na casca) — permanece onde está.
- [x] **Casca fina** (Princípio III): I/O (join do paciente) no service; response via DTO puro
      no mapper (nenhuma entidade Drizzle crua); erros seguem `ts-pattern` → `HttpException` na borda.
- [x] **Tese** (Princípios I/II): informação no momento de **adequar** (trocar num toque),
      neutra e sem barrar; números só sob gate da nutri — "ação, não número" preservado para quem
      ela protege.
- [x] **LGPD** (Princípio V): `exposure` do dono do plano aplicado **na origem** (campo ausente,
      não escondido no cliente); nenhum dado novo persistido ou exposto fora do gate.
- [x] **Escopo** (Princípio VI): sem migration, sem dependência nova, sem infra deferida;
      feature liga o que existe e fecha a fase.
- [x] **TDD** (Princípio IV): ordem test-first definida em "Estratégia de testes" (e2e do gate
      falha antes da implementação; teste do helper de consumo falha antes da extração).

**Complexity Tracking: vazio — nenhuma violação.**

## Project Structure

### Documentation (this feature)

```text
specs/010-fechamento-fase-1/
├── spec.md              # QUE/PORQUÊ + decisão D1 pro gate
├── plan.md              # Este arquivo
├── research.md          # D1–D9 (decisões com alternativas)
├── data-model.md        # Sem schema novo; atributo derivado + caminho do exposure
├── contracts/
│   └── get-substitutions-nutrition.md   # Delta do contrato da 001
├── quickstart.md        # Verificação da US1 + roteiro do smoke da 005 (US3)
├── checklists/requirements.md
└── tasks.md             # (/speckit-tasks — após aprovação dos gates)
```

### Source Code (repository root)

```text
packages/types/src/
├── nutrition.ts         # NOVO — NutritionDto movido de today.ts (evita ciclo de import)
├── today.ts             # importa NutritionDto de ./nutrition.js (re-export preservado no barrel)
└── substitution.ts      # SubstitutionAlternativeDto ganha nutrition?: NutritionDto

apps/api/src/
├── substitution/substitution.service.ts   # join do paciente (exposure) na query do item
├── substitution/substitution.mapper.ts    # toAlternativeDto ganha nutrition via nutritionFor
├── plan/today.mapper.ts                   # inalterado (nutritionFor já é exportado — só reuso)
└── docs/swagger.models.ts                 # modelo da alternativa + regen do OpenAPI

apps/api/test/
└── substitutions.e2e-spec.ts    # casos do gate (4 níveis) + lista vazia → 200 (US2b)

apps/mobile/src/
├── SubstitutionSheet.tsx        # linha de nutrição condicional (alt.nutrition presente)
├── format.ts                    # formatter da linha reutilizando o miolo do formatNutritionLine
├── consumo.ts                   # NOVO — montarConsumo() puro extraído do HomeScreen (US2a)
├── consumo.test.ts              # NOVO — Vitest da montagem do payload (US2a)
└── HomeScreen.tsx               # handleRegistrar passa a chamar montarConsumo()
```

**Structure Decision**: monorepo existente; nenhum diretório novo além de 2 arquivos no
mobile (helper puro + teste, padrão estabelecido pela 005 com `swaps.ts`).

## Estratégia de testes (ordem TDD)

1. **US1 (e2e primeiro)**: em `substitutions.e2e-spec.ts`, casos novos — exposição
   `full_kcal` → alternativa com `nutrition` completo (kcal+macros+pcts, coerente com as
   gramas equivalentes); `macros` → sem `kcal`; `percent` → só proporções; `hidden` → campo
   **ausente**. Rodar e ver **falhar** → implementar types+service+mapper → verde.
   _Isolamento (lição da `a2894f3`/KI-001)_: os casos mudam o `exposure` do paciente semeado —
   **restaurar no `afterAll`** para não vazar estado entre suítes; nenhum `meal_event` criado.
2. **US2a (mobile)**: `consumo.test.ts` especifica `montarConsumo(activeOption,
consumoOverrides, defaultOptionId)` → casos: sem mudança → `undefined`; só substituição →
   `{chosenOptionId, items:[1]}`; combinação → 2 itens no mesmo `itemId`; opção não-default
   sem override → `{chosenOptionId}` sem `items`. Falha (helper não existe) → extrair de
   `HomeScreen.tsx:301-316` → verde; `HomeScreen` delega (comportamento idêntico).
3. **US2b (e2e)**: caso "grupo sem outras alternativas → 200 + `alternatives: []`" (item
   semeado num grupo unitário ou food do grupo com nutriente-base zero).
4. **US1 (display)**: runtime RN é smoke manual (handoff §7) — roteiro no quickstart; a
   lógica de formatação entra no Vitest do mobile se ganhar branch não-trivial.
5. **Regressão**: suítes completas core/api/mobile + `pnpm lint` + `pnpm format` +
   `tsc --noEmit` (mobile exige `pnpm build` antes — memória `bamboo-mobile-test-typecheck`);
   regen OpenAPI (`pnpm --filter api openapi:gen`) e commit do diff.

## Riscos & mitigação

- **Vazamento de estado entre suítes e2e** (exposure mutado): restaurar no `afterAll`;
  vigiar o KI-001 (flaky pré-existente da adesão) — não relacionado, mas não piorar.
- **Ciclo de import em `packages/types`** (`today.ts` ⇄ `substitution.ts`): resolvido
  movendo `NutritionDto` para `nutrition.ts` (D4) — barrel re-exporta, zero quebra.
- **Combine sheet**: consome o mesmo GET; o campo novo é opcional e **não** será exibido lá
  (spec, edge case) — nenhuma mudança necessária no `CombineSheet`.
- **Reconciliação Notion** (US3): depende do MCP do Notion na sessão de execução; se
  indisponível, a justificativa vai nos docs e o board fica como pendência explícita.
- **Smoke da 005**: requer simulador + API + DB de pé (`pnpm mobile:dev`); falha achada no
  smoke NÃO bloqueia US1/US2 — vira pendência registrada (spec, US3/cenário 2).

## Fases seguintes (após aprovação dos gates)

- `/speckit-tasks` gera `tasks.md` por user story (test-first, como 004–009).
- Execução autônoma por fase com verificação (memória `bamboo-execucao-autonoma-por-fase`),
  commits na `main`.
- Fechamento US3: smoke 005 documentado no quickstart, board reconciliado (BAM-38/55/56/57/40
  fechados com justificativa; BAM-39 → refletindo esta feature), `docs/estado-atual.md` +
  header/bloco SPECKIT do `CLAUDE.md` declarando Fase 1 concluída.

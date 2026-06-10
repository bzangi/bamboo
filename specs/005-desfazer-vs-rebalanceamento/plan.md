# Implementation Plan: Desfazer coerente com o rebalanceamento

**Branch**: `005-desfazer-vs-rebalanceamento` | **Date**: 2026-06-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/005-desfazer-vs-rebalanceamento/spec.md`

## Summary

Corrigir o "desfazer" por-item do app do paciente para não quebrar o rebalanceamento. Hoje o estado local junta numa mesma estrutura (`qtyOverrides`) os ajustes **derivados do rebalanceamento** (quantidades das outras refeições) e a condição que exibe o "↺ desfazer" por-item — então desfazer um item rebalanceado reverte só aquele item, sem recalcular, deixando o dia inconsistente.

Abordagem técnica: consolidar a troca de opção numa estrutura de sessão por refeição-gatilho — `swaps[mealId] = { chosenOptionId, previousOptionId, adjustments }` — em que os ajustes derivados moram **dentro da troca**, não num mapa de itens. Isso (a) tira o ajuste derivado da condição do botão por-item por construção (FR-001), (b) torna o desfazer da troca atômico (opção + ajustes juntos — FR-003/005) e (c) torna a re-troca uma substituição atômica (FR-006). O "↺ desfazer" por-item passa a depender só de mudança direta (`nameOverride` = substituir/combinar — FR-002). Adiciona-se um snackbar temporário (~5s) como atalho de desfazer da troca (FR-004) e o caminho durável de re-tocar o chip da opção original (FR-005). Sem API, sem core, sem migration; tudo efêmero (FR-007/008).

## Technical Context

**Language/Version**: TypeScript (strict) · React 19.2 · React Native 0.85 / Expo SDK 56

**Primary Dependencies**: app do paciente (`apps/mobile`), consumindo `@bamboo/types` (DTOs) e `@bamboo/api-client`. Vitest (a adicionar ao `apps/mobile` para o módulo puro).

**Storage**: N/A — estado de sessão efêmero (nada persiste no v0).

**Testing**: Vitest (env `node`) sobre o módulo puro `apps/mobile/src/swaps.ts`; type-check via `tsc --noEmit` (tsconfig do Expo); Prettier no gate de done. Comportamento de UI (timer do snackbar, condição de render) verificado por run manual — `apps/mobile` não tem harness de teste de componente e adicioná-lo (RTL + jest-expo/jsdom) é desproporcional a um fix de uma tela.

**Target Platform**: app mobile do paciente (iOS/Android via Expo).

**Project Type**: Mobile + API (monorepo) — esta feature toca **apenas** o app mobile.

**Performance Goals**: N/A (interação local; snackbar ~5s ±1s — SC-005).

**Constraints**: efêmero (sem persistência); não alterar a matemática do rebalanceamento (`@bamboo/core`) nem o desfazer do registro; manter imutabilidade (estado por spread, sem mutação).

**Scale/Scope**: 1 tela (`HomeScreen.tsx`) + 1 módulo puro novo (`swaps.ts`) + 1 componente de snackbar + 1 arquivo de teste. Sem mudança de contrato HTTP.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **Núcleo puro** (Princípio III): a feature **não introduz regra de domínio nova**. A matemática do rebalanceamento permanece em `packages/core`, intocada. O módulo novo `swaps.ts` é **lógica de estado de apresentação** (qual opção está ativa; quais rótulos derivados exibir) — não é regra de negócio, logo vive corretamente em `apps/mobile`. Ainda assim é TS **puro**: sem I/O, sem `throw`, sem mutação (retorna novo estado por spread).
- [x] **Casca fina** (Princípio III): nenhuma mudança em `apps/api`; nenhum contrato HTTP novo; nenhuma entidade do Drizzle serializada. N/A por não tocar o backend.
- [x] **Tese** (Princípios I/II): serve diretamente "nunca barra" (sempre há caminho de volta) e "deixa trocar num toque" (desfazer em 1 toque na janela do snackbar). Não exibe número de culpa; o desfazer é **ação**.
- [x] **LGPD** (Princípio V): sem dado de saúde novo, sem exposição; interação puramente local no app. N/A.
- [x] **Escopo** (Princípio VI): mobile-only, efêmero, sem infra deferida (`Effect`/`fp-ts`). É correção de bug dentro da UI de rebalanceamento já construída (Fase 2/4).
- [~] **TDD** (Princípio IV): a lógica que importa (desfazer atômico, re-troca substitui, separação derivado-vs-direto) é extraída para `swaps.ts` e **testada antes** (Vitest). O glue de componente (auto-dismiss do snackbar, condição de render do botão) é verificado por type-check + run manual, não por teste automatizado — ver Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/005-desfazer-vs-rebalanceamento/
├── plan.md              # Este arquivo
├── spec.md              # Spec (já criada)
├── research.md          # Phase 0 (decisões técnicas)
├── data-model.md        # Phase 1 (shapes de estado de sessão; sem mudança de DB)
├── quickstart.md        # Phase 1 (como verificar: unit + manual)
├── checklists/
│   └── requirements.md  # Checklist de qualidade do spec
└── tasks.md             # Phase 2 (/speckit-tasks — NÃO criado aqui)
```

(Sem `contracts/`: o contrato HTTP `POST /rebalance/option-choice` e os DTOs em `@bamboo/types` permanecem inalterados.)

### Source Code (repository root)

```text
apps/mobile/
├── package.json              # + devDep vitest, + script "test"
├── vitest.config.ts          # NOVO (env node, include src/**/*.test.ts)
└── src/
    ├── HomeScreen.tsx         # ALTERADO: usa `swaps` em vez de optionOverrides+qtyOverrides;
    │                          #           ItemRow undo só p/ nameOverride; chip default desfaz;
    │                          #           hospeda o snackbar
    ├── swaps.ts               # NOVO: reducer puro (applySwap/undoSwap/activeOptionId/flattenAdjustments)
    ├── swaps.test.ts          # NOVO: testes do reducer (Vitest)
    └── UndoSwapToast.tsx      # NOVO: snackbar temporário "Desfazer" (~5s)
```

**Structure Decision**: monorepo já estabelecido; a feature é confinada a `apps/mobile`. O reducer puro fica no app (estado de apresentação, não domínio) — não em `packages/core`, que guarda só a matemática de domínio. `@bamboo/types`/`@bamboo/api-client` consumidos como hoje.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| TDD parcial: timer/render do snackbar sem teste automatizado | `apps/mobile` não tem harness de teste de componente; o valor de negócio (desfazer atômico, re-troca, separação derivado/direto) está no reducer puro, que é testado antes da implementação | Montar RTL + jest-expo/jsdom para cobrir um `setTimeout` e uma condição de render numa única tela é desproporcional ao fix; o risco residual (timing do snackbar) é baixo e coberto por verificação manual no quickstart |

# Implementation Plan: Motor de rebalanceamento lê o registro

**Branch**: `004-motor-le-registro` | **Date**: 2026-06-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/004-motor-le-registro/spec.md`

## Summary

Ligar o motor de rebalanceamento (Fase 2) ao registro (Fase 3). Achado-chave da investigação: a **matemática da engine não muda** — `rebalancearPorKcal` já trata os dois sentidos (`deltaKcal>0` reduz com clamp no piso → recusa "estoura-piso"; `deltaKcal<0` aumenta) e mira o alvo. **Sem mudança de schema** (`meal_event`/`meal_event_item` já existem).

- **Núcleo** (`packages/core/src/rebalance.ts`): adicionar `isRegistered` a `RefeicaoDia`; `previewTrocaOpcao` exclui das alavancas as refeições registradas (`r.position !== trigger && !r.isRegistered`). `previewTrocaTipoDia` **não muda** — só ganha um consumidor.
- **Troquei exato (escrita do registro — Fase 3, D3b)**: `registro.service` passa a gravar, no troquei, o **snapshot completo** do consumo em `meal_event_item` — **lógica de carga nova** (carregar a opção cumprida inteira + overlay por `itemId`, tratando combinação 1→N), não só "mais linhas". Sem migration; sem mudança no mobile. Atualizar e2e de troquei da Fase 3.
- **Consumo real** (casca, helper compartilhado por (paciente, plano, `localToday()`), type-agnostic): feito = itens da opção cumprida; troquei = **soma de `meal_event_item`**; pulei = zero — reusado pelos dois gatilhos.
- **Casca — trocar opção** (`apps/api/src/rebalance`): carregar o estado vigente + consumo real, montar `diaComEscolha` com itens reais nas registradas + `isRegistered`, e passar ao núcleo (totalAtual reflete o consumido; registradas não viram alavanca).
- **Casca — trocar tipo-de-dia** (`apps/api/src/plan`, `getToday`): **sempre que há `?dayTypeId` override ativo** + consumo hoje, computar o `consumido` (type-agnostic) e chamar `previewTrocaTipoDia` com restantes = refeições do novo tipo nos **slots não registrados** (pareado por position — **evita double-count**); aplicar as gramas ajustadas só aos itens flexíveis da opção default (via `today.mapper`, nutrition recomputada, casamento por itemId).

Detalhe em [research.md](./research.md); modelo em [data-model.md](./data-model.md); contratos em [contracts/](./contracts/).

## Technical Context

**Language/Version**: TypeScript strict, Node 20+ (monorepo pnpm + Turborepo)

**Primary Dependencies**: NestJS (casca), Drizzle + PostgreSQL, React Native + Expo (mobile já exibe quantidades rebalanceadas), `ts-pattern`, `Result` à mão. Sem novas dependências.

**Storage**: PostgreSQL. **Nenhuma tabela nova** — lê `meal_event` + `meal_event_item` (Fase 3) e o plano (Fase 1/2).

**Testing**: Vitest — núcleo (`packages/core/*.test.ts`) e e2e da API (`apps/api/test/*.e2e-spec.ts`, `vitest run`, `fileParallelism:false`). TDD: teste antes.

**Target Platform**: API Node + app Expo. Núcleo puro compartilhado.

**Project Type**: Mobile + API (monorepo).

**Performance Goals**: N/A. As queries de registro reusam o padrão agregado (1 query por dia, sem N+1) já em `getToday`.

**Constraints**: Núcleo sem I/O/throw/mutação (Princípio III). Rebalanceamento **efêmero** (não persiste, FR-014). Ajuste reaproxima do alvo, piso inviolável, recusa orientada (Princípio II). Paciente vê ação, não número (FR-015). Consumo real resolvido **no servidor** (não confiar em payload).

**Scale/Scope**: 1 paciente semeado. Escopo: ~1 campo + 1 filtro no core; 1 helper de consumo na casca; alteração em 2 services (rebalance, plan) + 1 mapper (today). Sem mobile novo (já renderiza grama ajustada).

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- [x] **Núcleo puro** (Princípio III): a regra (excluir registradas das alavancas; direção/piso) fica no core puro (`previewTrocaOpcao` + `rebalancearPorKcal`, inalterado). `isRegistered` é dado de entrada. Zero I/O/throw/mutação.
- [x] **Casca fina** (Princípio III): I/O (carregar `meal_event`/`meal_event_item`/macros, computar consumido) e orquestração só em `apps/api`. Conversão `Result`→`HttpException` mantida (opção 1). Response via mapper puro.
- [x] **Tese** (Princípios I/II): serve "adaptar sem desfazer o passado" (não recalcula o feito); reaproxima do alvo (faixa não teto), piso inviolável, recusa orientada; ação não número (FR-015).
- [x] **LGPD** (Princípio V): consumido-até-agora é grandeza **interna**; o paciente não vê total/desvio/percentual (FR-015 + SC-006). Pertencimento já garantido nos fluxos existentes; sem nova superfície de leitura.
- [x] **Escopo** (Princípio VI): liga só os 2 gatilhos do dia (trocar opção, trocar tipo-de-dia). Fora: registrar-como-gatilho, combinar-ciente, persistir rebalanceamento, `day_selection`. Sem `Effect`/`fp-ts`.
- [x] **TDD** (Princípio IV): testes do núcleo (exclusão de registradas) e e2e (não-recalcula-feitas; pulei→déficit; troca-tipo-de-dia ajustada) escritos ANTES.

Nenhum "não". Sem violações a justificar.

## Project Structure

### Documentation (this feature)

```text
specs/004-motor-le-registro/
├── plan.md · spec.md · research.md · data-model.md · quickstart.md
├── contracts/
│   ├── core-motor.md   # previewTrocaOpcao (isRegistered) + previewTrocaTipoDia (consumidor)
│   └── http-motor.md   # POST option-choice (registro-aware) + GET /today?dayTypeId (ajustado)
└── checklists/requirements.md
```

### Source Code (repository root)

```text
packages/core/src/
├── rebalance.ts        # + isRegistered em RefeicaoDia; filtro em previewTrocaOpcao
└── rebalance.test.ts   # + casos: registrada não é alavanca; consumido alimenta total

apps/api/src/
├── registro-consumo.ts # NOVO helper: consumo real por refeição (itens+macros) + vetor consumido — por (paciente,plano,localToday)
├── registro/
│   └── registro.service.ts   # D3b: troquei grava snapshot COMPLETO em meal_event_item (não só os trocados)
├── rebalance/
│   └── rebalance.service.ts  # carrega vigente + consumo real (localToday); monta dia com isRegistered; total real
├── plan/
│   ├── plan.service.ts       # getToday: ?dayTypeId override ativo + consumo → previewTrocaTipoDia
│   └── today.mapper.ts       # aplica gramas/nutrition ajustadas só na opção default (casamento por itemId)
└── ...

packages/core/src/phase2.edge.test.ts # + isRegistered nos literais RefeicaoDia (call-site)

apps/api/test/
├── registro.e2e-spec.ts      # ATUALIZAR: troquei grava meal_event_item = refeição inteira (incl. troquei-por-opção)
├── rebalance.e2e-spec.ts     # + registrada não recalculada; pulei→déficit; troquei→consumo real; recusa por motivo
└── today-daytype.e2e-spec.ts # + troca de tipo-de-dia ajusta pelo consumido; override ativo no reload; padrão não ajusta
```

**Structure Decision**: Mobile + API. Regra no núcleo puro; carga/consumo na casca (helper compartilhado entre os 2 gatilhos); mapper puro aplica o ajuste no `/today`. Sem schema novo.

## Complexity Tracking

> Sem violações da Constituição a justificar.

| Item                                                                                        | Por que                                                                                                                        | Alternativa rejeitada porque                                                                                                                                             |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /today` rebalanceia quando **`?dayTypeId` override ativo** + consumo (decisão do dono) | O app persiste o `?dayTypeId`; "só no toque" exigiria sinal novo no app. Override ativo = card. sempre ajustado pelo consumido | Sinal efêmero de "troquei agora" rejeitado (muda o app). Tipo **padrão** (sem override) nunca auto-ajusta → Q1 preservado                                                |
| **Troquei grava snapshot completo** (muda a escrita do registro/Fase 3)                     | Decisão do dono ("exato"): sem o conjunto completo, o total do troquei-por-substituição é impreciso                            | Aproximação v0 (troquei=planejado) rejeitada pelo dono; vínculo item→substituto seria migration + mais complexo. Snapshot completo: sem migration, sem mudança no mobile |
| Helper de consumo real na casca (não no core)                                               | Resolver "o que foi consumido" é I/O (carregar opção cumprida / `meal_event_item` / macros)                                    | Pôr no core violaria functional-core; a matemática (somaNutrientes) já é core e é reusada                                                                                |

# Implementation Plan: Recálculo pelo consumo (dia inteiro) + gatilho como alavanca de último recurso

**Branch**: `022-recalculo-pelo-consumo` | **Date**: 2026-07-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/022-recalculo-pelo-consumo/spec.md`

## Summary

Duas mudanças pequenas em cima de máquina que já existe, nenhuma matemática nova.

**Parte 1 (US1)** — o `/today` deixa de exigir override de tipo-de-dia para recalcular o dia pelo consumo real: o ternário em `plan.service.ts:250` some e o método privado é renomeado (`calcularTrocaTipoDia` → `calcularAjustePeloConsumo`). `packages/core` fica com diff vazio. A marcação de "registrado" continua atrás do override — quem decide isso passa a ser o chamador, em uma linha.

**Parte 2 (US2)** — em `previewTrocaOpcao`, quando o conjunto de alavancas fica vazio, o cálculo é refeito com os itens flexíveis da própria refeição-gatilho. Quatro linhas no núcleo. A guarda da `020` (não reescalar o que o paciente escolheu item a item) já existe por construção: o overlay entra como `isLocked` e `ehAlavanca` o rejeita.

**Sem migration. Sem endpoint novo. Sem campo novo no contrato HTTP.** O app muda só o texto da prévia quando a refeição afetada é a do gatilho. Um ADR registra a revogação da Q1 da `004`.

## Technical Context

**Language/Version**: TypeScript strict, Node 20+

**Primary Dependencies**: NestJS (casca), Drizzle ORM + PostgreSQL (leitura), Expo/React Native (app do paciente), `ts-pattern` (match exaustivo)

**Storage**: PostgreSQL — **somente leitura** nesta feature; nada é gravado e nenhuma migration é criada

**Testing**: Vitest (`packages/core`, `apps/mobile`) e Vitest + supertest e2e (`apps/api`), com `buildScenario` (`@bamboo/db/testing`, feature `013`) para cenários self-contained

**Target Platform**: API Node; app iOS/Android via Expo

**Project Type**: monorepo pnpm + Turborepo (`apps/api`, `apps/mobile`, `packages/core`)

**Performance Goals** _(corrigido na execução — a redação original era otimista)_: dia **sem registro**, zero query nova (o early-return de `vigentesHoje.length === 0` é anterior a qualquer leitura). Dia **com registro e sem override**, o `/today` passa a executar as mesmas leituras que o caminho com override sempre executou: 1 query dos parâmetros da nutricionista + até 3 de `carregarConsumoReal` (opção cumprida, itens planejados, snapshot do troquei), todas condicionais. Não há query nova **no código**; há trabalho que antes não rodava naquele caminho — que é exatamente a feature. A leitura de `meal_event` continua única (`012`).

**Constraints**: ajuste efêmero e derivado (nada persiste); piso por item inviolável; itens travados e "à vontade" nunca reescalados; resposta HTTP inalterada em forma.

**Scale/Scope**: 3 arquivos de produção (`plan.service.ts`, `packages/core/src/rebalance.ts`, `RebalancePreviewSheet.tsx`) + testes + 1 ADR.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- [x] **Núcleo puro** (Princípio III): a única regra de negócio nova (alavanca de último recurso) vive em `packages/core/src/rebalance.ts`, função pura, sem I/O, sem `throw`, sem mutação, retornando o mesmo `Result<RebalanceOutcome, RebalanceError>` de hoje. A Parte 1 **não move regra para a casca** — remove uma condição de ativação; a matemática segue em `previewTrocaTipoDia`.
- [x] **Casca fina** (Princípio III): `plan.service.ts` continua só orquestrando (leitura + chamada ao núcleo + DTO puro via `toTodayResponse`). Nenhuma entidade do Drizzle serializada crua.
- [x] **Tese** (Princípios I/II): é literalmente "adaptar em vez de exibir" — o plano dobra quando o dia sai do roteiro. Respeita "nunca barra": o caso do FR-010 mantém a orientação **e** a confirmação. Nenhum número de "quanto falta" é exposto; a saída é quantidade nova, que é ação.
- [x] **LGPD** (Princípio V): nenhum dado novo lido, gravado ou exposto; a resposta continua sob o gate de exposição do paciente. Nada da via da nutri é tocado.
- [x] **Escopo** (Princípio VI): sem dependência nova, sem infra deferida. O que cresceria a feature (prévia antes do registro, delta na tela, corrigir o snapshot do "Feito") está explicitamente fora de escopo na spec.
- [x] **TDD** (Princípio IV): todos os testes desta feature são escritos e **vistos vermelhos** antes da implementação — inclusive os dois testes de caracterização reescritos (D6), cuja inversão é a prova de que a Parte 1 mudou o que devia.

Nenhuma violação. Complexity Tracking não se aplica.

## Project Structure

### Documentation (this feature)

```text
specs/022-recalculo-pelo-consumo/
├── plan.md              # este arquivo
├── spec.md              # aprovado
├── research.md          # D1–D8
├── data-model.md        # sem entidade nova; o que muda é o CONJUNTO de alavancas
├── quickstart.md        # verificação manual no simulador
├── contracts/
│   └── inalterado.md    # o contrato HTTP não muda — e por quê isso é uma afirmação testável
├── checklists/
│   └── requirements.md
└── tasks.md             # /speckit-tasks (não criado aqui)
```

### Source Code (repository root)

```text
packages/core/src/
├── rebalance.ts              # US2 — alavanca de último recurso em previewTrocaOpcao
└── rebalance.test.ts         # US2 — casos novos (RED antes)

apps/api/src/plan/
└── plan.service.ts           # US1 — apaga o ternário; renomeia p/ calcularAjustePeloConsumo

apps/api/test/
├── today-daytype.e2e-spec.ts # US1 — 2 testes de caracterização reescritos (D6)
├── recalculo-consumo.e2e-spec.ts  # US1 — novo, self-contained via buildScenario
└── rebalance-ultimo-recurso.e2e-spec.ts # US2 — novo, self-contained via buildScenario

apps/mobile/src/
└── RebalancePreviewSheet.tsx # US2 — frase quando a afetada é a própria refeição

docs/adr/
└── 0004-recalculo-pelo-consumo-sem-override.md  # revoga Q1/FR-013a da 004
```

**Structure Decision**: monorepo existente, sem diretório novo. A regra nova entra no núcleo já existente (`rebalance.ts`), não num módulo novo — é uma cláusula na seleção de alavancas, e separá-la criaria uma segunda definição de "alavanca", que é o erro que a `018` documentou.

## Sequenciamento

As duas partes são independentes e podem ser entregues em qualquer ordem; a ordem recomendada é **US1 → US2**, porque a US2 sem a US1 entrega uma prévia coerente sobre uma tela que ainda não reflete o consumo.

Dentro de cada uma, a ordem é TDD estrito: teste vermelho → implementação → verde. O ADR entra junto com a US1 (é o artefato que registra a revogação).

## Estratégia de teste

| Nível             | Onde                                                 | O que trava                                                                                                                                                                                                                              |
| ----------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Núcleo            | `packages/core/src/rebalance.test.ts`                | Gatilho vira alavanca só quando não há outra; segue `sem-alavanca` quando os itens do gatilho são travados/à vontade; item de overlay (locked) nunca vira alavanca; com outra alavanca disponível, o gatilho continua intocado (FR-009). |
| e2e (US1)         | `apps/api/test/recalculo-consumo.e2e-spec.ts`        | "Pulei" sem override → seguintes ajustadas e `rebalanceado: true`; sem registro → planejado puro; registrada não muda; nada é gravado (contagem antes/depois).                                                                           |
| e2e (US2)         | `apps/api/test/rebalance-ultimo-recurso.e2e-spec.ts` | Última refeição não registrada + saldo → `rebalanceado` com a **própria** refeição em `refeicoesAfetadas`, com nome de alimento preenchido (D5); todos travados/à vontade → `recusa-orientada/sem-alavanca`.                             |
| Caracterização    | `apps/api/test/today-daytype.e2e-spec.ts`            | Os 2 testes da Q1 invertem na metade das quantidades e **permanecem idênticos** na metade do `registro` por `mealId` (FR-005/SC-004).                                                                                                    |
| Reversão (SC-003) | suíte `rebalance.e2e-spec.ts` existente              | Desligar a cláusula nova não altera nenhum dos 15 casos calibrados.                                                                                                                                                                      |

Os cenários novos usam `buildScenario` para não depender do seed nem do calendário (KI-004) e para não herdar as suítes já vermelhas por estado do banco de dev (D8.1).

## Riscos

1. **Medir verde absoluto em `today-daytype`/`adesao`/`ciclo` levaria a conclusão errada** — já falham por estado do banco de dev, antes desta feature. Medir o delta do arquivo tocado.
2. **`continue` silencioso no mapper da prévia** (D5): se o lookup de alimento não cobrir o item do gatilho, a resposta vira `rebalanceado` com lista vazia — falha que passa como sucesso. Coberta por asserção explícita de nome de alimento.
3. **Resíduo do "Feito"** (documentado na spec): esta feature generaliza uma divergência já existente entre o que a tela mostra e o que o registro grava. Aceito por decisão do dono; vira spec própria. Nenhuma tarefa aqui.

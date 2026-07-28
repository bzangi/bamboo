# Tasks: Recálculo pelo consumo + gatilho como alavanca de último recurso

**Feature**: `022-recalculo-pelo-consumo` | **Plan**: [plan.md](./plan.md) | **Spec**: [spec.md](./spec.md)

**TDD é obrigatório** (Constituição, Princípio IV): toda task de teste vem antes da de implementação e o teste **deve ser visto vermelho** antes de escrever a implementação. Task de teste que passa de primeira é sinal de teste errado — investigar antes de seguir.

## Phase 1: Setup

Nenhuma. Sem dependência nova, sem migration, sem scaffold. As ferramentas de teste (Vitest em `packages/core` e `apps/api`, `buildScenario` em `@bamboo/db/testing`) já existem.

## Phase 2: Foundational

- [ ] T001 Escrever o ADR `docs/adr/0004-recalculo-pelo-consumo-sem-override.md` revogando a Q1/FR-013a da `004`: o que a decisão antiga dizia, por que existia (era escolha do dono, sem travamento técnico — ver `specs/004-motor-le-registro/research.md:61-67`), o que passa a valer, e o resíduo aceito do "Feito" (spec da 022, seção "Resíduo aceito"). Referenciar a `022` e marcar o ADR-0004 como superseding parcial da decisão Q1. Atende SC-006.

**Checkpoint**: a revogação está registrada antes de o código contradizer o artefato antigo.

---

## Phase 3: User Story 1 — o dia se reequilibra sozinho depois de registrar (P1)

**Goal**: registrar qualquer refeição passa a reajustar as refeições não-registradas do dia, sem exigir troca manual de tipo-de-dia.

**Independent test**: registrar "Pulei" numa refeição de um dia sem override e ver as seguintes ajustadas no `GET /today`.

### Testes (RED antes)

- [ ] T002 [US1] Criar `apps/api/test/recalculo-consumo.e2e-spec.ts`, self-contained via `buildScenario` (`@bamboo/db/testing`), com um dia de 4 refeições, itens flexíveis com grupo de substituição e foods de kcal conhecida. Casos, todos **sem** `?dayTypeId`: (a) sem nenhum registro → `quantityGrams` = planejado em tudo e `rebalanceado: false` em todas as refeições (FR-006); (b) "Pulei" na 3ª refeição → itens flexíveis das não-registradas com `quantityGrams` **maior** que o planejado e `rebalanceado: true` nelas (FR-001/FR-002); (c) a refeição registrada mantém `quantityGrams` planejado e não é marcada como rebalanceada (FR-003); (d) item travado e item "à vontade" inalterados (FR-002); (e) contagens de `meal_event`/`meal_event_item` idênticas antes e depois do GET (FR-012/SC-005). Ver os casos (b)/(c)/(d) **vermelhos** antes da T005.
- [ ] T003 [US1] Reescrever o teste `today-daytype.e2e-spec.ts:333` ("Q1 — … mostra o PLANEJADO … nada ajustado"): renomear citando a `022`/ADR-0004, inverter a asserção de quantidade (planejado → ajustado) e **manter byte-a-byte** a asserção de `registro` por `mealId` (FR-005/SC-004). Ver vermelho na metade da quantidade e verde na metade do registro.
- [ ] T004 [US1] Reescrever o teste `today-daytype.e2e-spec.ts:502` ("009/US3 — … rebalanceado=false em tudo e registro por mealId"): `rebalanceado` passa a ser `true` nas refeições com item flexível ajustado; a asserção de `registro` por `mealId` permanece idêntica. Ver vermelho.

### Implementação

- [ ] T005 [US1] Em `apps/api/src/plan/plan.service.ts:250`, remover o ternário: `calcularTrocaTipoDia` passa a ser chamado sempre. Renomear o método para `calcularAjustePeloConsumo` e atualizar o comentário do bloco 7 (hoje descreve a regra revogada), citando a `022`/ADR-0004. `packages/core` **não** é tocado (D1).
- [ ] T006 [US1] No mesmo `getToday`, passar `registroPorPosition` ao `toTodayResponse` **somente quando há `dayTypeId`** — o `ajuste` vai sempre (D2). Sem parâmetro novo no método privado. Comentar o porquê referenciando `today.mapper.ts:213` e o resíduo `014/A2`.

**Checkpoint**: T002–T004 verdes; `pnpm --filter api test` sem regressão nos demais arquivos (medir delta por arquivo, não verde absoluto — D8.1).

---

## Phase 4: User Story 2 — trocar a opção da última refeição do dia (P2)

**Goal**: escolher outra opção na única refeição ainda ajustável do dia deixa de ser barrado; o motor recalcula a própria refeição.

**Independent test**: registrar tudo menos a última refeição, escolher outra opção nela e receber `rebalanceado` com essa refeição em `refeicoesAfetadas`.

### Testes (RED antes)

- [ ] T007 [P] [US2] Em `packages/core/src/rebalance.test.ts`, casos novos de `previewTrocaOpcao`: (a) todas as não-gatilho registradas + déficit → `rebalanceado` com alavancas cuja `refeicaoPosition` é a do gatilho (FR-007); (b) mesmo cenário com os itens do gatilho todos travados → `recusa-orientada`/`sem-alavanca` (FR-010); (c) idem com todos "à vontade" → `sem-alavanca`; (d) item do gatilho marcado como travado sem grupo (a forma do overlay da `020`) nunca vira alavanca (FR-008/D4); (e) **existindo** outra refeição não-registrada com item flexível, o gatilho continua intocado — nenhuma alavanca com a posição do gatilho (FR-009). Ver (a) e (d)/(e) vermelhos/verdes conforme o esperado antes da T009. Nota: o caso existente `rebalance.test.ts:372` ("todas as não-gatilho registradas → recusa-orientada sem-alavanca") **caracteriza a regra antiga** e precisa ser reescrito ou movido para o cenário (b) — não apagar sem substituir.
- [ ] T008 [P] [US2] Criar `apps/api/test/rebalance-ultimo-recurso.e2e-spec.ts`, self-contained via `buildScenario`: todas as refeições registradas menos a última (com ao menos um "Pulei" para gerar saldo), `POST /rebalance/option-choice` na última → 200 com `outcome.kind === 'rebalanceado'`, `refeicoesAfetadas` contendo a própria refeição-gatilho **com `food.name` preenchido** (D5 — o `continue` do mapper é silencioso); e o caso de refeição-gatilho só com travados/à vontade → `recusa-orientada`/`sem-alavanca` com 200. Verificar 0 escritas (contagem antes/depois).

### Implementação

- [ ] T009 [US2] Em `packages/core/src/rebalance.ts`, dentro de `previewTrocaOpcao`: extrair o conjunto atual para `outras` e, quando vazio, usar os itens flexíveis da refeição de `triggerPosition` (`ehAlavanca`, sem relaxar o predicado). Comentar que é último recurso e por quê ("não existe próxima refeição a preservar"), e que o conjunto vazio continua caindo em `sem-alavanca` no `rebalancearPorKcal`. Não tocar em `previewTrocaTipoDia`.
- [ ] T010 [US2] Em `apps/mobile/src/RebalancePreviewSheet.tsx`, no desfecho `rebalanceado`: quando a única refeição afetada é a do gatilho, usar frase própria (ajuste na própria refeição), com variante para o modo de edição. Comparação inline, sem seletor novo (D7). O botão de confirmar em `recusa-orientada` já está no arquivo (metade-app do FR-010, aplicada antes desta feature) — conferir que segue coerente com os textos novos.

**Checkpoint**: T007/T008 verdes; suíte `rebalance.e2e-spec.ts` verde **com `git diff` vazio** no arquivo (FR-009/SC-003).

---

## Phase 5: Polish & verificação

- [ ] T011 [P] Verificar SC-003 **por reversão**: desligar a cláusula da T009 (voltar `alavancas` ao conjunto de hoje) e confirmar que os 15 casos de `rebalance.e2e-spec.ts` e os casos (e) da T007 não mudam de resultado; religar. Registrar o resultado no relatório final.
- [ ] T012 [P] Verificar D8.3: contagem de queries do `GET /today` igual à de hoje (nenhuma query nova) — o recálculo consome os vigentes já carregados. Comparar com o log SQL do Drizzle, no padrão da medição da `012`.
- [ ] T013 Regenerar o OpenAPI e confirmar contagem de paths e schemas **idênticos** (contracts/inalterado.md). Nenhuma mudança esperada além de descrição, se alguma for editada.
- [ ] T014 Rodar `pnpm lint` e `pnpm format` na raiz + `check-types`; `pnpm --filter mobile exec tsc --noEmit` e `pnpm --filter mobile test`. Nenhuma task fecha com lint ou formatação quebrados (Constituição, "Done de toda task").
- [ ] T015 Atualizar `CLAUDE.md` (bloco SPECKIT) e `docs/estado-atual.md` com o resultado da `022`, incluindo o resíduo aceito do "Feito" e o apontamento para o ADR-0004.
- [ ] T016 Smoke manual no simulador seguindo `quickstart.md` — **designado ao Bruno** (exige julgamento visual e toque). Registrar como pendente no relatório final, não como concluído.

---

## Dependências

```
T001 (ADR)
  └─> US1: T002,T003,T004 (RED, paralelizáveis entre si) ─> T005 ─> T006
                                                              └─> US2: T007,T008 (RED, [P]) ─> T009 ─> T010
                                                                                                  └─> Polish: T011..T016
```

- **US1 e US2 são independentes em código** (arquivos disjuntos: `plan.service.ts` vs `rebalance.ts`/`RebalancePreviewSheet.tsx`). A ordem recomendada é US1 → US2 só por coerência de produto (a US2 sem a US1 mostra prévia coerente sobre tela que ainda não reflete o consumo).
- T003/T004 tocam o **mesmo arquivo** (`today-daytype.e2e-spec.ts`) — não marcar `[P]` entre si.
- T007 e T008 são `[P]`: pacotes diferentes.

## Paralelismo

- T002, T003, T004 podem ser escritos na mesma leva (T003/T004 no mesmo arquivo, em sequência).
- T007 e T008 em paralelo.
- T011, T012 em paralelo no polish.

## MVP

**US1 sozinha é entregável** e resolve a queixa de fundo ("o dia deveria se reequilibrar sozinho"). US2 resolve o sintoma exato reportado e é pequena — a recomendação é entregar as duas na mesma leva.

## Formato

Todas as 16 tasks seguem `- [ ] TID [P?] [Story?] descrição com caminho de arquivo`. Setup e Foundational sem rótulo de story; Phase 3 com `[US1]`; Phase 4 com `[US2]`; Polish sem rótulo.

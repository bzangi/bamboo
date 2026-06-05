# Quickstart — Motor lê o registro

Provar os 2 bugs corrigidos. Pré: Postgres + `.env` + seed. Sem migration (não há schema novo).

## Ordem de implementação (TDD)

1. **Núcleo** (`packages/core`): `rebalance.test.ts` (falha primeiro) com os casos novos; depois `rebalance.ts` — `isRegistered` (obrigatório) em `RefeicaoDia` + filtro em `previewTrocaOpcao`. Atualizar TODOS os literais `RefeicaoDia`: `rebalance.test.ts`, `phase2.edge.test.ts`, `rebalance.service.ts`. `pnpm --filter @bamboo/core test` verde. — *bloqueia o resto.*
2. **Troquei snapshot (Fase 3, D3b)** (`apps/api/src/registro/registro.service.ts`): no troquei, gravar `meal_event_item` = consumo COMPLETO (opção cumprida + overrides; e troquei-por-opção também grava). Atualizar `registro.e2e-spec.ts` (troquei agora cria N linhas). Sem migration.
3. **Helper de consumo** (`apps/api/src/registro-consumo.ts`): carrega `meal_event` por (paciente, plano, `localToday()`) — type-agnostic; reduz com `estadoVigente`; expõe consumo real por refeição + vetor `consumido` agregado.
4. **Casca — trocar opção** (`apps/api/src/rebalance/rebalance.service.ts`): usa o helper; monta `diaComEscolha` com itens reais nas registradas + `isRegistered`. e2e (`rebalance.e2e-spec.ts`) falha primeiro.
5. **Casca — trocar tipo-de-dia** (`apps/api/src/plan/plan.service.ts` + `today.mapper.ts`): com `?dayTypeId` override ativo + consumo, chama `previewTrocaTipoDia` e aplica gramas/nutrition ajustadas só na opção default (casamento por itemId). e2e (`today-daytype.e2e-spec.ts`) falha primeiro.
6. **Mobile**: nenhuma mudança esperada — já renderiza as gramas que vêm do `/today` e os ajustes da prévia de opção. (Smoke test manual.)
7. **Done**: `pnpm lint` + `pnpm format` + testes verdes.

## Cenário de aceitação (manual / e2e)

Com o seed (1 paciente, plano ativo, refeições ordenadas, almoço com opção default + reforçada):

1. **Bug B — não recalcular o feito**: `POST registro {mealId:<café>, intent:"feito"}` → café feito. `POST rebalance/option-choice {triggerMealId:<jantar>, chosenOptionId:<reforçada>}` → a prévia ajusta refeições não-registradas (não o café); **café com grama intacta**.
2. **pulei → déficit**: `POST registro {mealId:<almoço>, intent:"pulei"}`. `POST option-choice` num gatilho qualquer → o restante é sugerido a **aumentar** (déficit), sem furar o piso.
3. **troquei → consumo real**: `POST registro {mealId:<almoço>, intent:"feito", consumo:{chosenOptionId:<não-default mais calórica>}}`. `POST option-choice` → total reflete o real; restante **reduz**.
4. **Bug A — trocar tipo-de-dia recalcula**: com algo consumido, `GET /today?dayTypeId=<outro tipo>` → cardápio do novo tipo com **gramas ajustadas** pelo consumido (difere do planejado). Sem consumo → planejado.
5. **Override ativo no reload**: registrar com `?dayTypeId` ativo e recarregar `GET /today?dayTypeId=<mesmo>` → segue ajustado (override ativo = sempre ajustado). Já o `GET /today` **sem** `dayTypeId` (tipo padrão) → planejado + badges (o padrão não auto-recalcula, Q1).
6. **Sem alavanca**: registrar todas menos o gatilho → `POST option-choice` no gatilho → **recusa orientada** (200), nada abaixo do piso.

## Comandos

```bash
node --env-file=.env --import tsx packages/db/scripts/seed.ts   # seed (idempotente)
pnpm --filter @bamboo/core test                                 # núcleo
pnpm --filter api test:e2e                                       # e2e (seed antes)
pnpm lint && pnpm format                                         # done de task
```

## Verificação de "done" (mapeada aos Success Criteria)

- SC-001: 100% dos option-choice → 0 refeição registrada com grama alterada.
- SC-002: pulei → déficit; restante sugerido a aumentar (dentro do piso).
- SC-003: trocar tipo-de-dia com consumo → cardápio ajustado (≠ planejado).
- SC-004: 0 casos abaixo do piso ou ultrapassando o alvo.
- SC-005: rebalanceamento não persiste (estado inalterado após prévia).
- SC-006: paciente não vê total/desvio/% — só ação por item.

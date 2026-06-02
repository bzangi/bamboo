# Quickstart — Registro pendurado na consulta

Como provar a feature ponta a ponta e a ordem TDD de implementação. Pré-requisito: Postgres acessível + `.env` com `DATABASE_URL` na raiz.

## Ordem de implementação (TDD, respeitando dependências)

1. **Schema** (`packages/db`): adicionar enum `meal_event_state` + tabelas `meal_event`/`meal_event_item` + relations em `schema.ts`; `pnpm --filter @bamboo/db db:generate` (gera `0002_*.sql`); `db:migrate`. Ajustar `seed.ts` (limpeza filhas→pais). — *bloqueia todo o resto.*
2. **Núcleo puro** (`packages/core`): escrever `registro.test.ts` (falha primeiro), depois `registro.ts` (4 funções), exportar no `index.ts`. `pnpm --filter @bamboo/core test` verde. — *depende de nada; pode ir em paralelo ao 1.*
3. **Tipos** (`packages/types`): `registro.ts` (`RegistroRequest`/`Response`) + estender `today.ts` (`currentMealId` nullable, `diaConcluido`, `registro`/`isCurrent` por refeição). — *depende de 2 (reusa `EstadoRegistro`).*
4. **Casca — registro** (`apps/api/src/registro`): escrever `registro.e2e-spec.ts` (falha primeiro), depois module/controller/service/mapper; registrar no `app.module.ts`. — *depende de 1,2,3.*
5. **Casca — today** (`apps/api/src/plan`): estender `getToday` (carregar estado vigente do dia, derivar "o agora" via core) + `today.mapper.ts`. Atualizar `today*.e2e-spec.ts` para `currentMealId` nullable + `registro`/`isCurrent`. — *depende de 1,2,3.*
6. **Mobile** (`apps/mobile`): botões feito/pulei em "o agora", badges de estado nas registradas, POST registro carregando o consumo de sessão (opção + overrides) para derivar troquei. — *depende de 4,5.*
7. **Done**: `pnpm lint` + `pnpm format` (raiz) verdes.

## Cenário de aceitação (manual / e2e)

Com o seed atual (1 paciente "João", 1 plano ativo, refeições ordenadas, almoço de treino com 3 opções, café com 1 item travado):

1. `GET /patients/:id/today` → `currentMealId` = 1ª refeição; toda refeição com `registro: null`.
2. `POST /patients/:id/registro { mealId: <1ª>, intent: "feito", consumo: { chosenOptionId: <default> } }` → 200, `vigente.state="feito"`, `currentMealId` = 2ª.
3. `GET /today` → 1ª com `registro.state="feito"`, 2ª com `isCurrent=true`.
4. `POST registro { mealId: <2ª almoço>, intent:"feito", consumo: { chosenOptionId: <NÃO-default> } }` → `vigente.state="troquei"`.
5. `POST registro { mealId: <2ª>, intent:"feito", consumo:{ chosenOptionId:<default>, items:[{itemId, foodId:<outro do MESMO grupo>, quantityGrams}] } }` → `troquei` (within-group ok).
6. `POST registro { mealId:<3ª>, intent:"pulei" }` → `pulei`, "o agora" avança.
7. Correção: `POST registro { mealId:<3ª>, intent:"feito", consumo:{chosenOptionId:<default>} }` → vigente vira `feito` (última-escrita-vence).
8. Reenvio idêntico do passo 7 → 200, vigente inalterado, **0 duplicata observável**.
9. Desfazer: `POST registro { mealId:<3ª>, intent:"desfazer" }` → `vigente=null`, "o agora" volta para a 3ª.
10. Registrar todas → última retorna `currentMealId=null`, `diaConcluido=true`, 200.
11. IDOR: `POST` com `mealId` de outro paciente → **404**, nada gravado.
12. Within-group inválido: `items` com `foodId` de outro grupo → **422** `consumo-fora-do-grupo`.
13. **Reabrir sessão** (SC-006): após o passo 7, um novo `GET /today` (simulando relançar o app — no v0 stub/stateless é nova consulta ao backend, idêntico a recarregar) → o estado vigente da refeição é o mesmo. Distingue-se do override efêmero das Fases 1/2, que sumiria.

## Comandos

```bash
# migration
pnpm --filter @bamboo/db db:generate && pnpm --filter @bamboo/db db:migrate
# seed (idempotente)
node --env-file=.env --import tsx packages/db/scripts/seed.ts
# testes do núcleo
pnpm --filter @bamboo/core test
# e2e da API (Vitest, fileParallelism:false; banco compartilhado, seed antes)
pnpm --filter @bamboo/api test:e2e
# done de task
pnpm lint && pnpm format
```

## Verificação de "done" (mapeada aos Success Criteria)

- SC-001: registrar em 1 toque (botão feito/pulei direto na refeição, sem tela).
- SC-002: "o agora" avança em 100% dos registros; dia concluído quando todas registradas.
- SC-003: substituição/opção-não-default vira `troquei` com consumo, sem toque extra.
- SC-004: correção reflete última-escrita; reenvio → 0 duplicata observável.
- SC-005: o paciente nunca vê número de adesão (response sem métrica; gate respeitado).
- SC-006: estado persiste após reload e após reabrir a sessão (nova consulta ao backend).

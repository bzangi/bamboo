# Quickstart — 007-ciclo-de-acompanhamento

> Validação manual depois de implementada (papel da nutri via credencial stub, seed-first).

## Pré-requisitos

```bash
docker compose up -d
pnpm --filter @bamboo/db exec drizzle-kit migrate   # aplica a migration 0003
node --env-file=.env --import tsx packages/db/scripts/seed.ts
pnpm --filter api dev                               # NUTRI_API_KEY na .env (fail-closed)
```

```bash
PATIENT=<uuid do paciente do seed>
KEY="x-nutri-key: $NUTRI_API_KEY"
BASE=http://localhost:3333/nutri/patients/$PATIENT
```

## 1. Abrir o ciclo na consulta (US1)

```bash
curl -s -X POST "$BASE/cycles" -H "$KEY" -H 'content-type: application/json' \
  -d '{"expectedDurationDays": 42}' | jq
```

Esperado: `201` com `startedOn = hoje`, `closedOn: null`, vigência inicial = plano ativo. Sem `expectedDurationDays` ⇒ `400`. Abrir de novo ⇒ `201` e o anterior vem em `fechouAnterior` (auto-fechado hoje — sem sobreposição).

## 2. Replanejar no meio (vigência observada)

```bash
PLAN_B=<uuid de outro plano do paciente>   # crie via seed se preciso
curl -s -X POST "$BASE/active-plan" -H "$KEY" -H 'content-type: application/json' \
  -d "{\"planId\": \"$PLAN_B\"}" | jq
curl -s "$BASE/cycles" -H "$KEY" | jq '.cycles[-1].vigencias'
```

Esperado: vigência anterior fechada hoje + nova aberta (mesmo ciclo — 1:N). O app do paciente passa a servir o plano B (a fonte do presente segue o plano ativo).

## 3. Fechar na reavaliação + atribuição (US2/US3)

```bash
curl -s -X POST "$BASE/cycles/close" -H "$KEY" | jq          # fecha hoje
curl -s -X POST "$BASE/cycles/close" -H "$KEY" | jq          # de novo → no-op-orientado
curl -s "$BASE/cycle-do-dia?date=$(date +%F)" -H "$KEY" | jq # dia de hoje → o ciclo (fronteira: o mais recente)
curl -s "$BASE/cycle-do-dia?date=2020-01-01" -H "$KEY" | jq  # → cycleId null (fora de ciclo)
```

## 4. Invariantes

| Checagem                          | Como                                                                    | Esperado                               |
| --------------------------------- | ----------------------------------------------------------------------- | -------------------------------------- |
| Paciente não vê nada (SC-003/006) | `GET /patients/$PATIENT/today` antes/depois                             | resposta idêntica; zero menção a ciclo |
| Registros intactos (SC-004)       | contar `meal_event` antes/depois de fechar                              | mesma contagem/conteúdo                |
| Via negada                        | qualquer rota acima **sem** `x-nutri-key`                               | `403`                                  |
| 1 ativo só (SC-002)               | `select count(*) from cycle where patient_id='…' and closed_on is null` | sempre ≤ 1                             |

## 5. Suítes

```bash
pnpm --filter @bamboo/core test     # baseline 109 + ciclo.test.ts
pnpm --filter api test:e2e          # baseline 78 + ciclo.e2e-spec.ts (seed antes)
pnpm lint && pnpm format
```

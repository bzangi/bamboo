# Quickstart — 006-metrica-adesao

> Validação manual da feature depois de implementada (papel da nutri via credencial stub, seed-first).

## Pré-requisitos

```bash
docker compose up -d                                   # Postgres em localhost:5434
node --env-file=.env --import tsx packages/db/scripts/seed.ts   # re-semear o plano
```

`.env` precisa de **`NUTRI_API_KEY`** (string qualquer não-vazia, ex. `nutri-dev-key`). Sem ela o guard nega tudo (fail-closed). Suba a API: `pnpm --filter api dev`.

## 1. Gerar registro num dia

Pelo app (ou via API do paciente), registre refeições de hoje — ex.: café **feito**, almoço **troquei** (substituição no grupo), lanche **pulei**.

## 2. Consultar a adesão como nutri

```bash
PATIENT=<uuid do paciente do seed>
curl -s "http://localhost:3000/nutri/patients/$PATIENT/adesao?from=$(date +%F)&to=$(date +%F)" \
  -H "x-nutri-key: $NUTRI_API_KEY" | jq
```

Esperado: `days[0].status == "com-dado"`, `valorPct` saturado (100 se o total fechou na faixa), `flags` só com macros fora, `cobertura` = registradas ÷ refeições do tipo, e `media == valorPct` (um dia só).

## 3. Conferir os invariantes

| Checagem              | Como                                               | Esperado                                              |
| --------------------- | -------------------------------------------------- | ----------------------------------------------------- |
| Dia compensado = 100% | pular uma refeição e o total ainda fechar na faixa | `valorPct: 100`, `dentroFaixa: true`                  |
| Sem dado ≠ 0%         | consultar um dia sem registro (`from=to=ontem`)    | `status: "sem-dado"`, sem `valorPct`; fora da `media` |
| Anulação reflete      | desfazer um registro e re-consultar                | dia recalculado (ou `sem-dado` se era o único)        |
| Paciente não vê       | `GET /patients/$PATIENT/today`                     | resposta **sem** qualquer campo de adesão             |
| Via negada (SC-008)   | mesmo `GET /nutri/...` **sem** o header            | `403`                                                 |
| Derivada (FR-009)     | repetir a consulta N vezes                         | mesma resposta; nenhuma escrita no banco              |

## 4. Suítes

```bash
pnpm --filter @bamboo/core test     # baseline 90 + os novos de adesao.test.ts
pnpm --filter api test:e2e          # baseline 61 + adesao.e2e-spec.ts (seed antes; fileParallelism:false)
pnpm lint && pnpm format            # done-gate
```

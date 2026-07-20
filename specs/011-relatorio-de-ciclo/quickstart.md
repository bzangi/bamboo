# Quickstart — 011-relatorio-de-ciclo

## Subir

```bash
docker compose up -d
node --env-file=.env --import tsx packages/db/scripts/seed.ts   # imprime patientId
pnpm --filter api dev                                           # :3333
```

## Montar um cenário de ciclo (via API da nutri)

```bash
export KEY="x-nutri-key: $NUTRI_API_KEY"   # valor do .env
export P=<patientId>

# abrir ciclo (fecha o anterior se houver)
curl -s -X POST localhost:3333/nutri/patients/$P/cycles \
  -H "$KEY" -H 'content-type: application/json' \
  -d '{"expectedDurationDays": 14}'

# gerar registros: usar o app (pnpm mobile:dev) marcando feito/pulei/troquei por alguns dias,
# ou POST /patients/$P/registro direto (ver contrato da 003)

# id do ciclo
curl -s localhost:3333/nutri/patients/$P/cycles -H "$KEY"
```

## Consultar o relatório

```bash
curl -s localhost:3333/nutri/patients/$P/cycles/<cycleId>/report -H "$KEY" | jq
```

Conferir:

1. `cycle.janelaEfetiva` — aberto: `to` = hoje; fechado: `to` = `closedOn`.
2. `adesao.media` bate com `GET /nutri/patients/$P/adesao?from=<from>&to=<to>` (mesma janela).
3. `registro.porRefeicao` — a refeição que você pulou no app aparece com `pulei` > 0.
4. `semanas` — semana 1 = dias 1–7 do ciclo; última parcial marcada.
5. `comparativo` — `null` no primeiro ciclo; abra um segundo ciclo e compare.
6. Sem header `x-nutri-key` ⇒ `403`. Ciclo de outro paciente ⇒ `404`.

## Testes

```bash
pnpm --filter @bamboo/core test    # relatorio.test.ts (agregações puras)
pnpm --filter api test:e2e         # relatorio.e2e-spec.ts (self-contained, limpa tudo)
pnpm lint && pnpm format           # done-gate
```

Disciplina test-first: core RED antes de implementar; e2e RED antes da casca.

## Invariantes rápidas

- O paciente nunca vê nada disso: `GET /patients/$P/today` idêntico antes/depois (SC-003).
- O GET do relatório não escreve nada (SC-006).
- Baselines pós-010 (zero regressão): core 138 · api e2e 119 · mobile 24.

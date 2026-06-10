# Quickstart — 008-auto-classificacao

> Validação manual depois de implementada (operações de lote, seed-first).

## Pré-requisitos

```bash
docker compose up -d
pnpm --filter @bamboo/db exec drizzle-kit migrate    # aplica a migration 0004
```

## 1. Ingerir a base completa (Q2d)

```bash
node --env-file=.env --import tsx packages/db/scripts/ingest-taco.ts
```

Esperado: `~590` alimentos upsertados por `taco_id` com `taco_category`; os 23 curados com `taco_id` backfilled (sem duplicar); excluídos por dados incompletos relatados.

## 2. Re-seed (agora não-destrutivo)

```bash
node --env-file=.env --import tsx packages/db/scripts/seed.ts
```

Esperado: os **13 grupos canônicos** existem (os 4 antigos renomeados, ids preservados — confira que o plano semeado segue íntegro no app); vínculos curados com `origin='manual'`.

## 3. Classificar

```bash
node --env-file=.env --import tsx packages/db/scripts/classify-foods.ts --dry-run   # só o relatório
node --env-file=.env --import tsx packages/db/scripts/classify-foods.ts             # grava
```

Esperado no relatório: cobertura **≥ 80%** dos com-dados-completos (SC-007); sem-grupo com motivo (preparados/industrializados em `categoria-fora-da-taxonomia`; bebidas sem carbo em `nutriente-base-insuficiente`); zero grupo com porção implausível.

## 4. Validar o gabarito (SC-002 — o gatilho de reversão)

```bash
node --env-file=.env --import tsx packages/db/scripts/classify-foods.ts --validar-gabarito
```

Esperado: acerto **≥ 90%** sobre os vínculos curados (exit 0). Reprovou → a vigência "vale imediatamente" volta pro dono (gatilho da spec).

## 5. Invariantes

| Checagem                         | Como                                                               | Esperado                                                                               |
| -------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Re-execução idempotente (FR-010) | rodar classify 2×                                                  | 2ª execução: 0 mudanças                                                                |
| Manual vence (FR-008)            | mover um alimento de grupo no banco (`origin='manual'`) e re-rodar | vínculo intacto                                                                        |
| Re-seed seguro (FR-009)          | re-rodar o seed após classificar                                   | vínculos `auto` e `manual` intactos                                                    |
| Efeito no app                    | `GET /meal-items/:id/substitutions` de um item flexível            | mais opções de troca (alimentos auto-classificados do grupo), quantidades recalculadas |
| Mecânica intacta                 | suítes existentes                                                  | core + e2e verdes sem mudança de baseline além dos casos novos                         |

## 6. Suítes

```bash
pnpm --filter @bamboo/core test     # baseline 120 + classificacao.test.ts
pnpm --filter api test:e2e          # baseline 95 + caso novo em substitutions
pnpm lint && pnpm format
```

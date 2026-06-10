# Contrato — HTTP via `/nutri` (ciclo)

> Todas as rotas sob `@Controller('nutri')` + `NutriKeyGuard` (`x-nutri-key` = env `NUTRI_API_KEY`, fail-closed — mesmo guard da 006, movido pra `apps/api/src/nutri/`). Sem a chave ⇒ `403` (fluxos do paciente nunca alcançam — FR-013/SC-006). `patientId` inexistente ⇒ `404`.

## `POST /nutri/patients/:patientId/cycles` — abrir ciclo

Body: `{ "expectedDurationDays": 42 }` (inteiro > 0, **obrigatório** — FR-003; ausente/inválido ⇒ `400`).

Efeito (transacional): se há ciclo ativo, fecha-o em `hoje` (auto-fechar — FR-002); cria o ciclo (`started_on = hoje`) e grava a **vigência inicial** = plano ativo do paciente. Paciente **sem plano ativo** ⇒ `422` (não há o que vincular — abrir ciclo pressupõe consulta + plano, decisão de produto da spec).

`201` →

```jsonc
{
  "id": "…",
  "startedOn": "2026-06-10",
  "expectedDurationDays": 42,
  "closedOn": null,
  "vigencias": [{ "planId": "…", "validFrom": "2026-06-10", "validTo": null }],
  "fechouAnterior": { "id": "…", "closedOn": "2026-06-10" }, // ou null
}
```

## `POST /nutri/patients/:patientId/cycles/close` — fechar (reavaliação)

Sem body. Com ativo ⇒ `200` com o ciclo fechado (`closedOn = hoje`; vigência corrente recebe `validTo = hoje`). Sem ativo ⇒ `200` com `{ "kind": "no-op-orientado", "motivo": "sem-ciclo-ativo" }` — orienta, nunca destrói (edge da spec).

## `POST /nutri/patients/:patientId/active-plan` — ativar plano (o ato observado)

Body: `{ "planId": "…" }`. Efeito (transacional): desativa o ativo atual, ativa `planId` (`404` se o plano não é do paciente); se há ciclo aberto, fecha a vigência corrente em `hoje` e abre a nova (`replanejar no meio = nova vigência no MESMO ciclo` — Q2-A). Já ativo ⇒ `200` no-op. Sem ciclo aberto: troca acontece, nada de vigência (histórico fora de ciclo).

## `GET /nutri/patients/:patientId/cycles` — linha do tempo

`200` → `{ "cycles": [ { id, startedOn, expectedDurationDays, closedOn, ativo, vigencias: [...] } ] }` em ordem cronológica (`startedOn` asc). Paciente sem ciclo ⇒ lista vazia.

## `GET /nutri/patients/:patientId/cycles/:cycleId` — detalhe (FR-010)

`200` → janela + vigências + **registros do período** (estado vigente por (data, refeição) — anulados não aparecem):

```jsonc
{
  "id": "…",
  "startedOn": "2026-06-01",
  "closedOn": "2026-06-10", // null = ativo (janela corre até hoje)
  "expectedDurationDays": 42,
  "vigencias": [
    { "planId": "A", "validFrom": "2026-06-01", "validTo": "2026-06-05" },
    { "planId": "B", "validFrom": "2026-06-05", "validTo": null },
  ],
  "registros": [
    { "date": "2026-06-02", "mealId": "…", "position": 1, "state": "feito" },
  ],
}
```

`404` se o ciclo não é do paciente. **Nenhuma métrica** junto (FR-010 — adesão/relatório calculam).

## `GET /nutri/patients/:patientId/cycle-do-dia?date=YYYY-MM-DD` — atribuição (FR-009)

`200` → `{ "date": "…", "cycleId": "…" | null }` — exatamente um ciclo ou nenhum, determinístico (núcleo `atribuirCiclo`; fronteira → aberto mais recentemente). `400` se `date` inválida.

## Invariantes (e2e)

1. Em nenhum estado existem dois ciclos ativos do paciente (SC-002 — índice único parcial + transação).
2. Fechar/abrir/ativar não altera **nenhum** `meal_event`/`meal_event_item` (SC-004: mesma contagem e conteúdo).
3. `GET /patients/:id/today` e demais fluxos do paciente: resposta **idêntica** antes/depois de qualquer operação de ciclo (SC-003); nenhuma menção a ciclo em DTO do paciente (SC-006).
4. Toda rota acima sem `x-nutri-key` ⇒ `403` (FR-013).

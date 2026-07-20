# Contrato — HTTP `GET /nutri/patients/:patientId/cycles/:cycleId/report`

> Via **da nutri**: `@Controller('nutri')` + `NutriKeyGuard` (`x-nutri-key` =
> env `NUTRI_API_KEY`, **fail-closed** — mesmo guard da 006/007). Sem a chave ⇒ `403`.
> Consulta **somente-leitura** (SC-006): estado do banco idêntico antes/depois.

## Request

```text
GET /nutri/patients/:patientId/cycles/:cycleId/report
Headers: x-nutri-key: <NUTRI_API_KEY>
```

Sem query params no v0 (a janela deriva do próprio ciclo).

## `200 OK`

```jsonc
{
  "cycle": {
    "id": "…",
    "startedOn": "2026-06-01",
    "closedOn": null, // null = ciclo aberto
    "expectedDurationDays": 42,
    "aberto": true,
    "janelaEfetiva": { "from": "2026-06-01", "to": "2026-06-18" }, // aberto: to = hoje (A2)
  },
  "adesao": {
    "media": 84.2, // média dos dias com-dado; null se nenhum
    "diasComDado": 14,
    "diasSemDado": 4,
    "coberturaMedia": 0.82, // null se nenhum com-dado
    "diasDentroFaixa": 10,
    "flagsFrequencia": {
      // contagens de dias com o macro fora; ausente se 0
      "protein": { "abaixo": 5 },
      "fat": { "acima": 2 },
    },
  },
  "registro": {
    "totais": { "feito": 38, "troquei": 9, "pulei": 6, "semRegistro": 19 },
    "porRefeicao": [
      {
        "position": 1,
        "nome": "Café da manhã",
        "feito": 12,
        "troquei": 1,
        "pulei": 0,
        "semRegistro": 5,
      },
      {
        "position": 2,
        "nome": "Almoço",
        "feito": 14,
        "troquei": 4,
        "pulei": 0,
        "semRegistro": 0,
      },
      {
        "position": 3,
        "nome": "Jantar",
        "feito": 12,
        "troquei": 4,
        "pulei": 6,
        "semRegistro": 14,
      },
    ], // ordem por position
  },
  "semanas": [
    {
      "indice": 1,
      "from": "2026-06-01",
      "to": "2026-06-07",
      "parcial": false,
      "adesao": {
        "media": 91.0,
        "diasComDado": 7,
        "diasSemDado": 0,
        "coberturaMedia": 0.95,
        "diasDentroFaixa": 6,
        "flagsFrequencia": {},
      },
      "registro": { "feito": 18, "troquei": 2, "pulei": 1, "semRegistro": 0 },
    },
    {
      "indice": 3,
      "from": "2026-06-15",
      "to": "2026-06-18",
      "parcial": true, // fatia < 7 dias
      "adesao": {
        "media": null,
        "diasComDado": 0,
        "diasSemDado": 4,
        "coberturaMedia": null,
        "diasDentroFaixa": 0,
        "flagsFrequencia": {},
      }, // semana sem dado APARECE
      "registro": { "feito": 0, "troquei": 0, "pulei": 0, "semRegistro": 12 },
    },
  ],
  "comparativo": {
    // null quando não há ciclo anterior (A3)
    "cicloAnterior": {
      "id": "…",
      "startedOn": "2026-04-15",
      "closedOn": "2026-05-27",
      "adesao": {
        "media": 76.9,
        "diasComDado": 30,
        "diasSemDado": 12,
        "coberturaMedia": 0.71,
        "diasDentroFaixa": 18,
        "flagsFrequencia": { "protein": { "abaixo": 11 } },
      },
      "registroTotais": {
        "feito": 70,
        "troquei": 21,
        "pulei": 15,
        "semRegistro": 62,
      },
    },
    "deltas": {
      // atual − anterior; null se um lado é sem-dado
      "media": 7.3,
      "coberturaMedia": 0.11,
      "taxaFeito": 0.11,
      "taxaTroquei": -0.0,
      "taxaPulei": -0.01,
    },
  },
}
```

Semânticas herdadas (uma régua só — FR-003/FR-009): dia `sem-dado` nunca vira 0%;
`media`/`coberturaMedia` só sobre dias com-dado; estados = **vigentes** (anulado ⇒
sem-registro — D9); tipo-de-dia do alvo pela regra Q3-B da 006.

## Erros

| Status | Quando                                                                    |
| ------ | ------------------------------------------------------------------------- |
| `403`  | `x-nutri-key` ausente/errada (fail-closed) — inclusive fluxos do paciente |
| `404`  | `patientId` inexistente; `cycleId` inexistente ou de outro paciente       |
| `422`  | Janela efetiva do ciclo > 366 dias — mensagem orienta fechar o ciclo (D8) |

Ciclo **sem registros** NÃO é erro: `200` com adesão sem-dado e contagens zeradas (FR-007).

## Invariantes (e2e)

1. Consistência com a 006: para a mesma janela, `adesao.media` do relatório ==
   `media` de `GET /nutri/patients/:id/adesao?from&to`, dia a dia idêntico (SC-002).
2. Nenhuma resposta de endpoint do paciente muda com a feature (SC-003).
3. Somente-leitura: contagens de `meal_event`/`cycle`/`cycle_plan_vigencia` idênticas
   antes/depois do GET (SC-006).
4. Sem a chave ⇒ `403` em 100% dos casos.

## OpenAPI

Modelos novos em `apps/api/src/docs/swagger.models.ts` + regen `pnpm --filter api openapi:gen`
(diff commitado no polish).

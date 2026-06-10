# Contrato — HTTP `GET /nutri/patients/:patientId/adesao`

> Via **da nutri** (FR-016): namespace `/nutri`, protegido por `NutriKeyGuard`. Única superfície que serializa adesão. Nenhum endpoint existente do paciente muda (SC-005/SC-007).

## Guard — `NutriKeyGuard` (módulo `adesao/`)

- Exige header **`x-nutri-key`** estritamente igual a `process.env.NUTRI_API_KEY`.
- **Fail-closed**: env ausente ou vazia ⇒ nega tudo (`403`).
- Header ausente/errado ⇒ `403 Forbidden` — é o caso "requisição com identidade de paciente" (o app/api-client do paciente não conhecem a chave). _(SC-008.)_
- Limite v0 (declarado): a chave dá o papel "nutri do sistema"; escopo por nutri responsável entra com a auth real (dependência do FR-016).

## Request

```text
GET /nutri/patients/:patientId/adesao?from=YYYY-MM-DD&to=YYYY-MM-DD
Headers: x-nutri-key: <NUTRI_API_KEY>
```

Validação estrutural (DTO + `class-validator`, na borda):

- `from`/`to` obrigatórios, formato `YYYY-MM-DD`; `from ≤ to`; período ≤ 366 dias.
- Consulta de **um dia**: `from === to`.
- Inválido ⇒ `400` (ValidationPipe).

## Responses

### `200 OK`

```jsonc
{
  "patientId": "…",
  "from": "2026-06-01",
  "to": "2026-06-07",
  "days": [
    {
      "date": "2026-06-01",
      "status": "com-dado",
      "valorPct": 100, // saturado na faixa de kcal (Q1a-B)
      "dentroFaixa": true, // classificação (FR-006a)
      "flags": { "protein": "abaixo" }, // só macros fora (Q1b-iii); {} se nenhum
      "cobertura": 0.75, // registradas ÷ refeições do tipo do alvo (Q2-B)
    },
    { "date": "2026-06-02", "status": "sem-dado" }, // nunca 0% (SC-006)
    // … um item por dia do período, em ordem cronológica (FR-011)
  ],
  "media": 87.3, // média aritmética dos com-dado; null se nenhum (SC-010)
}
```

Casos que produzem `sem-dado` (D7): dia sem refeição com estado vigente (cobertura zero — inclui anterior ao primeiro registro); data futura; paciente sem plano ativo (todos os dias). **Nunca erro** nesses casos.

### Erros

| Status | Quando                                                                                          |
| ------ | ----------------------------------------------------------------------------------------------- |
| `400`  | Query inválida (formato/ordem/período > 366 dias)                                               |
| `403`  | `x-nutri-key` ausente/errada — **inclusive toda chamada vinda dos fluxos do paciente** (SC-008) |
| `404`  | `patientId` inexistente                                                                         |

## Invariantes de privacidade (e2e)

1. Nenhuma resposta de endpoint existente do paciente (`/patients/:id/today`, `/registro`, `/rebalance/*`, `/meal-items/*`) ganha campo de adesão — mesmo com `exposure = full` (SC-005, US4.2).
2. `GET /nutri/...` sem header ⇒ `403` em 100% dos casos (SC-008).
3. A consulta não escreve nada (FR-009): estado do banco idêntico antes/depois.

# Data Model — 006-metrica-adesao

> **Nenhuma tabela nova, nenhuma migration.** A métrica é 100% derivada (FR-009/FR-014). Este documento mapeia as fontes lidas e as entidades **derivadas** (tipos do core/DTOs), na direção fonte → derivação.

## Fontes (já existentes)

| Fonte                                         | Campos usados                                                                                                                                                | Papel                                                                              |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `meal_event`                                  | `patient_id`, `plan_id`, `meal_id`, `day_type_id` (snapshot 003 FR-014), `chosen_meal_option_id`, `state` (nullable = anulação), `logged_date`, `created_at` | Eventos do período; estado vigente por (data, refeição) via `estadoVigente` (core) |
| `meal_event_item`                             | `meal_event_id`, `food_id`, `quantity_grams`                                                                                                                 | Consumo real do `troquei` (snapshot completo, D3b da Fase 4)                       |
| `meal` / `meal_option` / `meal_item` / `food` | `position`, `day_type_id`, `is_default`, `quantity_grams`, macros por 100g                                                                                   | Consumo do `feito` (opção cumprida) + alvo do dia (opções default do tipo)         |
| `day_schedule`                                | `plan_id`, `weekday`, `day_type_id`                                                                                                                          | Fallback do tipo-de-dia do alvo (Q3-B)                                             |
| `plan`                                        | `patient_id`, `is_active`                                                                                                                                    | Régua corrente: plano ativo na consulta (D8)                                       |
| `patient` / `nutritionist`                    | `band_tolerance_pct` / `default_band_tolerance_pct`                                                                                                          | Tolerância via `resolverParametros` (paciente → nutri → sistema ±10%)              |

## Entidades derivadas (tipos, não tabelas)

### `AdesaoDia` (core — retorno de `adesaoDoDia`)

| Campo         | Tipo                                                           | Regra                                                                                                                   |
| ------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `valorPct`    | `number` (0–100)                                               | Saturado: 100 se kcal dentro da faixa; senão `max(0, 100 − 100×desvioDaBorda/alvo.kcal)`; alvo 0 + consumo > 0 → 0 (D2) |
| `dentroFaixa` | `boolean`                                                      | `avaliarFaixa(...).kcal === 'dentro'` (FR-006a)                                                                         |
| `flags`       | `{ carb, protein, fat: 'acima' \| 'abaixo' }` (só os ≠ dentro) | `avaliarFaixa` nos macros (FR-008)                                                                                      |
| `cobertura`   | `number` (0–1)                                                 | refeições com estado vigente (pareadas por position, D4) ÷ refeições do tipo do alvo (FR-007)                           |

### `ConsumoDia` (casca — retorno do loader por data)

| Campo                                                         | Regra                                                                                                      |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `porMeal: Map<mealId, { position, state, dayTypeId, itens }>` | Só refeições com estado vigente ≠ null; `itens` = feito → opção cumprida; troquei → snapshot; pulei → `[]` |
| `consumido: Nutrientes`                                       | `somaNutrientes` de todos os itens das registradas                                                         |

### `SerieAdesaoResponse` (DTO HTTP — mapper puro)

```text
{
  patientId: string,
  from: 'YYYY-MM-DD', to: 'YYYY-MM-DD',
  days: [
    { date: 'YYYY-MM-DD', status: 'com-dado',
      valorPct: number, dentroFaixa: boolean,
      flags: { carb?: 'acima'|'abaixo', protein?: ..., fat?: ... },
      cobertura: number }
    | { date: 'YYYY-MM-DD', status: 'sem-dado' }   // nunca 0% (SC-006)
  ],                                                // ordem cronológica (FR-011)
  media: number | null                              // média aritmética dos com-dado; null se nenhum (FR-011/SC-010)
}
```

## Invariantes (amarram FRs aos dados)

1. **Derivação total**: nenhuma escrita em banco em nenhum caminho desta feature (FR-009/FR-014) — o módulo `adesao/` só faz SELECT.
2. **Estado vigente**: o mesmo `estadoVigente` (core, last-write-wins + tombstone) da Fase 3/4 decide o que conta — anulação tira a refeição do consumo e da cobertura (SC-004).
3. **Uma régua só**: alvo, tolerância e filtro de eventos vêm do **plano ativo na consulta** (D8); `avaliarFaixa` é a mesma da Fase 2 → adesão e motor nunca discordam sobre "dentro".
4. **Tipo do alvo por data** (Q3-B): snapshot uniforme dos eventos vigentes → tipo; senão `day_schedule[weekday]`. `day_selection` não existe e não é criado.
5. **Sem dado ≠ 0%**: cobertura 0, data futura ou sem plano ativo → `status: 'sem-dado'`, fora da média (D7).
6. **Privacidade**: a via `/nutri/*` é a única que serializa `AdesaoDia`; nenhum DTO existente do paciente ganha campo novo (SC-005/SC-007); guard fail-closed nega identidade de paciente (SC-008).

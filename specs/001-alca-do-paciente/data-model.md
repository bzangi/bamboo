# Data Model — Alça do paciente (Phase 1)

Derivado de `docs/schema.ts` (schema inicial da Fase 0). **Mudança desta feature**: campo `horario` (opcional) em `meal`. O schema migra de `docs/schema.ts` para `packages/db/schema.ts` na T2; este documento é a referência de modelagem da feature (não altera `docs/schema.ts` agora).

> Convenções: PKs `uuid` default random; `created_at` timestamp default now onde aplicável. Valores nutricionais por **100 g**.

## Enums

- **exposure_level**: `hidden` | `percent` | `macros` | `full_kcal` — quanto número o paciente vê (gate da nutri).
- **equivalence_basis**: `carb` | `protein` | `fat` | `kcal` — nutriente preservado na troca dentro de um grupo.

## Entidades

### nutritionist
- `id`, `name`, `email` (único), `created_at`.
- Dono dos grupos customizados e dos pacientes.

### patient
- `id`, `nutritionist_id` → nutritionist (NOT NULL), `name`, `email?`, `phone?`, `height_cm?`, `weight_kg?`, `exposure` (exposure_level, default `hidden`, NOT NULL), `created_at`.
- **Regra de acesso (LGPD)**: dados do paciente são patient-scoped; só o próprio paciente e a nutri responsável acessam.

### food (base TACO)
- `id`, `name`, `source` (default `taco`), `kcal_per_100g`, `carb_per_100g`, `protein_per_100g`, `fat_per_100g`, `fiber_per_100g?`.
- Todos os macros por 100 g (NOT NULL exceto fibra).

### food_household_measure
- `id`, `food_id` → food (NOT NULL), `label` (ex.: "1 colher de sopa cheia"), `grams`.
- Um alimento pode ter **0..N** medidas caseiras. Tradução gramas ↔ linguagem real.

### substitution_group
- `id`, `nutritionist_id?` (null = grupo do sistema/auto; preenchido = custom da nutri), `name` (ex.: "Carboidratos"), `basis` (equivalence_basis, NOT NULL).
- `basis` é o nutriente preservado nas trocas do grupo.

### food_substitution_group (alimento ↔ grupo)
- `id`, `food_id` → food (NOT NULL), `group_id` → substitution_group (NOT NULL), `reference_portion_grams` (NOT NULL).
- A "1 troca" do exchange: porção de referência do alimento dentro do grupo. **Origem do recálculo de quantidade.**
- **Regra**: um alimento pode estar em vários grupos; a substituição opera dentro de **um** grupo (o `substitution_group_id` do item).

### plan
- `id`, `patient_id` → patient (NOT NULL), `name`, `is_active` (default true), `created_at`.
- v0: plano pertence direto ao paciente.

### day_type
- `id`, `plan_id` → plan (NOT NULL), `name` (ex.: "treino", "descanso").
- O plano é um **conjunto** de tipos-de-dia.

### day_schedule (programação semanal)
- `id`, `plan_id` → plan (NOT NULL), `weekday` (0=domingo … 6=sábado), `day_type_id` → day_type (NOT NULL).
- Mapeia cada dia da semana a um tipo-de-dia (default anunciado). **Assumption**: cobre os 7 dias.

### meal (refeição)
- `id`, `day_type_id` → day_type (NOT NULL), `name` (ex.: "Almoço"), `position` (ordem no dia).
- **NOVO `horario` (opcional)** — horário/janela informativo de quando a refeição costuma acontecer. **Tipo a definir na T2** (sugestão: `time` PostgreSQL, ou `text` "HH:MM"; nullable). **Não** dirige "o agora" (FR-006/FR-005a); só exibição.

### meal_option (opção de refeição)
- `id`, `meal_id` → meal (NOT NULL), `label`, `is_default` (default false, NOT NULL).
- Os "3 almoços". Os itens penduram aqui (não na refeição direto). **Regra**: ≥1 opção por refeição; idealmente exatamente uma com `is_default = true`.

### meal_item (item da opção)
- `id`, `meal_option_id` → meal_option (NOT NULL), `food_id` → food (NOT NULL), `quantity_grams` (NOT NULL), `is_locked` (default false, NOT NULL), `substitution_group_id?` → substitution_group.
- **Marcação de flexibilidade**:
  - `is_locked = true` → **travado**: não troca (UI não oferece).
  - `is_locked = false` **e** `substitution_group_id` não-nulo → **flexível**: troca dentro do grupo apontado.
  - `is_locked = false` **e** `substitution_group_id` nulo → não substituível (sem grupo).

## Relacionamentos (resumo)

```
nutritionist 1─* patient 1─* plan 1─* day_type 1─* meal 1─* meal_option 1─* meal_item
plan 1─* day_schedule *─1 day_type
food 1─* food_household_measure
food *─* substitution_group  (via food_substitution_group, c/ reference_portion_grams)
meal_item *─1 food
meal_item *─1 substitution_group  (quando flexível)
```

## Regras de validação relevantes à feature

- **Substituição** (núcleo, via `Result`):
  - alvo deve pertencer ao **mesmo** `substitution_group_id` do item → senão `err(fora-do-grupo)`.
  - alvo deve ter `basisPer100g > 0` para o `basis` do grupo → senão `err(nutriente-base-zero)`.
- **Exposição**: a response de `/today` só inclui números nutricionais permitidos pelo `patient.exposure`.
- **"O agora" (v0)**: `currentMealId` = primeira `meal` por `position` do `day_type` do dia corrente (registro diferido).

## Mudança de schema introduzida por esta feature

| Tabela | Campo | Tipo | Null? | Motivo |
|--------|-------|------|-------|--------|
| `meal` | `horario` | `time` (ou `text` "HH:MM" — decidir na T2) | sim | Informativo: ajuda paciente a se organizar e nutri a planejar. Não dirige "o agora". |

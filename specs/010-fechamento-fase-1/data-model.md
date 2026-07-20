# Data Model — 010-fechamento-fase-1

**Nenhuma mudança de schema. Nenhuma migration. Nada novo é persistido.**

## Atributo derivado (não persistido)

**Nutrição da porção equivalente** de uma alternativa de substituição:

```
nutricao(alvo, gramasEquivalentes) = nutrientesDaPorcao(macrosPer100g(alvo), gramasEquivalentes)
```

- `gramasEquivalentes` já é calculado hoje pelo núcleo (`substituir()` — preserva o
  nutriente-base do grupo). A nutrição é derivada **das mesmas gramas exibidas** (coerência
  visual: o número descreve exatamente a porção oferecida).
- Filtragem pelo gate: `nutritionFor(food, gramas, exposure)` (borda) decide quais campos do
  `NutritionDto` existem por nível (`hidden` → campo ausente; `percent` → só proporções;
  `macros` → gramas dos macros sem kcal; `full_kcal` → tudo).

## Caminho de leitura novo (join, sem escrita)

O endpoint de alternativas passa a resolver o dono do item para obter o gate:

```
meal_item ──(meal_option_id)──> meal_option ──(meal_id)──> meal
    ──(day_type_id)──> day_type ──(plan_id)──> plan ──(patient_id)──> patient.exposure
```

- No v0 o plano pertence direto ao paciente (decisão de modelagem da Fase 0), então o item
  identifica unicamente um `exposure`. Integra-se à query existente do passo 1 do service
  (1 SELECT, joins adicionais).
- Autorização/propriedade continua fora do escopo (EP-3 — auth stub v0); o join é para
  **política de exposição**, não para autenticação.

## Contrato (delta)

`SubstitutionAlternativeDto` (packages/types) ganha campo **opcional**:

```ts
readonly nutrition?: NutritionDto; // ausente quando exposure = 'hidden'
```

`NutritionDto` migra de `today.ts` para `packages/types/src/nutrition.ts` (módulo neutro,
evita ciclo `today ⇄ substitution`); barrel re-exporta — nenhum consumidor muda import.

## Estados & transições

Nenhum novo. O ciclo de vida da troca permanece o da 001/003/005: efêmero na sessão
(`nameOverride`/`consumoOverride` no app) até o registro "feito" derivar **troquei** com
snapshot em `meal_event` / `meal_event_item` (append-only). Esta feature não toca esses
estados — só os torna testados no lado do app (US2a).

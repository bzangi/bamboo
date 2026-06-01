# Data Model — Motor de rebalanceamento (Fase 2)

Reusa o schema da Fase 0/1 (`packages/db/src/schema.ts`). **Único acréscimo de persistência**: 4 colunas de **configuração** nullable (parâmetros de adaptação em 2 níveis) — ver D5. Nenhuma tabela nova; nenhum estado de escolha persiste (FR-026).

> Convenções herdadas: PKs `uuid` default random; valores nutricionais por **100 g**; `created_at` onde aplicável.

## Mudança de schema introduzida por esta feature

Parâmetros de adaptação (faixa-alvo e piso) resolvem em 3 níveis (FR-012a–c). O nível **sistema** é constante no núcleo; os níveis **nutri** e **paciente** viram colunas nullable de config (semeadas no v0):

| Tabela         | Campo                        | Tipo               | Null? | Motivo                                                                 |
| -------------- | ---------------------------- | ------------------ | ----- | ---------------------------------------------------------------------- |
| `nutritionist` | `default_band_tolerance_pct` | `double precision` | sim   | Default da nutri pra largura da faixa-alvo (% por nutriente). Nível 2. |
| `nutritionist` | `default_floor_pct`          | `double precision` | sim   | Default da nutri pro piso (% da quantidade planejada). Nível 2.        |
| `patient`      | `band_tolerance_pct`         | `double precision` | sim   | Override por paciente da largura da faixa-alvo. Nível 1 (vence).       |
| `patient`      | `floor_pct`                  | `double precision` | sim   | Override por paciente do piso. Nível 1 (vence).                        |

- **Null = "cai pro próximo nível"** na resolução (`paciente ?? nutri ?? sistema`).
- Nova migration via `drizzle-kit generate` (idempotente, FK-free).
- **Defaults do sistema** (não vão ao banco): `toleranciaPct = 10`, `pisoPct = 50` — constantes no núcleo.

## Entidades reusadas (sem mudança estrutural)

- **plan / day_type / day_schedule** — o plano é o conjunto de tipos-de-dia + a programação semanal. O **alvo do dia** é derivado, não armazenado.
- **meal** (`position`, `horario?`) — `position` define a ordem do dia. As alavancas do rebalanceamento são as refeições **não registradas exceto a do gatilho** (não "position > gatilho" — ver spec FR-005).
- **meal_option** (`is_default`) — as "3 opções"; a **default** define o alvo; escolher uma não-default é o gatilho P1.
- **meal_item** (`quantity_grams`, `is_locked`, `substitution_group_id?`) — `quantity_grams` é o **planejado** (baseline do piso); flexível (`!is_locked && group != null`) é **alavanca**; travado/sem-grupo nunca é tocado.
- **food / food_household_measure** — macros/100 g + medidas caseiras (pra arredondar a quantidade nova).
- **substitution_group** (`basis`) / **food_substitution_group** (`reference_portion_grams`) — base de equivalência do grupo; sustenta a combinação.
- **patient.exposure** (`exposure_level`) — gate de quanto número aparece na prévia.

## Tipos de domínio do núcleo (conceituais — TS puro, não tabelas)

Definidos nos contratos `core-*.md`; não persistem.

- **Nutrientes**: `{ kcal, carb, protein, fat }` — vetor agregável (soma de `nutrientesDaPorcao`).
- **ParametrosAdaptacao**: `{ toleranciaPct, pisoPct }` — resultado da resolução de 3 níveis.
- **Alavanca**: item flexível ajustável — `{ itemId, refeicaoPosition, macros, gramasPlanejado, gramasAtual, medidas }`. `gramasPlanejado` ancora o piso.
- **RebalanceOutcome**: `sem-acao` | `rebalanceado` (alavancas ajustadas + total depois) | `recusa-orientada` (`estoura-piso` | `sem-alavanca`).
- **CombinacaoResult**: dois alvos com `{ foodId, gramas, medidaCaseira }`, preservando o nutriente-base do item original.
- **Consumo-até-agora** _(conceitual, alimenta o adaptador P3)_: `Nutrientes` do que já foi consumido no dia. **Fonte de dado (o registro) está fora de escopo no v0** — por isso o adaptador P3 existe e é testado, mas no app só a exibição do novo cardápio é alcançável.

## Regras de validação relevantes à feature

- **Faixa-alvo**: por nutriente, `alvo ± toleranciaPct%`. Tudo "dentro" → `sem-acao`.
- **Piso**: alavanca nunca abaixo de `gramasPlanejado × pisoPct/100`. Não absorve sem cruzar → `recusa-orientada(estoura-piso)`.
- **Sem alavanca**: refeições ajustáveis só com travados/sem-grupo → `recusa-orientada(sem-alavanca)`.
- **Combinação**: os dois alvos no mesmo `substitution_group_id` do item (`fora-do-grupo` senão); alvo com `basisPer100g ≤ 0` é excluído (`alvo-sem-nutriente-base`); só item flexível combina.
- **Resolução de parâmetros**: por campo, `paciente ?? nutri ?? sistema`.
- **Exposição**: a prévia só inclui números nutricionais permitidos por `patient.exposure`; nunca "% de caloria".

## Relacionamentos (sem mudança)

```
nutritionist 1─* patient 1─* plan 1─* day_type 1─* meal 1─* meal_option 1─* meal_item
day_type *─1 (alvo derivado das meal_option default)
meal_item *─1 food ; meal_item *─1 substitution_group (quando flexível)
nutritionist ──(config: default_band_tolerance_pct, default_floor_pct)
patient      ──(config: band_tolerance_pct, floor_pct)   # overrides nullable
```

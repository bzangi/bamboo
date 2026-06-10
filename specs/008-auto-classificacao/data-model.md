# Data Model — 008-auto-classificacao

> **Migration `0004`**: 3 colunas novas (nenhuma tabela nova). + A **tabela canônica dos 13 grupos** (com nutriente-base e âncora) que o seed passa a garantir — é a parte que o dono aprova neste gate.

## Migration 0004 (colunas novas)

| Tabela                    | Coluna          | Tipo                                                        | Regras                                                                                                  |
| ------------------------- | --------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `food`                    | `taco_id`       | integer, **unique**, nullable                               | identidade estável do alimento na fonte TACO; upsert da ingestão ampliada; backfill dos 23 curados (D5) |
| `food`                    | `taco_category` | text, nullable                                              | categoria da fonte (o **sinal** da classificação — D1/D2); gravada na ingestão                          |
| `food_substitution_group` | `origin`        | text `'manual' \| 'auto'`, not null, **default `'manual'`** | FR-007: origem de todo vínculo; existentes viram `manual` pelo default (curadoria da fundação — FR-009) |

Sem mudança em `substitution_group` (já tem `nutritionist_id` nullable = grupos do sistema, `basis` = nutriente-base) nem em `meal_item`/planos.

## Os 13 grupos canônicos (⚠️ tabela pro aval do dono — D3/D4/D6)

> `basis` = o nutriente que a troca preserva (`equivalence_basis`). `âncora` = gramas do nutriente-base "por troca" (deriva a porção de referência: `porção = âncora ÷ basisPer100g/100`, arredondada a 5 g). Pros 4 grupos já curados, a âncora vem da **mediana da curadoria existente** (valor abaixo é o fallback se a mediana não puder ser computada).

| Grupo canônico (nome no produto)      | Categoria(s) TACO da fonte            | `basis`                                                       | Âncora (g do nutriente)              | Nota                                                                                     |
| ------------------------------------- | ------------------------------------- | ------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------- |
| Cereais e derivados                   | Cereais e derivados                   | **carb**                                                      | mediana da curadoria (fallback 30 g) | absorve o grupo "Carboidratos" do seed (mantém id/FKs)                                   |
| Verduras, hortaliças e derivados      | Verduras, hortaliças e derivados      | **carb**                                                      | mediana da curadoria (fallback 5 g)  | absorve "Vegetais"                                                                       |
| Frutas e derivados                    | Frutas e derivados                    | **carb**                                                      | mediana da curadoria (fallback 20 g) | absorve "Frutas"                                                                         |
| Gorduras e óleos                      | Gorduras e óleos                      | **fat**                                                       | 10 g                                 | grupo novo                                                                               |
| Pescados e produtos marinhos          | Pescados e frutos do mar              | **protein**                                                   | 25 g                                 | grupo novo                                                                               |
| Carnes e produtos cárneos             | Carnes e derivados                    | **protein**                                                   | mediana da curadoria (fallback 25 g) | absorve "Proteínas"                                                                      |
| Leite e derivados                     | Leite e derivados                     | **protein**                                                   | 8 g                                  | grupo novo                                                                               |
| Ovos e produtos derivados             | Ovos e derivados                      | **protein**                                                   | 13 g                                 | grupo novo (~2 ovos)                                                                     |
| Bebidas (alcoólicas e não alcoólicas) | Bebidas (alcoólicas e não alcoólicas) | **carb**                                                      | 20 g                                 | muitos itens reprovarão na guarda (carb ~0) → sem vínculo, relatados                     |
| Miscelâneas                           | Miscelâneas                           | **carb**                                                      | 20 g                                 | idem                                                                                     |
| Açúcares e produtos                   | Produtos açucarados                   | **carb**                                                      | 20 g                                 | grupo novo                                                                               |
| **Leguminosas e derivados**           | Leguminosas e derivados               | **carb** _(proposta — alternativa: protein; decisão do dono)_ | 14 g                                 | macro dominante real da categoria é carb (feijão cozido ~13,6 carb vs 4,8 protein/100 g) |
| Nozes e sementes                      | Nozes e sementes                      | **fat**                                                       | 15 g                                 | grupo novo                                                                               |

**Fora da taxonomia (sem grupo, relatados — D4):** "Alimentos preparados" (32 itens) e "Outros alimentos industrializados" (5) — preparações/mistos introcáveis até decisão manual (Q3a). A nutri pode vincular caso a caso (vínculo `manual`, vence pra sempre).

## Guardas (valores fixados aqui — Assumption "limiar observável" da spec)

| Guarda                      | Condição de reprovação                                | Efeito                                                                        |
| --------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------- |
| Nutriente-base presente     | teor do `basis` do grupo **< 1 g/100 g**              | sem vínculo, motivo `nutriente-base-insuficiente`                             |
| Porção plausível            | porção derivada **< 10 g ou > 600 g**                 | sem vínculo, motivo `porcao-implausivel`                                      |
| Dados completos             | algum dos 4 macros ausente                            | fora da classificação, motivo `dados-incompletos` (FR-004; ingestão já exige) |
| Categoria fora da taxonomia | preparados/industrializados ou categoria desconhecida | sem vínculo, motivo `categoria-fora-da-taxonomia`                             |

## Fluxo dos dados (fonte → derivação)

1. **Ingestão ampliada** (`ingest-taco.ts`): dataset (597) → `food` upsert por `taco_id` (+ `taco_category`); só linhas com 4 macros; relata excluídos.
2. **Seed** (`seed.ts`, não-destrutivo): upsert dos **13 grupos** (absorvendo os 4 antigos por rename — ids/FKs preservados) + vínculos curados com `origin='manual'`. **Nunca** deleta grupos/vínculos.
3. **Classificação** (`classify-foods.ts`): para cada `food` **sem vínculo**: núcleo `classificarAlimento` → vínculo `origin='auto'` (grupo + `reference_portion_grams` derivada) ou sem-grupo com motivo → relatório de cobertura. Re-execução: só novos sem-vínculo; `manual` e `auto` existentes intactos (FR-010/FR-011).
4. **Consumo** (inalterado): substituições/troquei/motor leem `food_substitution_group` como sempre — o efeito é mais opções.

## Invariantes

1. **FR-007/SC-005**: todo vínculo tem `origin`; relatório distingue manual×auto.
2. **FR-008/FR-009/SC-003**: re-seed e re-classificação NUNCA alteram vínculo `manual`; re-classificação não toca `auto` existente.
3. **FR-002/SC-006**: vínculo `auto` sempre com `reference_portion_grams > 0` e basis ≥ 1 g/100 g (guardas) — zero troca que `substituir()` recusaria.
4. **SC-001**: classificados + sem-grupo-com-motivo = 100% dos alimentos com dados completos (relatório).
5. **SC-002**: `--validar-gabarito` ≥ 90% de acerto sobre os vínculos `manual` — reprovou, **gatilho de reversão da vigência** (volta pro dono).
6. **Um grupo por alimento** (v0): o classificador nunca cria segundo vínculo pra um alimento que já tem um.

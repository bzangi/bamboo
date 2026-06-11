# Data Model — 008-auto-classificacao

> **Migration `0004`**: 3 colunas novas (nenhuma tabela nova). + A **tabela canônica dos ~7 grupos por macro-base** (com nutriente-base e âncora) que o seed passa a garantir.

## Migration 0004 (colunas novas)

| Tabela                    | Coluna          | Tipo                                                        | Regras                                                                                                  |
| ------------------------- | --------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `food`                    | `taco_id`       | integer, **unique**, nullable                               | identidade estável do alimento na fonte TACO; upsert da ingestão ampliada; backfill dos 23 curados (D5) |
| `food`                    | `taco_category` | text, nullable                                              | categoria da fonte (o **sinal** da classificação — D1/D2); gravada na ingestão                          |
| `food_substitution_group` | `origin`        | text `'manual' \| 'auto'`, not null, **default `'manual'`** | FR-007: origem de todo vínculo; existentes viram `manual` pelo default (curadoria da fundação — FR-009) |

Sem mudança em `substitution_group` (já tem `nutritionist_id` nullable = grupos do sistema, `basis` = nutriente-base) nem em `meal_item`/planos.

## Os ~7 grupos canônicos por macro-base (aprovado pelo dono — Sessão 2026-06-10, Q2c)

> `basis` = o nutriente que a troca preserva (`equivalence_basis`). `âncora` = gramas do nutriente-base "por troca" (deriva a porção de referência: `porção = âncora ÷ basisPer100g/100`, arredondada a 5 g, mín. 5). Pros 4 grupos absorvidos do seed, a âncora vem da **mediana da curadoria existente** (fallback abaixo se não computável).
>
> **Decisão de granularidade (Q2c refinada):** os grupos onde a troca acontece são por **macro-base, separando amido/fruta/vegetal** — mais coarse que as 13 categorias TACO (que narrariam a substituição: arroz deixaria de trocar por batata/feijão), mais finos que 3 macro-bases puras (que permitiriam arroz↔alface). A **categoria TACO mapeia pro grupo**; "Verduras, hortaliças e derivados" **divide por perfil** (amiláceo → Amidos; folhoso → Vegetais).

| Grupo canônico             | `basis` | Categorias TACO que mapeiam                                                                                  | Âncora (g do nutriente)              | Nota                                                                            |
| -------------------------- | ------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------ | ------------------------------------------------------------------------------- |
| **Amidos e cereais**       | carb    | Cereais e derivados · Leguminosas e derivados · _Verduras/hortaliças com **carb ≥ 10 g/100 g**_ (tubérculos) | mediana da curadoria (fallback 30 g) | absorve "Carboidratos" do seed (id/FKs); arroz↔batata↔mandioca↔feijão trocáveis |
| **Frutas**                 | carb    | Frutas e derivados                                                                                           | mediana da curadoria (fallback 20 g) | absorve "Frutas"                                                                |
| **Vegetais**               | carb    | _Verduras/hortaliças com **carb < 10 g/100 g**_ (folhosos/não-amiláceos)                                     | mediana da curadoria (fallback 5 g)  | absorve "Vegetais"; alface/brócolis/cenoura/tomate                              |
| **Proteínas**              | protein | Carnes e derivados · Pescados e frutos do mar · Ovos e derivados                                             | mediana da curadoria (fallback 25 g) | absorve "Proteínas"; carne↔peixe↔ovo                                            |
| **Laticínios**             | protein | Leite e derivados                                                                                            | 8 g                                  | grupo novo (âncora baixa: leite ~3 g prot/100 g)                                |
| **Gorduras e oleaginosas** | fat     | Gorduras e óleos · Nozes e sementes                                                                          | 12 g                                 | grupo novo                                                                      |
| **Açúcares**               | carb    | Produtos açucarados                                                                                          | 20 g                                 | grupo novo (mel↔açúcar↔doces)                                                   |

**Split de "Verduras, hortaliças e derivados"** (a única categoria que mapeia pra 2 grupos): a regra de perfil decide — `carb ≥ 10 g/100 g` (amiláceo: batata, mandioca, inhame) → **Amidos**; senão (folhoso/aquoso: alface, brócolis, tomate, cenoura) → **Vegetais**. Validado contra o seed: batata ~12, mandioca ~30 → Amidos; alface ~1.7, brócolis ~4, cenoura ~7.7, tomate ~3 → Vegetais.

**Fora da taxonomia (sem grupo, relatados — D4):** categorias TACO "Bebidas (alcoólicas e não alcoólicas)" (14), "Miscelâneas" (9), "Alimentos preparados" (32) e "Outros alimentos industrializados" (5) **não mapeiam** pra grupo nenhum — heterogêneas/mistas, introcáveis até decisão manual (Q3a). A nutri pode vincular caso a caso (vínculo `manual`, vence pra sempre).

## Guardas (valores fixados aqui — Assumption "limiar observável" da spec)

| Guarda                      | Condição de reprovação                                | Efeito                                                                        |
| --------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------- |
| Nutriente-base presente     | teor do `basis` do grupo **< 1 g/100 g**              | sem vínculo, motivo `nutriente-base-insuficiente`                             |
| Porção plausível            | porção derivada **< 10 g ou > 600 g**                 | sem vínculo, motivo `porcao-implausivel`                                      |
| Dados completos             | algum dos 4 macros ausente                            | fora da classificação, motivo `dados-incompletos` (FR-004; ingestão já exige) |
| Categoria fora da taxonomia | preparados/industrializados ou categoria desconhecida | sem vínculo, motivo `categoria-fora-da-taxonomia`                             |

## Fluxo dos dados (fonte → derivação)

1. **Ingestão ampliada** (`ingest-taco.ts`): dataset (597) → `food` upsert por `taco_id` (+ `taco_category`); só linhas com 4 macros; relata excluídos.
2. **Seed** (`seed.ts`, não-destrutivo): upsert dos **~7 grupos canônicos** (absorvendo os 4 antigos por rename — Carboidratos→Amidos e cereais, Proteínas→Proteínas, Frutas→Frutas, Vegetais→Vegetais; ids/FKs preservados; Laticínios/Gorduras e oleaginosas/Açúcares são novos) + vínculos curados com `origin='manual'`. **Nunca** deleta grupos/vínculos.
3. **Classificação** (`classify-foods.ts`): para cada `food` **sem vínculo**: núcleo `classificarAlimento` → vínculo `origin='auto'` (grupo + `reference_portion_grams` derivada) ou sem-grupo com motivo → relatório de cobertura. Re-execução: só novos sem-vínculo; `manual` e `auto` existentes intactos (FR-010/FR-011).
4. **Consumo** (inalterado): substituições/troquei/motor leem `food_substitution_group` como sempre — o efeito é mais opções.

## Invariantes

1. **FR-007/SC-005**: todo vínculo tem `origin`; relatório distingue manual×auto.
2. **FR-008/FR-009/SC-003**: re-seed e re-classificação NUNCA alteram vínculo `manual`; re-classificação não toca `auto` existente.
3. **FR-002/SC-006**: vínculo `auto` sempre com `reference_portion_grams > 0` e basis ≥ 1 g/100 g (guardas) — zero troca que `substituir()` recusaria.
4. **SC-001**: classificados + sem-grupo-com-motivo = 100% dos alimentos com dados completos (relatório).
5. **SC-002**: `--validar-gabarito` ≥ 90% de acerto sobre os vínculos `manual` — reprovou, **gatilho de reversão da vigência** (volta pro dono).
6. **Um grupo por alimento** (v0): o classificador nunca cria segundo vínculo pra um alimento que já tem um.

# Contrato — operações de lote (scripts, seed-first)

> Não há rota HTTP nova (D8). As três operações são scripts idempotentes da família do seed, rodados com `node --env-file=.env --import tsx …`.

## `packages/db/scripts/ingest-taco.ts` (AMPLIADO — Q2d/D5)

- Ingere **todas** as linhas do dataset com os 4 macros completos (~590 de 597), upsert por **`taco_id`**; grava `taco_category`.
- **Backfill** dos 23 curados: casa por nome da allow-list → seta `taco_id`/`taco_category` neles (mantém id/FKs/nome de exibição).
- Linhas sem os 4 macros: fora, **relatadas** (`[taco] excluídos por dados incompletos: N (ids…)`).
- Continua idempotente e FK-safe (upsert, nunca delete). Modo curado offline preservado como fallback.

## `packages/db/scripts/seed.ts` (NÃO-DESTRUTIVO — D7)

- **Remove** o `DELETE FROM substitution_group`.
- Grupos: upsert por (nome canônico, sistema) — garante os **13 grupos** da tabela (data-model.md), absorvendo os 4 antigos por rename (ids/FKs preservados: Carboidratos→Cereais e derivados, Proteínas→Carnes e produtos cárneos, Frutas→Frutas e derivados, Vegetais→Verduras, hortaliças e derivados).
- Vínculos curados: upsert por (food, group) com **`origin='manual'`**; `reference_portion_grams` da curadoria mantida.
- **Nunca** apaga vínculos (`manual` ou `auto`) — re-seed é seguro após classificar (FR-008/FR-009).

## `packages/db/scripts/classify-foods.ts` (NOVO — D8)

```text
node --env-file=.env --import tsx packages/db/scripts/classify-foods.ts [--validar-gabarito] [--dry-run]
```

- **Lote**: carrega grupos canônicos (+ âncoras: mediana da curadoria por grupo, fallback da tabela), foods **sem vínculo** com dados completos; chama `classificarAlimento` (core) por alimento; insere `food_substitution_group` com `origin='auto'` e a porção derivada.
- **Idempotente/incremental** (FR-010/FR-011): re-execução sobre base inalterada → 0 mudanças; só classifica sem-vínculo; nunca toca `manual` nem `auto` existentes.
- **Relatório de cobertura** (FR-012/SC-001) no stdout: classificados por grupo · sem-grupo por motivo (`dados-incompletos` / `categoria-fora-da-taxonomia` / `nutriente-base-insuficiente` / `porcao-implausivel`) · grupos vazios · % de cobertura sobre os com-dados-completos (meta SC-007 ≥ 80%).
- **`--validar-gabarito`** (SC-002): classifica às cegas os alimentos com vínculo `manual`, compara via `validarGabarito` (core) e imprime acerto + divergências; **exit code 1 se < 90%** (o gatilho de reversão da vigência — volta ao dono).
- **`--dry-run`**: relatório sem escrever.

## Efeito observável na API existente (e2e)

- `GET /meal-items/:id/substitutions` passa a listar alimentos auto-classificados do grupo do item (1 caso novo no e2e de substituições, após rodar o lote no setup).
- Regressão: suítes existentes inalteradas (a mecânica não muda — FR-013/FR-015).

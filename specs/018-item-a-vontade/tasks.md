# Tasks: Item "à vontade"

**Input**: [spec.md](./spec.md) · [plan.md](./plan.md)

**Baseline** (2026-07-26): core **164** · db **20** · api **165** · web **29** · mobile **24**.

**Git**: commits direto na `main`, caminhos explícitos — a 017 está em curso na mesma árvore.

---

## Phase 1: Schema (primeiro, para a migration não colidir)

- [x] **T001** `meal_item.ad_libitum boolean not null default false` no schema + `drizzle-kit
generate`. Gate: `db:migrate` aplica e nenhum item existente muda.

## Phase 2: Núcleo (test-first)

- [x] **T002** **[TDD — ver falhar]** `rebalance.test.ts`: (a) item à vontage não aparece nos
      ajustes; (b) refeição cujos flexíveis são todos à vontade ⇒ recusa `sem-alavanca`.
- [x] **T003** `ItemDia.adLibitum` obrigatório + cláusula em `ehAlavanca`; atualizar os 2 fixtures.

## Phase 3: Casca e contrato

- [x] **T004** `adLibitum` aditivo em `MealItemDto` e `SubstitutionAlternativeDto`.
- [x] **T005** `plan.service` + `today.mapper` (lê a coluna, propaga ao núcleo e ao DTO) +
      `rebalance.service` (4 pontos) + unit do mapper.
- [x] **T006** `substitution.service`: origem à vontade ⇒ alternativas à vontade com `gramas: 0`.
- [x] **T007** `ItemSpec.aVontade` no `buildScenario` (013) — sem isso o e2e não declara o cenário.
- [x] **T008** **[TDD]** e2e novo: `/today` marca · substituições marcadas e sem gramas · alvo do
      dia idêntico com e sem o item (SC-006).

## Phase 4: App e fechamento

- [x] **T009** `HomeScreen`: "à vontade" no lugar da quantidade.
- [x] **T010** Verificação: core 164+2 · api 165+N · mobile 24 · web 29 · lint · Prettier ·
      `check-types` · OpenAPI regenerado.
- [x] **T011** Docs: bloco no `CLAUDE.md`, `estado-atual`, CONTEXT (o termo "à vontade") e o GAP-1
      da transcrição resolvido.

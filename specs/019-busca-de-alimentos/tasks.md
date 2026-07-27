# Tasks: Busca de alimentos (fuzzy) + paginação do catálogo

**Input**: [spec.md](./spec.md) · [plan.md](./plan.md)

**Baseline** (2026-07-27): core **166** · db **20** · api **291** · web **29** · mobile **27**.

**Git**: commits direto na `main`, caminhos explícitos.

---

## Phase 1: Núcleo (test-first)

- [x] **T001** **[TDD — ver falhar]** `packages/core/src/fuzzy.test.ts`: acento/caixa, subsequência,
      não-casamento, ranking por contiguidade e início de palavra, empate estável, termo vazio.
- [x] **T002** `packages/core/src/fuzzy.ts` (`normalizarBusca`, `pontuarFuzzy`, `buscarFuzzy`) +
      export no barril.

## Phase 2: Catálogo (API)

- [x] **T003** `catalogo.service`: pré-filtro por subsequência em SQL, ordenação pelo núcleo, fatia
      `offset`/`limit`, `total` = casados; a `normalizar` privada morre (vira `normalizarBusca`).
- [x] **T004** `catalogo.controller`: `@Query('offset')` + descrição/Swagger.
- [x] **T005** **[TDD]** e2e: páginas disjuntas · `offset` além do total · `total` estável ·
      subsequência acha. Os casos de `%`/`_` literais seguem intocados.

## Phase 3: App do paciente

- [x] **T006** `@bamboo/core` como dependência do `apps/mobile`.
- [x] **T007** `SubstitutionSheet`: campo de busca (a partir de 8 alternativas), filtro pelo núcleo,
      estado vazio distinto de "grupo sem alternativas".
- [x] **T008** `substitution.service`: alternativas com `ORDER BY name, id` (D7).

## Phase 4: Fechamento

- [x] **T009** Verificação: core · api · mobile · db · web verdes; lint · Prettier · `check-types`;
      OpenAPI regenerado.
- [x] **T010** Docs: bloco no `CLAUDE.md` + `docs/estado-atual.md`.

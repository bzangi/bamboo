# Tasks: Visão da nutri — a parte essencial

**Input**: [spec.md](./spec.md) · [plan.md](./plan.md)

**Baseline registrado antes de tocar em nada** (2026-07-26): `apps/api` e2e **151 passed / 15
arquivos** (147 da 013 + 4 da 014, em curso na árvore) · core **164** · mobile **24** · web **0
(sem runner)**.

**Git**: commits direto na `main`, com **caminhos explícitos** — a 014 tem trabalho não
commitado na árvore e não pode ser arrastada para um commit desta feature.

---

## Phase 1: Contrato e endpoint (test-first)

- [x] **T001** DTOs em `packages/types/src/nutri.ts` + export no barril.
- [x] **T002** **[TDD — escrever e VER FALHAR]** `apps/api/test/nutri-patients.e2e-spec.ts` sobre
      `buildScenario`: 403 sem chave · paciente com ciclo aberto → `cicloAtual.aberto` · paciente
      sem ciclo → `null` · dois fechados → o `closedOn` mais recente (SC-001/002/003).
      Gate: falha com 404 antes do controller existir.
- [x] **T003** `apps/api/src/nutri/{nutri.module,patients.controller,patients.service}.ts` +
      registro no `AppModule`. Uma query com `leftJoin`, ordem explícita, mapper puro.
      Gate: T002 verde; suíte inteira ainda 151+4.
- [x] **T004** OpenAPI regenerado (`pnpm --filter api openapi:gen`).

**Checkpoint**: a porta de entrada existe e está protegida.

---

## Phase 2: Casca do web (test-first nas puras)

- [x] **T005** `apps/web`: dependências de workspace (`@bamboo/types`, `@bamboo/api-client`),
      Vitest + `vitest.config.ts` + script `test`, `dev --port 3001` (D8).
- [x] **T006** **[TDD]** `apps/web/lib/format.test.ts` → `format.ts`: `pct100`/`pct01`,
      `delta` com sinal e `null`, `dataCurta`, `diaDoCiclo`, `taxas`, `findPatient` (SC-006).
- [x] **T007** `apps/web/lib/nutri.ts` — server-only, chave da env, `requestJson`; erro de
      configuração e erro de rede com mensagem própria (US3).

**Checkpoint**: os dados chegam tipados e as derivações estão testadas.

---

## Phase 3: As duas telas

- [x] **T008** `app/page.tsx` — roster: nome + estado do ciclo, linha inteira clicável, vazio
      orientado.
- [x] **T009** `app/patients/[patientId]/page.tsx` — adesão dominante, evolução semanal,
      padrão de registro (total + por refeição), comparativo; `await params` (Next 16).
- [x] **T010** `app/nutri.module.css` + tokens no `globals.css` (claro/escuro), foco visível,
      `prefers-reduced-motion`; boilerplate do `create-turbo` apagado.

**Checkpoint**: as telas renderizam com dado real.

---

## Phase 4: Fechamento

- [x] **T011** Verificação: e2e api (151 + novos) · core 164 · mobile 24 · web novos ·
      `check-types` nos 3 apps · `pnpm lint` · Prettier. `git diff` vazio nos e2e
      pré-existentes (SC-004).
- [x] **T012** SC-005 ao vivo: `curl` no HTML das duas telas e grep pela chave (não aparece).
- [x] **T013** `.env.example` documentando `API_URL`/`NUTRI_API_KEY` do web; docs
      (`docs/estado-atual.md`, bloco no `CLAUDE.md`).

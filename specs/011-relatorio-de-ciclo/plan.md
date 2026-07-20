# Implementation Plan: Relatório de ciclo

**Branch**: `011-relatorio-de-ciclo` (planejada na `main`, padrão 006–008/010) | **Date**: 2026-07-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/011-relatorio-de-ciclo/spec.md`

> **Gate duplo pendente** (padrão da 010): spec e plan produzidos juntos a pedido do Bruno;
> gates Specify→Plan e Plan→Tasks apresentados juntos. Conteúdo do relatório já decidido
> pelo dono (adesão + padrão + evolução semanal + comparativo; JSON). A ratificar: defaults
> **A1** (semanas relativas ao início), **A2** (ciclo aberto ⇒ relatório parcial válido),
> **A3** (definição de "ciclo anterior").

## Summary

O relatório é **composição de peças prontas** — nenhuma régua nova:

- `AdesaoService.serie(patientId, from, to)` (006) já devolve a série diária
  (`com-dado`/`sem-dado`, `valorPct`, `dentroFaixa`, `flags`, `cobertura`, `media`) com
  loader batch sem N+1 — o relatório chama para a janela do ciclo (e do anterior).
- `CicloService` (007) já dá a janela (`detalhe`: startedOn/closedOn/vigências + registros
  por estado vigente com `position`) e a lista pra achar o anterior (`linhaDoTempo`).
- `NutriKeyGuard` (`apps/api/src/nutri/`) já protege a via.

O que nasce aqui: **núcleo puro de agregação** (`packages/core/src/relatorio.ts` —
fatiar semanas relativas, agregar adesão/estados, comparar ciclos), um **loader de
refeições esperadas por dia** (posições+nomes do tipo-de-dia do alvo — generaliza o
`carregarTipoAlvo` privado da adesão), a **casca fina** `apps/api/src/relatorio/` com
`GET /nutri/patients/:patientId/cycles/:cycleId/report`, e os DTOs em
`packages/types/src/relatorio.ts`. **Sem migration; nada persiste (FR-008).**

## Technical Context

**Language/Version**: TypeScript 5.9 strict (Node 20+), monorepo pnpm + Turborepo

**Primary Dependencies**: NestJS 11 + Drizzle (`apps/api`) · `@bamboo/core`/`types` (workspace) · `ts-pattern` · Vitest

**Storage**: PostgreSQL 17 — **somente leitura nesta feature** (nenhuma escrita, nenhuma tabela nova — FR-008/SC-006)

**Testing**: Vitest — unit no core (agregações puras, TDD) + e2e da API (`apps/api/test`, `fileParallelism:false`, seed antes; suíte nova **limpa TUDO que criar** — lição a2894f3/KI-001)

**Target Platform**: API Node local (via da nutri; consumidor v0 = a própria nutri via HTTP/JSON — seed-first, sem UI)

**Project Type**: web-service (sem mudança no mobile)

**Performance Goals**: 1 relatório = nº constante de queries (reuso dos loaders batch da 006/007 + 1 loader novo batch); janela ≤ 366 dias × 2 ciclos

**Constraints**: régua de adesão da 006 INTOCADA (FR-003/009 — uma régua só); via exclusiva `/nutri` fail-closed (FR-001); respostas do paciente byte-a-byte idênticas (SC-003); datas date-only (`YYYY-MM-DD`, convenção `localToday` da 003/006 — sem matemática de timezone nova)

**Scale/Scope**: 1 endpoint novo · ~4 funções puras novas no core · 1 módulo novo na casca · DTO novo · e2e novo; board: fecha BAM-23/EP-5

## Constitution Check

- [x] **Núcleo puro** (III): toda agregação nova (semanas, agregados, deltas) em
      `packages/core/src/relatorio.ts` — puro, sem I/O, `Result` onde há entrada inválida;
      reusa `AdesaoDia`/`mediaAdesao` (006) e `CicloJanela` (007).
- [x] **Casca fina** (III): `relatorio.service` só orquestra (serie da 006 + janela/registros
      da 007 + loader novo) e mapeia DTO puro; `Result`→`HttpException` na borda; **zero
      transação/lock** (só leitura).
- [x] **Tese** (I/II): é O produto da tese — ciclo de acompanhamento virando instrumento da
      nutri; nada barra o paciente (ele nem vê).
- [x] **LGPD** (V): superfície exclusiva da nutri atrás do guard fail-closed; invariantes de
      não-vazamento herdadas da 006 re-afirmadas por e2e (SC-003).
- [x] **Escopo** (VI): sem migration, sem dependência nova, sem tabela de relatório
      (derivado); UI/PDF/export deferidos conscientemente.
- [x] **TDD** (IV): core red→green primeiro; e2e cobre aceitação + bordas + guard.

**Complexity Tracking: vazio — nenhuma violação.**

## Project Structure

### Documentation (this feature)

```text
specs/011-relatorio-de-ciclo/
├── spec.md              # QUE/PORQUÊ + A1–A3 pro gate
├── plan.md              # Este arquivo
├── research.md          # D1–D8 (decisões com alternativas)
├── data-model.md        # Nada persiste; shapes derivados + fontes
├── contracts/
│   └── http-relatorio.md  # GET /nutri/.../cycles/:cycleId/report
├── quickstart.md        # Verificação manual + cenários semeados
├── checklists/requirements.md
└── tasks.md             # (/speckit-tasks — após gates)
```

### Source Code (repository root)

```text
packages/core/src/
├── relatorio.ts         # NOVO — fatiarSemanas, agregarAdesao, agregarEstados, compararCiclos
└── relatorio.test.ts    # NOVO — unit TDD (no padrão dos testes do core)

packages/types/src/
├── relatorio.ts         # NOVO — CycleReportResponse e sub-DTOs
└── index.ts             # barrel += relatorio.js

apps/api/src/
├── relatorio/
│   ├── relatorio.module.ts      # NOVO — importa Adesao/Ciclo modules (reuso dos services)
│   ├── relatorio.controller.ts  # NOVO — @Controller('nutri') + NutriKeyGuard
│   ├── relatorio.service.ts     # NOVO — orquestra serie(006) + janela/registros(007) + loader
│   ├── relatorio.loader.ts      # NOVO — refeições esperadas por dia (positions+nomes, batch)
│   └── relatorio.mapper.ts      # NOVO — agregados -> CycleReportResponse (puro)
├── adesao/adesao.service.ts     # AJUSTE MÍNIMO — serie() já é público; carregarTipoAlvo
│                                #   vira base do loader (extração sem mudança de
│                                #   comportamento; e2e da adesão é a rede de segurança)
└── docs/swagger.models.ts       # modelos do relatório + regen OpenAPI

apps/api/test/
└── relatorio.e2e-spec.ts        # NOVO — self-contained: cria ciclos/eventos e LIMPA tudo
```

**Structure Decision**: módulo próprio `relatorio/` (não inflar `ciclo/`): o relatório
depende de adesão E ciclo — é módulo de composição em cima dos dois, com o guard
compartilhado de `nutri/`.

## Desenho por user story

- **US1 (retrato)**: `serie(janela do ciclo)` → `agregarAdesao`; registros do `detalhe`
  (007) + esperados/dia (loader novo) → `agregarEstados` (totais + por position, nome do
  plano vigente); janela + flag `aberto` (closedOn null ⇒ fim efetivo = hoje).
- **US2 (semanas)**: `fatiarSemanas(startedOn, fimEfetivo)` → para cada fatia, recorte da
  série diária + estados → mesmos agregadores por semana; `parcial` quando a fatia < 7 dias.
- **US3 (comparativo)**: `linhaDoTempo` → anterior por A3 (closedOn mais recente anterior ao
  startedOn do atual; desempate: aberto mais recentemente); mesmo pipeline de agregados na
  janela dele → `compararCiclos` (deltas nullable).

## Estratégia de testes (ordem TDD)

1. **Core RED** (`packages/core/src/relatorio.test.ts`): `fatiarSemanas` (múltiplo exato de
   7; não-múltiplo → última parcial; 1 dia; fim < início → `err`); `agregarAdesao` (mistura
   com/sem dado; tudo sem dado → media null; frequência de flags); `agregarEstados` (totais +
   por position; sem-registro = esperado − vigente); `compararCiclos` (deltas; anterior sem
   dado → deltas null). Ver falhar → implementar → verde.
2. **e2e RED** (`apps/api/test/relatorio.e2e-spec.ts`): cria paciente-cenário PRÓPRIO (não o
   do seed compartilhado) com plano/tipos/refeições + ciclos + meal_events conhecidos;
   **afterAll deleta tudo que criou** (ordem reversa de FK). Casos: US1 completo vs valores
   esperados; ciclo aberto parcial; ciclo vazio válido; guard 403 sem chave; 404 ciclo de
   outro paciente; janela > 366 → 422 orientado; semanas (exato/parcial/sem dado);
   comparativo (presente/ausente/anterior-sem-dado); **consistência**: mesmo período em
   `/adesao` e no relatório → valores idênticos (SC-002); **no-write**: contagem de
   `meal_event`/`cycle` antes/depois do GET idêntica (SC-006).
3. **Regressão**: suítes completas + lint + format + regen OpenAPI. Baselines pós-010:
   **core 138 · api e2e 119 · mobile 24** (conferir no T001 da execução).

## Riscos & mitigação

- **Isolamento e2e** (o risco nº 1 do repo): a suíte cria ciclo ativo + eventos → usa
  paciente PRÓPRIO + cleanup completo no `afterAll`; nunca tocar o paciente do seed (o
  índice único de 1-ciclo-ativo/paciente conflitaria com `ciclo.e2e` se vazasse).
- **Divergência de régua** (duas fórmulas de adesão): proibido recalcular — o service consome
  a `serie()` da 006; o e2e de consistência (SC-002) trava isso.
- **Fuso/data**: só date-strings `YYYY-MM-DD` e a mesma convenção de "hoje" da 006
  (`localToday`); `fatiarSemanas` é aritmética de dias pura (sem `Date.now` no core — "hoje"
  entra por parâmetro na casca).
- **N+1 na janela dupla** (atual + anterior): loaders batch (1 chamada de `serie` por ciclo;
  esperados/dia em 1–2 queries por ciclo).
- **`carregarTipoAlvo` privado** (adesão): extração pra reuso é refactor sem mudança de
  comportamento — e2e da adesão existente é a rede; se a extração crescer, plano B: duplicar
  a query no loader novo e declarar a unificação como dívida.

## Fases seguintes (após aprovação dos gates)

- `/speckit-tasks` → tasks.md por user story (test-first), execução autônoma por fase com
  commits na `main` (memória `bamboo-execucao-autonoma-por-fase`).
- Fechamento: OpenAPI regen; docs (`estado-atual.md`, bloco SPECKIT); **EP-5/BAM-23
  concluídos no board** (fecha o épico Acompanhamento). Próximo da fila: UI da nutri (EP-6)
  - auth real/LGPD (EP-3).

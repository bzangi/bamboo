# Implementation Plan: Registro pendurado na consulta — feito / troquei / pulei

**Branch**: `003-registro-consulta` | **Date**: 2026-06-02 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/003-registro-consulta/spec.md`

## Summary

Introduzir a **primeira escrita de estado real do paciente**: o registro pendurado na consulta (feito/troquei/pulei). Abordagem técnica:

- **Núcleo puro** (`packages/core/src/registro.ts`): 4 funções — `classificarEstado` (feito/troquei/pulei + within-group sobre grupos **DB-resolvidos**), `estadoVigente` (last-wins + tombstone), `decidirRegistro` (idempotência alvo-vs-vigente) e `derivarOAgora` (1ª refeição não-registrada). Tudo função pura, `Result` + discriminated union, zero I/O.
- **Schema** (`packages/db`): tabela append-only `meal_event` + filha `meal_event_item` (consumo efetivo do troquei por substituição/combinação). Estado vigente = último evento por (paciente, refeição, dia); desfazer = evento com `state` NULL (anulação).
- **Casca** (`apps/api/src/registro`): endpoint `POST /patients/:patientId/registro` com `db.transaction` (1º na casca `apps/api`) + `pg_advisory_xact_lock` (1º lock do projeto); **resolve no banco** os grupos de equivalência e `is_default` (fronteira de confiança no servidor, nunca no payload); deriva troquei da presença de adequação (nunca de um campo `state`); valida pertencimento refeição→plano-ativo→paciente (LGPD v0). `GET /today` estendido para derivar "o agora" como invariante e expor o estado vigente por refeição.
- **Tipos** (`packages/types`): `RegistroRequest`/`RegistroResponse` + extensão de `TodayResponse`.

Detalhe das decisões em [research.md](./research.md); modelo em [data-model.md](./data-model.md); contratos em [contracts/](./contracts/).

## Technical Context

**Language/Version**: TypeScript strict, Node 20+ (monorepo pnpm + Turborepo)

**Primary Dependencies**: NestJS (casca API), Drizzle ORM + PostgreSQL (`packages/db`), React Native + Expo (mobile), `ts-pattern` (match exaustivo), `Result` à mão (`packages/core/src/result.ts`). Sem novas dependências.

**Storage**: PostgreSQL via Drizzle. Tabelas novas: `meal_event` (append-only) + `meal_event_item`. Migration via `drizzle-kit generate`.

**Testing**: Vitest — núcleo (`packages/core/*.test.ts`) e e2e da API (`apps/api/test/*.e2e-spec.ts`, runner = `vitest run`, `fileParallelism:false`). TDD: teste falha primeiro.

**Target Platform**: API Node server + app Expo (paciente). Núcleo roda nos dois (offline-ready).

**Project Type**: Mobile + API (monorepo). Núcleo puro compartilhado.

**Performance Goals**: N/A (índices de performance deferidos; o que importa é correção). Estado vigente derivado por `DISTINCT ON (meal_id) ... ORDER BY created_at DESC` (1 query, sem N+1).

**Constraints**: Núcleo sem I/O/throw/mutação (Princípio III). Append-only (FR-011). Idempotência por estado-alvo sob concorrência (transação + lock). LGPD: dado de saúde, pertencimento verificado na casca. Auth real fora de escopo (stub v0).

**Scale/Scope**: 1 paciente semeado (v0). Escopo: 1 tabela+filha, 1 módulo API novo, 1 arquivo de núcleo, extensão do `/today`, mobile (botões feito/pulei + badges de estado).

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- [x] **Núcleo puro** (Princípio III): a regra nova (classificar feito/troquei/pulei, within-group, estado vigente, idempotência alvo-vs-vigente, "o agora") vive em `packages/core/src/registro.ts` como funções puras, `Result` + discriminated union, casadas com `ts-pattern`. Confirmado zero I/O/throw/mutação (research D-noio-1).
- [x] **Casca fina** (Princípio III): I/O, `db.transaction`, advisory lock, **resolução de grupos/`is_default` no banco** e conversão `Result`→`HttpException` (opção 1) só em `apps/api/src/registro`. Response via mapper puro (sem entidade Drizzle crua). Validação estrutural na borda usa o padrão **manual** do repo (`UUID_RE` + `BadRequestException`), não class-validator/ValidationPipe — desvio consciente da redação literal do Princípio IV, registrado no Complexity Tracking.
- [x] **Tese** (Princípios I/II): serve "seguir + adequar" (adequar conta como aderente — troquei); respeita "mostra o certo, troca num toque, nunca barra" (1 toque, troquei derivado sem botão, correção/desfazer sem barrar). Sem número de adesão ao paciente.
- [x] **LGPD** (Princípio V): dado de saúde com controle de acesso por **pertencimento** (refeição→plano-ativo→paciente) na casca; sem expor número fora do gate da nutri (FR-016). Endurecimento real de auth **deferido e nomeado** (research D-acl-3) — risco IDOR/impersonação documentado como limite consciente do v0.
- [x] **Escopo** (Princípio VI): dentro do MVP; não liga o motor por consumo real, não materializa ciclo/`day_selection`, não constrói adesão/relatório/offline-sync/UI-nutri. Sem `Effect`/`fp-ts`.
- [x] **TDD** (Princípio IV): testes do núcleo (`registro.test.ts`) e e2e (`registro.e2e-spec.ts`) escritos ANTES da implementação, cobrindo critérios + bordas + erros da spec (incl. IDOR cross-patient).

Nenhum "não". Sem violações a justificar.

## Project Structure

### Documentation (this feature)

```text
specs/003-registro-consulta/
├── plan.md              # Este arquivo
├── spec.md              # Spec aprovada
├── research.md          # Fase 0 — decisões D-*
├── data-model.md        # Fase 1 — meal_event + meal_event_item
├── quickstart.md        # Fase 1 — como testar / fluxo TDD
├── contracts/
│   ├── core-registro.md # Assinaturas das funções puras + Result/erros
│   └── http-registro.md # POST /registro + extensão GET /today
└── checklists/
    └── requirements.md  # Checklist de qualidade da spec (já validado)
```

### Source Code (repository root)

```text
packages/
├── core/src/
│   ├── registro.ts            # NOVO — núcleo puro do registro
│   ├── registro.test.ts       # NOVO — Vitest (test-first)
│   └── index.ts               # + export * from "./registro.js"
├── db/src/
│   └── schema.ts              # + enum meal_event_state, tabelas meal_event / meal_event_item, relations
├── db/migrations/
│   └── 0002_*.sql             # GERADO por drizzle-kit (não escrever à mão)
├── db/scripts/
│   └── seed.ts                # + limpeza de meal_event_item / meal_event (ordem FK)
└── types/src/
    ├── registro.ts            # NOVO — RegistroRequest / RegistroResponse
    ├── today.ts               # + registro por refeição, currentMealId nullable, diaConcluido
    └── index.ts               # + export * from "./registro.js"

apps/
├── api/src/
│   ├── registro/              # NOVO módulo (module, controller, service, mapper)
│   ├── plan/plan.service.ts   # getToday: carrega estado vigente do dia, deriva "o agora"
│   ├── plan/today.mapper.ts   # anexa registro por refeição + currentMealId|null + diaConcluido
│   └── app.module.ts          # + RegistroModule
├── api/test/
│   └── registro.e2e-spec.ts   # NOVO e2e (Vitest)
└── mobile/src/
    └── HomeScreen.tsx          # botões feito/pulei em "o agora", badges de estado, POST registro
```

**Structure Decision**: Mobile + API (monorepo). Regra no núcleo puro compartilhado (`packages/core`), casca em `apps/api`, contratos em `packages/types`, schema em `packages/db`. Segue a constituição e o grão de arquivo já estabelecido (um conceito de domínio = um arquivo no core, com `.test.ts` colado).

## Complexity Tracking

> Sem violações da Constituição a justificar.

Notas de complexidade consciente (não-violações):

| Item                                                                                                                      | Por que                                                                                                                                 | Alternativa mais simples rejeitada porque                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `db.transaction` na casca (1º em `apps/api`; já existe em `seed`/`ingest`) + `pg_advisory_xact_lock` (1º lock do projeto) | FR-012 exige idempotência por estado-alvo sob retry concorrente; CLAUDE.md manda transação+lock em operação sensível                    | UNIQUE constraint não serve (append-only precisa de N linhas por chave); idempotência só na leitura deixa duplo-toque concorrente gravar 2 eventos                                                       |
| Validação estrutural **manual** (`UUID_RE` + `BadRequestException`), não class-validator/ValidationPipe                   | Consistência com o padrão atual do repo (rebalance/combination); ValidationPipe não está registrado e class-validator não é dependência | Introduzir class-validator+ValidationPipe agora é mudança transversal (afeta todos os endpoints) — deve ser PR próprio, não enfiada nesta feature. Desvio da redação literal do Princípio IV, registrado |
| `clientRequestId` **deferido** (não nesta feature)                                                                        | Idempotência da spec é por estado-alvo, não por chave de request                                                                        | Adicionar a coluna agora seria antecipar a robustez de offline-sync (Fase 4) sem requisito atual; nomeado como caminho futuro em research                                                                |
| Correção de **conteúdo** de um troquei via desfazer→re-registrar (não direto)                                             | A UI só oferece a troca em "o agora"; refeição registrada exibe o estado                                                                | Comparar o consumo em `decidirRegistro` (passar payload ao core) adiciona complexidade sem caminho de UX que a exija no v0; limitação documentada                                                        |

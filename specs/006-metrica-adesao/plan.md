# Implementation Plan: Métrica de adesão a partir do registro (só-nutri)

**Branch**: `006-metrica-adesao` | **Date**: 2026-06-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/006-metrica-adesao/spec.md` (gate Specify→Plan fechado na Sessão 2026-06-10; zero marcadores)

## Summary

Métrica de adesão derivada do registro persistido (Fase 3) e do plano vigente, por (paciente, dia), consultável **só pela nutri**. Achado-chave da investigação: **o núcleo já tem quase toda a matemática** — `alvoDoDia` (alvo = dia planejado), `avaliarFaixa` (classificação por nutriente `dentro/acima/abaixo` → a classificação do FR-006a **e** os flags por macro do FR-008 saem dela de graça) e `resolverParametros` (tolerância paciente → nutri → sistema). **Sem migration** — `meal_event.day_type_id` (snapshot do tipo em vigor, 003 FR-014) torna a Q3-B implementável como specada.

- **Núcleo** (`packages/core/src/adesao.ts`, NOVO): `adesaoDoDia` — valor contínuo **saturado na faixa de kcal** (100% dentro; fora, decai pelo desvio relativo a partir da borda mais próxima, clamp 0), classificação dentro/fora, flags por macro (de `avaliarFaixa`), cobertura — e `mediaAdesao` (média aritmética dos dias com dado; vazio → `null`). Tudo puro, `Result` onde há erro estrutural.
- **Casca — carga por período** (`apps/api/src/adesao/adesao-consumo.ts`, NOVO): generalização do padrão de `registro-consumo.ts` para um **intervalo de datas** em queries batch (eventos do range → estado vigente por (data, refeição) → itens feito/troquei/pulei) — sem N+1 por dia.
- **Casca — resolução do alvo por data**: tipo-de-dia = `day_type_id` dos registros vigentes do dia quando uniforme; fallback no `day_schedule` (weekday) — Q3-B. Alvo = `alvoDoDia` das opções default das refeições do tipo; tolerância = `resolverParametros`.
- **Via da nutri** (`apps/api/src/adesao/`, módulo NOVO): `GET /nutri/patients/:patientId/adesao?from&to` protegido por **guard de credencial stub da nutri** (`x-nutri-key` == env `NUTRI_API_KEY`, fail-closed). O app do paciente não possui a chave → requisição com identidade de paciente é **negada** (FR-016/SC-008). Nenhuma resposta existente do paciente muda (FR-013/FR-014/SC-007).

Detalhe em [research.md](./research.md) (D1–D8); modelo em [data-model.md](./data-model.md); contratos em [contracts/](./contracts/).

## Technical Context

**Language/Version**: TypeScript strict, Node 20+ (monorepo pnpm + Turborepo)

**Primary Dependencies**: NestJS (casca), Drizzle + PostgreSQL, `ts-pattern`, `Result` à mão. **Sem novas dependências.**

**Storage**: PostgreSQL. **Nenhuma tabela nova** — lê `meal_event`/`meal_event_item` (Fase 3, incl. `day_type_id` e `logged_date`), plano/opções/itens (Fase 1/2), tolerâncias em `patient`/`nutritionist`.

**Testing**: Vitest — núcleo (`packages/core/src/adesao.test.ts`) e e2e da API (`apps/api/test/adesao.e2e-spec.ts`, `fileParallelism:false`, seed antes). TDD: teste antes.

**Target Platform**: API Node (a métrica é server-side; nada roda no app do paciente).

**Project Type**: Mobile + API (monorepo) — esta feature só toca a API + core.

**Performance Goals**: N/A (1 paciente seed-first). Carga por período em **queries batch** (4 selects por consulta, independente do nº de dias), não por-dia.

**Constraints**: Núcleo sem I/O/throw/mutação (Princípio III). Métrica **derivada sob demanda** (FR-009 — nunca persistida). Paciente nunca vê adesão (FR-013/015/016; SC-005/007/008). Régua corrente: plano ativo + tolerância vigentes na consulta (Assumption aceita no gate). Período limitado (≤ 366 dias por consulta) pra bound nas queries.

**Scale/Scope**: 1 paciente semeado. Escopo: 1 arquivo novo no core (+testes); 1 módulo novo na casca (controller + service + guard + loader + mapper); 1 var de env nova (`NUTRI_API_KEY`); zero mudança no mobile/api-client do paciente.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- [x] **Núcleo puro** (Princípio III): fórmula (saturação/desvio/clamp), flags, cobertura e média em `packages/core/src/adesao.ts` — puro, sem I/O/throw/mutação; reusa `alvoDoDia`/`avaliarFaixa`/`somaNutrientes`/`resolverParametros` (inalterados). Dados entram por parâmetro.
- [x] **Casca fina** (Princípio III): I/O (eventos por range, opções/itens/snapshots, schedule, tolerâncias) e orquestração em `apps/api/src/adesao/`; response via DTO de função pura; `Result`→`HttpException` na borda (opção 1).
- [x] **Tese** (Princípios I/II): mede "% da intenção cumprida", não fidelidade ao papel — adequar conta como aderente (FR-005); faixa não teto (simetria, FR-004/SC-003); devolve valor à nutri sem policiar o paciente.
- [x] **LGPD** (Princípio V): dado de saúde; via da nutri **inalcançável** por identidade de paciente (guard fail-closed, SC-008); zero exposição nos fluxos do paciente (SC-005/007); adesão fora do gate de exposição (FR-015). Limite v0 declarado: a chave stub dá o papel "nutri do sistema" — escopo por nutri responsável endurece com a auth real (dependência já declarada no FR-016 da spec).
- [x] **Escopo** (Princípio VI): só métrica + série + média (FR-011); sem relatório, sem agregações extras, sem UI, sem `day_selection`, sem snapshot de régua. Sem `Effect`/`fp-ts`.
- [x] **TDD** (Princípio IV): testes do núcleo (saturação, bordas, simetria, clamp, alvo-zero, flags, cobertura, média) e e2e (valor por dia, adequação idêntica a "feito", série + média, 403 sem chave, regressão dos fluxos do paciente) escritos ANTES.

Nenhum "não". Sem violações a justificar.

## Project Structure

### Documentation (this feature)

```text
specs/006-metrica-adesao/
├── plan.md · spec.md · research.md · data-model.md · quickstart.md
├── contracts/
│   ├── core-adesao.md    # adesaoDoDia + mediaAdesao (assinaturas, invariantes)
│   └── http-adesao.md    # GET /nutri/patients/:id/adesao + guard x-nutri-key
└── checklists/requirements.md
```

### Source Code (repository root)

```text
packages/core/src/
├── adesao.ts             # NOVO: adesaoDoDia (valor saturado kcal + flags por macro +
│                         #   classificação + cobertura) e mediaAdesao (média dos com-dado)
├── adesao.test.ts        # NOVO: TDD — saturação/borda/simetria/clamp/alvo-zero/flags/média
└── index.ts              # + exports de adesao

apps/api/src/
├── adesao/
│   ├── adesao.module.ts      # NOVO módulo (registrado no AppModule)
│   ├── adesao.controller.ts  # GET /nutri/patients/:patientId/adesao?from&to (+ DTO de query)
│   ├── adesao.service.ts     # orquestra: plano ativo → tipo do dia (Q3-B) → alvo →
│   │                         #   consumo → núcleo → DTO; Result→HttpException na borda
│   ├── adesao-consumo.ts     # NOVO loader batch por (paciente, plano, [from..to]) —
│   │                         #   generaliza o padrão de registro-consumo.ts p/ range
│   ├── adesao.mapper.ts      # DTO de response (função pura; nunca entidade Drizzle)
│   └── nutri-key.guard.ts    # x-nutri-key == env NUTRI_API_KEY; fail-closed (sem env → nega)
└── (fluxos do paciente: INALTERADOS — critério SC-007)

apps/api/test/
└── adesao.e2e-spec.ts    # NOVO: valor/dia · adequação=feito · pulei compensado=100% ·
                          #   série+média · sem-dado (futuro/sem plano/sem registro) ·
                          #   tipos divergentes→fallback · 403 sem/errada chave (SC-008) ·
                          #   /today continua sem adesão (SC-005)

.env.example              # + NUTRI_API_KEY
```

**Structure Decision**: Mobile + API; feature é API-only. Regra no núcleo puro (1 arquivo novo); carga e resolução do alvo na casca (módulo novo isolado em `adesao/` — não toca services existentes); via da nutri num namespace próprio (`/nutri/...`) com guard de credencial stub. Sem schema novo, sem mudança no mobile.

## Complexity Tracking

> Sem violações da Constituição a justificar.

| Item                                                                                       | Por que                                                                                                                                            | Alternativa rejeitada porque                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Guard com credencial stub via env (`NUTRI_API_KEY`) em vez de auth real                    | FR-016 exige no v0 uma via **verificável** inalcançável pelo paciente; auth real é transversal que entra com a web (dependência declarada na spec) | Auth real agora = escopo gigante fora desta feature; endpoint aberto sob path "escondido" = segurança por obscuridade (viola Princípio V); resolver via seed/CLI sem HTTP dificultaria o e2e do SC-008                                |
| Loader de consumo novo (`adesao-consumo.ts`) em vez de reusar `registro-consumo.ts` direto | `registro-consumo` é hardcoded em `localToday()` e por-dia; a série precisa de **range batch** (sem N+1)                                           | Parametrizar a data no helper existente cobriria 1 dia mas não o range; loop por dia = N+1 × 4 queries. O novo loader reusa o MESMO padrão (estadoVigente + feito/troquei/pulei) — duplicação de forma, não de regra (a regra é core) |
| Resolução do tipo-de-dia por data na casca (não no core)                                   | Decidir o tipo exige I/O (eventos do dia + day_schedule por weekday)                                                                               | Pôr no core violaria functional-core; o core recebe o alvo/consumo prontos e só aplica a fórmula                                                                                                                                      |

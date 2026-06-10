# Implementation Plan: Ciclo de acompanhamento como objeto

**Branch**: `007-ciclo-de-acompanhamento` | **Date**: 2026-06-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/007-ciclo-de-acompanhamento/spec.md` (gate fechado na Sessão 2026-06-10: A+C híbrido · vínculo 1:N · vigência = observa · histórico fora de ciclo)

## Summary

Primeira feature com **migration nova** desde a Fase 3: duas tabelas — `cycle` (início, duração prevista obrigatória, fim; **no máximo 1 ativo por paciente**, garantido por índice único parcial) e `cycle_plan_vigencia` (a linha do tempo 1:N de "qual plano vigia quando" **dentro** do ciclo). O ciclo **observa** a vigência: trocar o plano ativo vira uma **operação explícita da casca** (hoje isso só acontece dentro do seed) que, num `db.transaction`, flipa o `plan.is_active` E grava a vigência no ciclo aberto — uma fonte de verdade (o plano ativo), o ciclo só registra o histórico.

- **Núcleo** (`packages/core/src/ciclo.ts`, NOVO): regras puras — `atribuirCiclo` (dado (dia, ciclos), responde **um** ciclo ou nenhum; fronteira fechou-e-reabriu → o aberto **mais recentemente**), `decidirAbertura` (com ativo → instrução de fechar-no-ato; duração obrigatória > 0) e `decidirFechamento` (sem ativo → no-op orientado; prazo vencido NÃO fecha sozinho). Tudo `Result`, sem I/O.
- **Casca** (`apps/api/src/ciclo/`, módulo NOVO na via `/nutri` — mesmo `NutriKeyGuard` da 006, extraído pra `apps/api/src/nutri/`): abrir (POST), fechar (POST), linha do tempo (GET), detalhe com janela + vigências + registros do período (GET), atribuição de um dia (GET) e **ativar plano** (POST — o ato observado). Tudo transacional onde escreve; o paciente não alcança nada disso (403 sem a chave).
- **Zero mudança no app do paciente** (SC-003): nenhum fluxo existente importa o módulo novo; e2e de regressão cobre.

Detalhe em [research.md](./research.md) (D1–D8); modelo/migration em [data-model.md](./data-model.md); contratos em [contracts/](./contracts/).

## Technical Context

**Language/Version**: TypeScript strict, Node 20+ (monorepo pnpm + Turborepo)

**Primary Dependencies**: NestJS (casca), Drizzle + PostgreSQL (migration via drizzle-kit), `ts-pattern`, `Result` à mão. **Sem novas dependências.**

**Storage**: PostgreSQL — **migration `0003`**: tabelas `cycle` + `cycle_plan_vigencia`, índice único parcial (1 ativo/paciente). Nada nas tabelas existentes muda (registro segue ancorado em plano — FR-015 da spec 003 preservado).

**Testing**: Vitest — núcleo (`packages/core/src/ciclo.test.ts`) e e2e (`apps/api/test/ciclo.e2e-spec.ts`; banco compartilhado — mesmas regras da 006: dados próprios/dias passados + cleanup, hoje intacto). TDD: teste antes.

**Target Platform**: API Node. Nada roda no app do paciente.

**Project Type**: Mobile + API (monorepo) — feature é API+DB only.

**Performance Goals**: N/A (1 paciente seed-first). Atribuição é 1 select por consulta.

**Constraints**: Núcleo sem I/O/throw/mutação (Princípio III). Escritas transacionais (abrir = fechar-anterior + abrir + vigência inicial num `db.transaction`). Fechar **não** apaga/altera dado cru (SC-004). Datas em dia-calendário local — **mesma fonte** (`localToday`) do registro (assumption da spec; as duas pontas mudam juntas no fix de fuso).

**Scale/Scope**: 1 paciente semeado. Escopo: 1 arquivo novo no core (+testes); migration 0003; 1 módulo novo na casca (6 rotas `/nutri`); extração do guard pra `src/nutri/` (refactor sem mudança de comportamento); zero mudança no mobile.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- [x] **Núcleo puro** (Princípio III): atribuição/fronteira e regras de abertura/fechamento em `packages/core/src/ciclo.ts` — puro, `Result`, discriminated unions; datas entram como string `YYYY-MM-DD` (comparação lexicográfica, determinística).
- [x] **Casca fina** (Princípio III): I/O (migration, selects, `db.transaction` nas escritas) em `apps/api/src/ciclo/`; `Result`→`HttpException` na borda; DTOs via mapper puro (nunca entidade Drizzle).
- [x] **Tese** (Princípios I/II): o ciclo é o terceiro eixo da diferenciação (acompanhamento) — estrutura o "revisa olhando pra trás"; nada barra o paciente (ele nem vê — FR-008/FR-012).
- [x] **LGPD** (Princípio V): operações e dados de ciclo só na via `/nutri` (guard fail-closed); nenhuma superfície do paciente expõe ciclo (FR-013/SC-006); fechar não destrói dado cru (FR-006).
- [x] **Escopo** (Princípio VI): só o objeto + vigência + atribuição; sem relatório, sem métrica, sem UI, sem alertas, sem agenda. Sem `Effect`/`fp-ts`.
- [x] **TDD** (Princípio IV): testes do núcleo (atribuição/fronteira/não-sobreposição/duração) e e2e (abrir/fechar/auto-fechar/vigência/atribuição/regressão do paciente) ANTES da implementação.

Nenhum "não". Sem violações a justificar.

## Project Structure

### Documentation (this feature)

```text
specs/007-ciclo-de-acompanhamento/
├── plan.md · spec.md · research.md · data-model.md · quickstart.md
├── contracts/
│   ├── core-ciclo.md   # atribuirCiclo + decidirAbertura/decidirFechamento
│   └── http-ciclo.md   # rotas /nutri de ciclo + ativar-plano + guard
└── checklists/requirements.md
```

### Source Code (repository root)

```text
packages/db/src/schema.ts          # + cycle, cyclePlanVigencia (+ relations)
packages/db/migrations/0003_*.sql  # gerada por drizzle-kit

packages/core/src/
├── ciclo.ts             # NOVO: atribuirCiclo, decidirAbertura, decidirFechamento
├── ciclo.test.ts        # NOVO: TDD — fronteira, não-sobreposição, aberto cobre até hoje,
│                        #   fora-de-janela → nenhum, duração inválida, no-ops orientados
└── index.ts             # + exports

apps/api/src/
├── nutri/
│   └── nutri-key.guard.ts   # MOVIDO de adesao/ (compartilhado pela via /nutri; sem mudança)
├── adesao/                   # só atualiza o import do guard
├── ciclo/
│   ├── ciclo.module.ts       # NOVO (registrado no AppModule)
│   ├── ciclo.controller.ts   # POST cycles · POST cycles/close · GET cycles ·
│   │                         #   GET cycles/:cycleId · GET cycle-do-dia?date ·
│   │                         #   POST active-plan  (tudo sob /nutri + guard)
│   ├── ciclo.service.ts      # transações: abrir (auto-fecha anterior + vigência inicial),
│   │                         #   fechar, ativar plano (flip is_active + vigência), leituras
│   └── ciclo.mapper.ts       # DTOs puros (ciclo, linha do tempo, vigências, atribuição)
└── ...

apps/api/test/
└── ciclo.e2e-spec.ts    # NOVO: abrir/duração obrigatória · auto-fechar na reabertura ·
                         #   fechar manual / fechar sem ativo (orientado) · vigência ao
                         #   ativar plano · atribuição (dentro/fronteira/fora) · SC-004
                         #   registros intactos · /today inalterado (SC-003) · 403 sem chave
```

**Structure Decision**: Mobile + API; feature é API+DB. Regra pura no core; objeto/vigência em 2 tabelas novas; operações da nutri na via `/nutri` (guard compartilhado extraído — único toque em código existente, import path). Registro/planos/engine intactos.

## Complexity Tracking

> Sem violações da Constituição a justificar.

| Item                                                                | Por que                                                                                                                                                                                      | Alternativa rejeitada porque                                                                                                                                                                                                    |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Operação explícita **ativar plano** (`POST /nutri/.../active-plan`) | "Observa" exige gravar a vigência **no ato** da troca; hoje a troca só existe dentro do seed — sem o ato exposto, replanejar no meio do ciclo (decisão Q2-A) seria inobservável e intestável | Derivar vigência dos `meal_event.plan_id` (rejeitado: dias sem registro ficam sem resposta e a vigência viraria inferência); trigger no banco (rejeitado: regra de negócio fora do núcleo/casca, invisível e difícil de testar) |
| Índice único **parcial** (`patient_id` where `closed_on is null`)   | FR-002 (1 ativo por paciente) garantido pelo BANCO, não só pela casca — corrida entre dois "abrir" não cria dois ativos                                                                      | Só checagem na casca (rejeitado: corrida; o índice é a garantia barata e declarativa)                                                                                                                                           |
| Mover `NutriKeyGuard` pra `apps/api/src/nutri/`                     | 006 e 007 compartilham a via `/nutri`; duplicar o guard criaria duas fontes da mesma regra de acesso                                                                                         | Importar de `adesao/` (rejeitado: acoplamento de feature a feature; o guard é da VIA, não da adesão)                                                                                                                            |

# Implementation Plan: Auto-classificação de alimentos em grupos de substituição

**Branch**: `008-auto-classificacao` | **Date**: 2026-06-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/008-auto-classificacao/spec.md` (gate fechado nas Sessões 2026-06-10: heurística determinística · vale imediatamente · taxonomia = 13 categorias TACO · ampliação da ingestão inclusa · sem-grupo no ambíguo · um grupo por vínculo · porção derivada com guarda)

> **⚠️ 4 pontos pro aval do dono neste gate** (detalhe no research): (1) a **tabela de nutriente-base por grupo** (D3 — incl. **Leguminosas → carb**, alternativa protein); (2) o refinamento da Q1a: **a categoria vem na própria fonte TACO** (597 alimentos, campo `category`) — o sinal primário vira a categoria (zero palpite) e a heurística por perfil vira guarda + fallback (D2); (3) "Alimentos preparados" e "Outros industrializados" (37 itens) ficam **sem grupo** (são as preparações que o gate mandou deixar introcáveis); (4) os valores da guarda de plausibilidade (porção derivada ∈ [10 g, 600 g]; nutriente-base ≥ 1 g/100 g — D6).

## Summary

A descoberta que simplifica tudo: o dataset TACO já ingerido (`danperrout/tabelataco`, 597 alimentos) **carrega a categoria de cada alimento** — e a taxonomia aprovada pelo dono É a taxonomia da TACO. Então a classificação automática não precisa adivinhar: **categoria da fonte → grupo canônico** (mapeamento 15→13 fixo), com a **heurística por perfil nutricional como guarda** (nutriente-base > 0, porção plausível — senão "sem confiança", relatado) **e como fallback** pra alimentos futuros sem categoria (import por IA da Fase 4).

- **Migration 0004**: `food.taco_id` (unique, nullable — identidade estável pro upsert da base ampliada), `food.taco_category` (text, nullable — o sinal), `food_substitution_group.origin` (`'manual' | 'auto'`, default manual — FR-007).
- **Ingestão ampliada** (Q2d): `ingest-taco.ts` passa a ingerir **todas** as linhas com os 4 macros completos (~590), upsert por `taco_id` (os 23 curados recebem backfill de `taco_id` por nome — sem duplicar), gravando `taco_category`.
- **Seed não-destrutivo** (dependência declarada na spec): `seed.ts` troca o `DELETE FROM substitution_group` por **upsert por nome** (grupos) e upsert por (food, group) com `origin='manual'` (vínculos curados) — re-seed preserva automáticos e manuais.
- **Núcleo** (`packages/core/src/classificacao.ts`, NOVO): `classificarAlimento` — função pura: (categoria?, macros, grupos com basis, âncoras) → `vinculo {grupo, porção derivada}` | `sem-grupo {motivo}`; guardas explícitas; `validarGabarito` (SC-002) também puro.
- **Casca** (`packages/db/scripts/classify-foods.ts`, NOVO): operação em lote re-executável — carrega foods/grupos/vínculos, roda o núcleo só nos **sem vínculo**, insere `origin='auto'`, imprime o **relatório de cobertura** (classificados por grupo / sem-grupo com motivo / grupos vazios) e tem modo `--validar-gabarito` (classifica às cegas os curados e compara — SC-002 ≥ 90%).
- **Zero mudança** na matemática de substituição/rebalanceamento/registro e no app do paciente (mais opções de troca é o único efeito — e2e de regressão cobre).

Detalhe em [research.md](./research.md) (D1–D9); modelo/migration/tabela de grupos em [data-model.md](./data-model.md); contratos em [contracts/](./contracts/).

## Technical Context

**Language/Version**: TypeScript strict, Node 20+ (monorepo pnpm + Turborepo)

**Primary Dependencies**: Drizzle + PostgreSQL (migration 0004), TS puro no núcleo. **Sem novas dependências; sem IA/LLM** (deferida pro import da Fase 4).

**Storage**: PostgreSQL — migration **0004** (3 colunas novas; nenhuma tabela nova). Dados: dataset TACO público já usado pela ingestão (fonte fiel da NEPA/UNICAMP).

**Testing**: Vitest — núcleo (`packages/core/src/classificacao.test.ts`: mapeamento, guardas, porção derivada, sem-grupo, gabarito) + smoke do script no quickstart (banco real). e2e da API: só regressão (suítes existentes) + um caso novo no fluxo de substituições (alimento auto-classificado aparece como opção de troca). TDD: teste antes.

**Target Platform**: scripts Node (operação interna, seed-first) + efeitos visíveis via API existente.

**Project Type**: DB/Core + scripts (monorepo) — sem rota HTTP nova.

**Performance Goals**: lote de ~600 alimentos numa execução — trivial (1 passada, queries batch).

**Constraints**: núcleo sem I/O/throw/mutação; classificação **idempotente** e **incremental** (só sem-vínculo; manual NUNCA sobrescrito); valores nutricionais reais, nunca inventados (FR-004); um grupo por alimento no v0.

**Scale/Scope**: 1 arquivo novo no core (+testes); migration 0004; ingest ampliado; seed refatorado pra upsert; 1 script novo; 13 grupos canônicos semeados.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- [x] **Núcleo puro** (Princípio III): mapeamento categoria→grupo, guardas de confiança, derivação da porção e validação do gabarito em `packages/core/src/classificacao.ts` — puro, `Result`, sem I/O. O script é casca fina (carrega → núcleo → upsert → relatório).
- [x] **Casca fina** (Princípio III): I/O nos scripts (`ingest-taco`/`seed`/`classify-foods`) com upserts idempotentes; nenhuma regra de negócio em SQL.
- [x] **Tese** (Princípio I): escala a substituição (o coração do "adaptar") da curadoria de 16 vínculos pra base inteira — mais opções de troca pro paciente sem trabalho manual da nutri.
- [x] **LGPD/clínico** (Princípio V): desvio consciente "vale imediatamente" **registrado e aprovado no gate da spec**, com gatilho de reversão (SC-002 < 90% → revisão prévia); origem em todo vínculo (transparência); valores nutricionais nunca inventados; correção manual vence pra sempre.
- [x] **Escopo** (Princípio VI): sem UI, sem IA, sem multi-grupo, sem re-classificação de automáticos existentes, sem outras bases (TBCA). A ampliação da ingestão TACO está DENTRO por decisão do dono (Q2d).
- [x] **TDD** (Princípio IV): testes do núcleo (incl. gabarito sintético) ANTES; validação às cegas real no modo `--validar-gabarito` antes de dar a feature por pronta.

Nenhum "não". Sem violações a justificar.

## Project Structure

### Documentation (this feature)

```text
specs/008-auto-classificacao/
├── plan.md · spec.md · research.md · data-model.md · quickstart.md
├── contracts/
│   ├── core-classificacao.md   # classificarAlimento + validarGabarito
│   └── cli-classificacao.md    # classify-foods.ts (lote, relatório, --validar-gabarito)
└── checklists/requirements.md
```

### Source Code (repository root)

```text
packages/db/
├── src/schema.ts                  # + food.taco_id (unique) + food.taco_category + fsg.origin
├── migrations/0004_*.sql          # gerada por drizzle-kit
└── scripts/
    ├── ingest-taco.ts             # AMPLIADO: base completa (~590) por taco_id + categoria
    ├── seed.ts                    # NÃO-DESTRUTIVO: upsert de grupos (13 canônicos) e vínculos
    │                              #   curados com origin='manual'
    └── classify-foods.ts          # NOVO: lote re-executável + relatório + --validar-gabarito

packages/core/src/
├── classificacao.ts               # NOVO: classificarAlimento (categoria→grupo + guardas +
│                                  #   porção derivada) e validarGabarito (SC-002)
├── classificacao.test.ts          # NOVO: TDD
└── index.ts                       # + exports

apps/api/test/
└── substitutions.e2e-spec.ts      # + 1 caso: alimento auto-classificado vira opção de troca
                                   #   (após rodar a classificação no setup do teste)
```

**Structure Decision**: feature de dados (DB/Core + scripts) — a regra no núcleo puro; ingestão/seed/classificação como operações idempotentes de casca; nenhuma rota HTTP nova (a "consulta" da cobertura é o relatório do script no v0). A API existente ganha cobertura de graça.

## Complexity Tracking

> Sem violações da Constituição a justificar.

| Item                                                                                      | Por que                                                                                                                                                                      | Alternativa rejeitada porque                                                                                                                                                         |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Refinar Q1a: **categoria da fonte como sinal primário** (heurística como guarda/fallback) | A taxonomia aprovada É a da TACO e o dataset traz `category` — usar o dado real é mais determinístico e explicável que inferir do perfil; zero erro de encaixe na base atual | Heurística pura por perfil pra TODOS (rejeitado: reintroduz erro evitável — banana vs arroz — exatamente o caso difícil apontado na spec); decisão levada ao aval do dono neste gate |
| `food.taco_id` (migration 0004)                                                           | Upsert por nome duplicaria os 23 curados (nomes de exibição ≠ descrições do dataset); o id da TACO é a identidade estável da base ampliada                                   | Match por nome normalizado (rejeitado: frágil, é exatamente o bug que id evita)                                                                                                      |
| Seed vira upsert (não-destrutivo)                                                         | O `DELETE FROM substitution_group` atual apagaria vínculos automáticos E manuais a cada re-seed — FR-008/FR-009/SC-003 seriam inalcançáveis (dependência declarada na spec)  | Manter seed destrutivo e "não rodar seed depois de classificar" (rejeitado: regra de operação implícita, quebra o "roda quantas vezes quiser" do seed-first)                         |

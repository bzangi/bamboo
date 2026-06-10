# Implementation Plan: Coerência da troca de tipo-de-dia após consumo (refeição registrada + sinal de rebalanceamento)

**Branch**: `009-sinal-rebalanceamento` | **Date**: 2026-06-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/009-sinal-rebalanceamento/spec.md`

## Summary

Tornar **visível** a reconciliação que o motor já faz na troca de tipo-de-dia (e na troca de opção), sem mexer na matemática. Duas peças coordenadas:

1. **Badge da refeição registrada pareado por posição** — com override de tipo-de-dia ativo, a refeição da mesma `position` de uma já registrada hoje exibe o estado de registro (feito/troquei/pulei). Reusa o campo `registro` que **já existe** no contrato `GET /today` → mudança de **lógica** na casca, não de contrato.
2. **Sinal "ajustado" por refeição** — refeições com gramatura recalculada exibem um sinal (frase curta de porquê, sem número), persistente enquanto o ajuste vigora. Para o caminho de **troca de tipo-de-dia**, o servidor expõe um campo **aditivo e não-quebrável** `rebalanceado: boolean` por refeição. Para o caminho de **troca de opção**, o app já tem os ajustes em sessão (feature 005) e deriva o sinal localmente — sem tocar a API.

Sem mudança no `packages/core` (motor intocado). Logica nova vive na casca (`apps/api/src/plan`) e no app (`apps/mobile`), com derivação pura testável.

## Technical Context

**Language/Version**: TypeScript strict (Node 20+) · React Native/Expo (SDK 56)

**Primary Dependencies**: NestJS + Drizzle (apps/api) · Expo/React Native (apps/mobile) · DTOs em `@bamboo/types` · `ts-pattern` (match exaustivo de estado)

**Storage**: PostgreSQL via Drizzle — **somente leitura** nesta feature (nada novo persistido; deriva de `meal_event`/`meal_event_item` já existentes)

**Testing**: Vitest — unit nos mapeadores puros (apps/api) + e2e em `apps/api/test/today-daytype.e2e-spec.ts` + Vitest no seletor puro do app (apps/mobile, infra da 005)

**Target Platform**: API (servidor) + app do paciente (mobile)

**Project Type**: Mobile + API (monorepo pnpm/Turborepo)

**Performance Goals**: derivação O(refeições) por requisição; sem query nova além do `carregarConsumoDoDia` que o caminho de override já executa

**Constraints**: "nunca barra" (sinal informativo, jamais bloqueia) · sem número/percentual no sinal · contrato `GET /today` só ganha campo **aditivo** (clientes que o ignoram seguem válidos) · matemática do motor inalterada

**Scale/Scope**: 2 peças · ~1 campo de DTO aditivo · ~2 funções puras na casca · 1 seletor puro + render no app · 0 migrations · 0 mudança no core

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **Núcleo puro** (Princípio III): **nenhuma regra de domínio nova** — a matemática do motor (`packages/core`) não muda. A derivação (badge por posição; flag `rebalanceado`) é **mapeamento de apresentação** e vive em funções **puras** no mapper da casca (`apps/api/src/plan/today.mapper.ts`), como já fazem `derivarOAgora`/gate de exposição. Sem I/O, sem `throw`, sem mutação.
- [x] **Casca fina** (Princípio III): I/O (leitura do consumo) fica em `plan.service`; conversão para DTO via funções puras do mapper; nada de entidade Drizzle crua na resposta.
- [x] **Tese** (Princípios I/II): serve "seguir + adequar" tornando a adaptação perceptível; respeita "ação, não número" (frase sem número/percentual), "nunca barra" (sinal informativo) e "default anunciado".
- [x] **LGPD** (Princípio V): nenhum dado de saúde novo exposto; badge/flag são do próprio paciente, pro próprio paciente; gate de exposição de nutrição inalterado; `rebalanceado` é booleano (não vaza macro/kcal).
- [x] **Escopo** (Princípio VI): mínimo — 1 campo aditivo + derivação + render. Sem infra deferida (`Effect`/`fp-ts`). Sem nova entidade/migration.
- [x] **TDD** (Princípio IV): testes antes — unit dos mapeadores puros + e2e do `/today?dayTypeId` + Vitest do seletor do app, cobrindo critérios, bordas (sem-ajuste, posição sem par, registrada-não-sinaliza) e o invariante "gramatura inalterada".

Nenhum "não". Uma nota de escopo (campo aditivo na API) registrada no Complexity Tracking — é decisão consciente do gate, não violação.

## Project Structure

### Documentation (this feature)

```text
specs/009-sinal-rebalanceamento/
├── plan.md              # Este arquivo
├── research.md          # Decisões D1–D7 (Phase 0)
├── data-model.md        # Conceitos de apresentação + adição no DTO (Phase 1)
├── quickstart.md        # Roteiro de verificação (Phase 1)
├── contracts/
│   └── http-sinal.md    # Adição aditiva no GET /today + regra registro-por-posição
└── checklists/
    └── requirements.md  # (do Specify)
```

### Source Code (repository root)

```text
packages/types/src/
└── today.ts             # +campo aditivo `rebalanceado: boolean` em MealDto

apps/api/src/plan/
├── today.mapper.ts      # toMealDto: deriva `rebalanceado` (item no mapa ajuste);
│                        # registro por posição quando override ativo (função pura nova)
├── plan.service.ts      # getToday: carrega consumo 1x; deriva registroPorPosition;
│                        # passa {ajuste, registroPorPosition} ao toTodayResponse
└── ../docs/swagger.models.ts  # reflete `rebalanceado` no OpenAPI

apps/api/test/
└── today-daytype.e2e-spec.ts  # +casos: badge pareado (feito/pulei/troquei) e
                                #  rebalanceado=true só nas reconciliadas; registrada não sinaliza

apps/mobile/src/
├── HomeScreen.tsx       # MealCard: badge display-only sob override; render do sinal
├── meal-signal.ts       # (novo) seletor puro: deve sinalizar? (server `rebalanceado`
│                        #  OU alvo de ajuste de swap em sessão) — testável
└── meal-signal.test.ts  # (novo) Vitest do seletor puro
```

**Structure Decision**: Monorepo Mobile + API. A feature é **casca + cliente**: contrato em `@bamboo/types` (adição), derivação pura no mapper de `apps/api`, leitura na `plan.service`, e render + seletor puro no `apps/mobile`. `packages/core` **não é tocado**.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| Campo aditivo `rebalanceado` no contrato `GET /today` (a spec original dizia "sem API") | O caminho de troca de tipo-de-dia reconcilia **no servidor**; o `/today` só devolve a grama final, sem o paciente/app conseguir distinguir ajustado de planejado | App refazer a comparação exigiria mandar o registro+plano ao cliente e duplicar o motor (fere "regra no core/servidor", infla o cliente fino); 2ª leitura não existe endpoint que devolva "planejado do novo tipo sem ajuste". Campo aditivo é não-quebrável e mínimo. **Decisão do gate (Q1=A).** |

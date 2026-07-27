# Implementation Plan: Busca + alimento de origem no modo de combinar

**Branch**: `main` (direto, padrão do repo) | **Date**: 2026-07-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/021-combinar-busca-e-self/spec.md`

## Summary

O modo de combinar (`CombineSheet`) ganha a mesma busca fuzzy + paginação que a 019 deu à troca
simples (`SubstitutionSheet`), e a lista de candidatos passa a incluir o **próprio alimento do
item de origem** — hoje ele é excluído porque as duas telas compartilham o mesmo endpoint
`GET /meal-items/:id/substitutions`, cuja exclusão do food atual é correta para troca simples mas
errada para combinar. Abordagem: **zero matemática nova** (`combinar()`/`substituir()` em
`packages/core` ficam intocados — o alimento de origem, quando escolhido como alvo, passa pela
mesma conta que qualquer outro do grupo, com resultado trivial: gramas = gramas atuais). A
exclusão vira **condicional** por um parâmetro aditivo (`includeSelf`) no endpoint existente — sem
endpoint novo, sem migration. No mobile, a lógica de busca+paginação (debounce, guarda de geração,
detecção de fim de página) sai de dentro do `SubstitutionSheet` para um hook compartilhado
(`useAlternativesSearch`), consumido pelos dois sheets — a 2ª chamada real ao mesmo padrão é o
gatilho da extração, não abstração especulativa.

## Technical Context

**Language/Version**: TypeScript strict, Node 20+ (workspace pnpm + Turborepo)

**Primary Dependencies**: NestJS + Drizzle (api) · React Native/Expo (mobile) · `@bamboo/core`
(`buscarFuzzy`, `substituir`, `combinar` — todos intocados) · sem dependência nova

**Storage**: PostgreSQL — **sem migration**; nenhuma escrita nova (o endpoint estendido é leitura;
`POST /combine` já aceita o alimento de origem como alvo hoje, sem mudança)

**Testing**: Vitest — e2e da api com supertest (`substitutions.e2e-spec.ts`); mobile sem unit test
de UI (padrão já estabelecido: nem `SubstitutionSheet` nem `CombineSheet` têm; `tsc`/lint cobrem
tipagem, verificação manual cobre comportamento)

**Target Platform**: API Node (porta 3333 dev) + app Expo (paciente)

**Project Type**: mobile + api (monorepo)

**Performance Goals**: N/A específico — o parâmetro novo no máximo acrescenta 1 linha ao resultado
já calculado; nenhuma query N+1 nova

**Constraints**: requisição SEM `includeSelf` responde **byte-a-byte** o que responde hoje
(aditivo, padrão do `q`/`limit`/`offset` da 019 e do `dayTypeId` da 014) · combinação continua
restrita ao MESMO grupo de substituição (`combinar()` mantém o erro `fora-do-grupo`) · regra de
exatamente 2 alvos distintos inalterada (`combination.service.ts` já valida `ids[0] !== ids[1]`)

**Scale/Scope**: 1 parâmetro novo em 1 endpoint existente · 1 hook extraído (usado por 2
componentes) · `CombineSheet` reescrito para `FlatList` com busca+paginação (mantendo checkbox
multi-select + ajuste de proporção) · ~5 casos e2e novos

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- [x] **Núcleo puro** (Princípio III): nenhuma regra de negócio nova — `combinar()`/`substituir()`
      intocados. O alimento de origem, quando vira alvo, passa pela MESMA `substituir()` que
      qualquer outro food do grupo (resultado trivial: mesmas macros ⇒ mesmas gramas). Não há
      função nova no núcleo.
- [x] **Casca fina** (Princípio III): a exclusão do food de origem vira uma condição no `where` do
      Drizzle (`SubstitutionService.getSubstitutions`) — I/O puro, sem lógica de domínio. Resposta
      continua DTO puro (`SubstitutionAlternativeDto`, sem mudança de forma).
- [x] **Tese** (Princípios I/II): reduz fricção no combinar — "metade do que já como + metade de
      outro alimento" é autonomia/adequação real, e a busca é literalmente "trocar num toque" num
      grupo grande. Nenhum número de culpa, nenhuma barreira nova.
- [x] **LGPD** (Princípio V): nenhuma exposição nova de dado de saúde — mesmo gate de exposição do
      `/today`/substituições já em vigor, endpoint já existente.
- [x] **Escopo** (Princípio VI): dentro do combinar (002/010); explicitamente NÃO cross-grupo
      (fora de escopo na spec). Sem `Effect`/`fp-ts`, sem dependência nova, sem migration.
- [x] **TDD** (Princípio IV): e2e novo escrito ANTES do código (`includeSelf` inclui o food de
      origem com gramas = atuais; sem o parâmetro, a suíte existente — que já afirma
      `alt.foodId !== flexFoodId` — continua verde sem alteração).

Nenhuma violação — Complexity Tracking não se aplica.

## Project Structure

### Documentation (this feature)

```text
specs/021-combinar-busca-e-self/
├── spec.md
├── plan.md              # este arquivo
├── research.md          # decisões D1–D4
├── data-model.md        # sem entidade nova; forma do parâmetro + resposta
├── quickstart.md        # verificação manual
├── contracts/
│   └── get-substitutions-include-self.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
apps/api/src/substitution/
├── substitution.service.ts      # PaginaSubstituicoes ganha includeSelf?; where condicional
└── substitution.controller.ts   # @ApiQuery + repassa o param

apps/api/test/
└── substitutions.e2e-spec.ts    # describe novo: includeSelf

packages/api-client/src/
└── substitution.ts              # SubstitutionsQuery ganha includeSelf?: boolean

apps/mobile/src/
├── useAlternativesSearch.ts     # NOVO — hook extraído (debounce/geração/página)
├── SubstitutionSheet.tsx        # passa a consumir o hook — comportamento inalterado
└── CombineSheet.tsx             # usa o hook com includeSelf:true; FlatList + busca + checkbox
```

**Structure Decision**: monorepo existente (`apps/api` + `apps/mobile` + `packages/*`); nenhuma
pasta nova além dos artefatos da spec. O hook novo mora junto dos sheets em `apps/mobile/src/`
(mesmo nível de `SubstitutionSheet.tsx`/`CombineSheet.tsx`), não em `packages/core` — é estado de
UI (debounce, paginação de tela), não regra de domínio.

## Complexity Tracking

Não se aplica — Constitution Check sem violações.

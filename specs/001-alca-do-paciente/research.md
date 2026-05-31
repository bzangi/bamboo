# Research — Alça do paciente (Phase 0)

A spec não deixou marcadores `[NEEDS CLARIFICATION]` em aberto (a regra de "o agora" foi decidida pelo dono do produto). Esta fase consolida as decisões técnicas que sustentam o plano.

## D1 — Matemática de substituição (preservar o nutriente-base)

- **Decisão**: a troca dentro de um grupo preserva o **nutriente-base do grupo** (definido por `substitution_group.basis`: carb | protein | fat | kcal). Regra:
  1. `nutBase = (origem.basisPer100g / 100) * gramasItem`
  2. `gramasAlvo = nutBase / (alvo.basisPer100g / 100)`
  3. arredonda `gramasAlvo` para a medida caseira mais próxima do alvo.
- **Rationale**: é o sistema de equivalência ("exchange") que a nutri já usa há décadas — carbo por carbo, proteína por proteína. Determinístico, explicável, e bate com `reference_portion_grams` do schema.
- **Alternativas rejeitadas**: (a) equivalência por kcal sempre → distorce quando os macros divergem; (b) recalcular todos os macros simultaneamente → é rebalanceamento (multi-variável), **fora de escopo** nesta feature.

## D2 — Arredondamento para medida caseira

- **Decisão**: escolher a medida caseira do alvo cujo `grams` minimiza `|gramasAlvo - n*grams|` para `n` inteiro próximo (ou a medida única mais próxima da porção). Retornar `{ gramas, medidaCaseira: { label, grams } | null }`. **Sem** medida caseira cadastrada → `medidaCaseira: null` e exibe gramas.
- **Rationale**: o paciente pensa em "2 colheres", não em "84 g". A função do core devolve **ambos** (gramas exato + rótulo) e a UI decide o que mostrar.
- **Alternativas rejeitadas**: arredondar para múltiplos fixos de 5 g → não fala a língua do paciente.

## D3 — "O agora" no v0

- **Decisão**: `GET /today` retorna as refeições do dia ordenadas por `position` e marca a **primeira** como a refeição do momento (`currentMealId`). A regra completa (refeição seguinte à última **registrada**, reset diário) entra com o registro de refeição (diferido).
- **Rationale**: o registro está fora de escopo (decisão do dono do produto). Marcar a primeira refeição entrega US1 hoje e o ponteiro evolui sem quebrar o contrato quando o registro existir (basta o backend computar `currentMealId` a partir do último registro).
- **Nota**: `meal.horario` (novo campo, opcional) é **informativo** — exibido quando definido, **não** entra no cálculo de `currentMealId`.

## D4 — Gate de exposição (LGPD / Princípio II)

- **Decisão**: o nível de exposição do paciente (`hidden | percent | macros | full_kcal`) é aplicado **na borda** (no DTO de response do `/today`), não no device. Em `hidden`, a response **não** inclui números nutricionais; nos demais níveis, inclui só o permitido.
- **Rationale**: não confiar no cliente para esconder número (privacidade by design); o servidor só manda o que o gate autoriza.
- **Alternativas rejeitadas**: mandar tudo e esconder na UI → vaza dado e viola o gate.

## D5 — `Result` à mão + `ts-pattern` (sem libs de efeito)

- **Decisão**: `Result<T,E>` + `ok`/`err` implementados à mão em `packages/core/src/result.ts`; match com `ts-pattern` (`.exhaustive()`). **Sem** `neverthrow`, `Effect`, `fp-ts`.
- **Rationale**: mantém o núcleo **sem dependências de plataforma** (roda no device e no servidor), segue o exemplo canônico do CLAUDE.md, e evita pagar a curva de um sistema de efeitos no MVP (Princípio VI).
- **Alternativas rejeitadas**: `neverthrow` (dep extra desnecessária para um `Result` de 4 linhas); `Effect`/`fp-ts` (explicitamente diferidos).

## D6 — Erros de domínio como valor

- **Decisão**: `SubstitutionError = { kind: 'fora-do-grupo' } | { kind: 'nutriente-base-zero' }`. O núcleo **nunca lança**; a casca converte via `ts-pattern` em `UnprocessableEntityException`.
- **Rationale**: erro como valor + match exaustivo garante tratamento de todos os casos (Princípio III).

## D7 — Offline

- **Decisão**: o cálculo de substituição roda no `packages/core` (portátil ao device), mas **cache local, fila de sync e robustez offline ficam fora de escopo** nesta feature.
- **Rationale**: a portabilidade do núcleo já paga o futuro offline sem custo agora; construir a infra offline é Fase 4.

## D9 — Interop api↔core: build step nos packages consumidos pelo Node

- **Decisão**: `packages/core`, `packages/db` e `packages/types` ganham um **build** (`tsc -p tsconfig.build.json` → `dist/*.js` + `.d.ts`); `package.json.exports` aponta pro `dist`. O Turbo orquestra a ordem (`^build`); `check-types` depende de `^build`. `packages/api-client` segue sem build (só bundlers o consomem). `dist/` é git-ignored (artefato).
- **Rationale**: provado **empiricamente** que o consumidor Node (`apps/api`, type-checked e que emite via `nest build`) não consegue consumir `.ts` cru: o tsc (NodeNext) exige import com `.js`, mas o runtime do Node procura o arquivo `.js` literal (que não existe) — e inverter pra `.ts` quebra o type-check do consumidor (`allowImportingTsExtensions` exige `noEmit`, e o api emite). Bundlers (Next/Metro) reescrevem extensão e por isso consomem source de boa; o Node não. Build é o padrão de monorepo e satisfaz tsc **e** runtime.
- **Verificado**: `turbo build` 5/5; `turbo check-types` 8/8; `apps/api` importa `substituir()` e `db/schema` em build-time e runtime (`node dist`).
- **Alternativas rejeitadas**: (a) hook de resolução `.js`→`.ts` em runtime no api — preserva "sem build" mas é infra custom não-padrão; (b) `@swc-node/register` carregando `.ts` na hora — frágil (ignora node_modules workspace por padrão), foge do fluxo do Nest.
- **Nota**: revoga o atalho "sem build step" (que era só do bootstrap, não versionado em constituição/CLAUDE) **apenas** para os 3 packages que o Node consome; o domínio (`core`) segue TS puro e roda no device via Metro sem mudança. Reversível.

## D8 — Tolerância de equivalência

- **Decisão**: a preservação do nutriente-base é verificada em teste com tolerância **≤ 2%** (parâmetro). O arredondamento para medida caseira pode introduzir desvio; o teste afere o `gramas` exato (pré-arredondamento) e, separadamente, documenta o desvio do arredondamento.
- **Rationale**: separa o erro do modelo (deve ser ~0) do erro de apresentação (arredondamento), evitando teste frágil.

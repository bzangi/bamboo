# Tasks: Busca + alimento de origem no modo de combinar

**Input**: `specs/021-combinar-busca-e-self/` (spec.md, plan.md, research.md D1–D4, data-model.md,
contracts/get-substitutions-include-self.md, quickstart.md)

**Ordem de execução ≠ ordem de prioridade**: US2 (alimento de origem) executa ANTES de US1 (busca)
porque é a fatia menor e não depende de reescrever `CombineSheet` — US1 constrói em cima do que US2
já deixou fiado (`includeSelf: true` na chamada). TDD na API (Princípio IV da constituição); mobile
sem unit test de UI, seguindo o padrão já estabelecido em `SubstitutionSheet`/`CombineSheet`
(nenhum dos dois tem — a verificação é `tsc`/lint + quickstart manual).

## Phase 1: Setup

Nenhum scaffold novo — endpoint, hook e componentes já existem; esta feature estende, não cria.

## Phase 2: Foundational — parâmetro `includeSelf` na API

- [x] **T001 [P]** e2e RED em `apps/api/test/substitutions.e2e-spec.ts` (novo describe
      `includeSelf`): (a) `?includeSelf=true` inclui uma entrada com `foodId === current.foodId` e
      `gramas === quantityGrams` do item; (b) sem o parâmetro (ou falsy), a suíte existente que já
      afirma `alt.foodId !== flexFoodId` continua valendo — nenhuma asserção pré-existente muda;
      (c) `includeSelf=true` combinado com `q`/`limit`/`offset` continua casando/paginando
      normalmente sobre o conjunto que agora inclui a origem. Gate: falha (o `where` ainda exclui
      sempre o food atual). RED visto: 1 teste falhando, 20 pré-existentes intactos.
- [x] **T002** `apps/api/src/substitution/substitution.service.ts`: `PaginaSubstituicoes` ganha
      `includeSelf?: unknown`; a cláusula `ne(schema.foodSubstitutionGroup.foodId, item.foodId)` só
      entra no `where` quando `includeSelf` for falsy (`booleanDeQuery` novo em `query-param.ts`:
      só `'true'`/`'1'` ligam). Nenhuma outra query muda; o food de origem, uma vez em `targets`,
      passa pela MESMA `substituir()`/branch `adLibitum` que os demais. Gate: T001 verde (21/21).
- [x] **T003 [P]** `apps/api/src/substitution/substitution.controller.ts`: `@Query('includeSelf')` + repassa ao service; `@ApiQuery` documentando o parâmetro; descrição do `@ApiOperation`
      atualizada (padrão do texto já existente para `q`/`limit`/`offset`). Gate: `tsc` da api limpo.
- [x] **T004 [P]** `packages/api-client/src/substitution.ts`: `SubstitutionsQuery` ganha
      `includeSelf?: boolean`; serializa `includeSelf=true` só quando truthy (mesmo padrão de `q`).
      Gate: `tsc` do api-client limpo.

**Checkpoint**: `GET /meal-items/:id/substitutions?includeSelf=true` inclui o food de origem,
verificável por curl (quickstart) — mobile ainda intocado.

## Phase 3: US2 — o alimento de origem vira candidato do combinar (P1) 🎯 MVP

**Goal**: ao combinar, o alimento que já está no item aparece na lista de candidatos e pode ser
escolhido como um dos dois alvos.

**Independent Test**: abrir o combinar de um item, ver o próprio alimento entre os candidatos
(ainda na lista simples de hoje, sem busca), selecioná-lo com outro do grupo, confirmar que as duas
partes somam de volta ao item original.

- [x] **T005 [US2]** `apps/mobile/src/CombineSheet.tsx`: a chamada
      `getSubstitutions(API_URL, item.id)` passa a incluir `{ includeSelf: true }`. Nenhuma outra
      mudança nesta task — a lista continua `ScrollView` com checkbox, só ganha mais uma opção
      (o próprio alimento). Gate: quickstart passo 3 (o alimento do item aparece na lista).
- [x] **T006 [US2]** Confirma por e2e que `POST /meal-items/:id/combine` já aceita o alimento de
      origem como um dos dois `alvoFoodIds` sem erro — confirmado: a query de `groupFoods` em
      `combination.service.ts` nunca excluiu a origem, ZERO mudança de código no endpoint. Caso
      novo em `apps/api/test/combine.e2e-spec.ts` (7/7 verdes, incluindo o novo).
      Gate: e2e verde.

**Checkpoint**: US2 completa e demonstrável isoladamente — o combinar já resolve o pedido "metade
do que já como + metade de outro alimento", mesmo antes de US1.

## Phase 4: US1 — busca + paginação no combinar (P1)

**Goal**: mesma UX de busca fuzzy + paginação que a 019 deu à troca simples, agora também no
combinar.

**Independent Test**: item com grupo grande (~70 alimentos), digitar um trecho do nome no combinar,
ver a lista filtrar; rolar até o fim e ver a página seguinte carregar.

- [x] **T007 [P] [US1]** Extrair de `apps/mobile/src/SubstitutionSheet.tsx` o hook
      `useAlternativesSearch(item, { includeSelf })` para `apps/mobile/src/useAlternativesSearch.ts`
      — mesmo debounce (250ms), guarda de geração (`useRef`), acumulação de páginas e detecção de
      fim de lista (`recebidos < PAGINA`) que já existem hoje, só movidos de lugar. Nenhuma mudança
      de comportamento. Gate: `tsc`/lint verdes.
- [x] **T008 [US1]** `SubstitutionSheet.tsx` passa a consumir `useAlternativesSearch` (com
      `includeSelf` ausente — comportamento de hoje) no lugar da lógica que foi extraída. Gate:
      `tsc` do mobile limpo; nenhuma mudança de comportamento (mesma UI, mesmo texto).
- [x] **T009 [US1]** `CombineSheet.tsx`: troca `ScrollView` por `FlatList` consumindo
      `useAlternativesSearch(item, { includeSelf: true })` — campo de busca (mesmo limiar
      `MINIMO_PARA_BUSCAR`), `onEndReached` para a página seguinte, mantendo o `renderItem` com
      checkbox (`toggle`, máx. 2 selecionados) e o stepper de proporção/cálculo já existentes. Gate:
      `tsc` do mobile limpo.

**Checkpoint**: US1 completa — combinar tem a mesma UX de busca/paginação da troca simples.

## Phase 5: Polish

- [x] **T010** Regressão: `core` (181), `db` (20) e `mobile` (54) verdes; `api` e2e
      `substitutions.e2e-spec.ts` (21/21) e `combine.e2e-spec.ts` (7/7) verdes — os dois arquivos
      tocados por esta feature. `pnpm lint` (0 errors, warnings pré-existentes) + `pnpm format` +
      `pnpm check-types` na raiz limpos; `tsc --noEmit` do `apps/api` e do `apps/mobile` limpos;
      OpenAPI regenerado (31 paths — só o `includeSelf` novo no path existente, confirmado por
      diff). **Achado, fora do escopo desta feature**: `today-daytype`/`adesao`/`ciclo.e2e-spec.ts`
      falham na suíte completa E isoladamente — confirmado por reversão (`git stash`) que a falha é
      **pré-existente**, idêntica sem nenhuma mudança desta feature; não é a flakiness de
      poluição-entre-suítes já catalogada (essa falhava só na corrida completa) — parece estado/data
      do banco de dev fora da janela que esses testes esperam. Não corrigido aqui (fora do escopo da
      021); registrado para o Bruno investigar separadamente.
      Quickstart §App designado ao Bruno (requer simulador, julgamento manual de UX).

## Phase 6: Correção pós-shipping — troca simples também inclui a origem

- [x] **T011 [US2]** Achado do dono ao testar: `SubstitutionSheet` (troca simples) também
      excluía o alimento de origem — a mesma exclusão que esta feature já tinha corrigido para o
      `CombineSheet`. `apps/mobile/src/SubstitutionSheet.tsx` passa a chamar
      `useAlternativesSearch(item, { includeSelf: true })`. Zero mudança na API/core — o
      parâmetro já existia; só o consumidor passou a pedi-lo. Gate: `tsc` do mobile limpo;
      `substitutions.e2e-spec.ts` continua verde (o default do endpoint, sem parâmetro, não
      mudou — quem muda é o app).
- [x] **T012** spec.md emendado (FR-005/SC-004 revertidas, SC-005 nova, seção "Correção
      pós-shipping"); bloco SPECKIT do `CLAUDE.md` atualizado com a correção.

## Dependencies

- T001 → T002 → T003/T004 (paralelos entre si, ambos após T002).
- Phase 2 inteira antes de T005 (US2 depende do parâmetro existir).
- T005 → T006 (T006 só confirma o que T005 já habilitou a alcançar pela UI).
- T007 → T008 (SubstitutionSheet consumindo o hook) e T007 → T009 (CombineSheet consumindo o hook);
  T009 depende também de T005 (a chamada já usa `includeSelf: true`, T009 só troca o transporte).
- T008 e T009 são paralelos entre si (arquivos distintos), ambos após T007.

## Implementation Strategy

MVP = Phase 2 + Phase 3 (US2): o alimento de origem já vira combinável, entregue com a menor
mudança possível (1 linha na chamada existente). Phase 4 (US1) constrói a UX de busca por cima,
sem tocar a matemática nem o endpoint de novo. Cada checkpoint deixa a árvore verde e committável
(commits diretos na `main`, padrão do repo).

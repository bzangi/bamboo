# Research: Busca + alimento de origem no modo de combinar

## D1 — Nome e forma do parâmetro novo

**Decisão**: `includeSelf` (string truthy, no padrão frouxo de `q`/`limit`/`offset` — ausente ou
falsy = comportamento de hoje).

**Razão**: convenção já estabelecida (019: `q`/`limit`/`offset`; 014: `dayTypeId`) — parâmetro
opcional aditivo, ausência = byte-a-byte o de sempre. Nome em inglês, como os demais query params
da API (`q`, `limit`, `offset`, `dayTypeId`), consistente com a convenção de identificadores em
inglês do repo.

**Alternativas consideradas**: endpoint novo dedicado ao combinar
(`GET /meal-items/:id/combinations`) — rejeitado: duplicaria toda a query de grupo/basis/medidas
que `getSubstitutions` já faz, e o único diferencial é UMA cláusula (`ne`) do `where`; violaria
YAGNI. Nome `incluirAtual` (PT) — rejeitado por quebrar a convenção de query params em inglês já em
uso no mesmo endpoint.

## D2 — Onde a exclusão vira condicional

**Decisão**: no `where` da query de `targets` em `SubstitutionService.getSubstitutions`
(`apps/api/src/substitution/substitution.service.ts`), a cláusula
`ne(schema.foodSubstitutionGroup.foodId, item.foodId)` só entra quando `includeSelf` for falsy.

**Razão**: é I/O puro (casca), zero mudança no núcleo. O food de origem, uma vez incluído em
`targets`, passa pela MESMA `substituir()` que os demais — mesmas macros do item atual ⇒
`basisPer100g` igual ⇒ `gramas` resultante igual à quantidade atual (identidade trivial, sem caso
especial). O branch `adLibitum` (018) já trata todos os `targets` uniformemente com `gramas: 0`, e
o food de origem entra nele do mesmo jeito.

**Alternativas consideradas**: montar o food de origem no CLIENTE (mobile), a partir de
`item.food` — rejeitado: o item passado ao `CombineSheet` (`MealItemDto`) não carrega
`kcalPer100g`/`carbPer100g`/etc. nem medida caseira, então o cliente teria que buscar esses dados
por outra via, duplicando o que o servidor já resolve numa query.

## D3 — Busca e paginação do combinar: hook compartilhado vs. duplicar

**Decisão**: extrair a lógica de busca+paginação do `SubstitutionSheet` (debounce 250ms, guarda de
geração via `useRef`, detecção de fim de página, acumulação de páginas) para um hook
`useAlternativesSearch(item, { includeSelf })` em `apps/mobile/src/useAlternativesSearch.ts`,
consumido pelos dois sheets.

**Razão**: a partir desta feature existem DOIS chamadores com a MESMA semântica de busca (debounce,
guarda de geração para descartar resposta de geração velha, "fim de lista = página menor que
`PAGINA`"). É o mesmo argumento já registrado no repo para extrair `fuzzy.ts` como régua única
(019: "duas cópias de uma ordenação divergem no primeiro ajuste") — aqui o risco é um bug de
concorrência (guarda de geração) corrigido num sheet e esquecido no outro. Não é abstração
especulativa: é a 2ª chamada real acontecendo agora.

**Alternativas consideradas**: duplicar o bloco em `CombineSheet` (como está hoje, sem busca) —
rejeitado pelo motivo acima. Componente único fazendo tanto troca simples quanto combinação —
rejeitado: a seleção diverge de verdade (tap único vs. checkbox até 2 + ajuste de proporção), e
forçar isso num componente só pioraria a legibilidade dos dois fluxos.

## D4 — `CombineSheet`: `ScrollView` → `FlatList`

**Decisão**: `CombineSheet` passa a usar `FlatList` (como o `SubstitutionSheet`), com
`onEndReached` acionando a página seguinte via o hook novo.

**Razão**: é o mesmo motivo da 019 no `SubstitutionSheet` — grupos podem ter ~70 alimentos depois
da auto-classificação (008), e despejar tudo de uma vez numa `ScrollView` é o problema que esta
feature resolve. Mantém os checkboxes (`toggle`, máx. 2) como `renderItem`, só troca o container.

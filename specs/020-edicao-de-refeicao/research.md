# Research — 020 Edição de refeição em lote

Levantamento factual feito sobre a árvore corrente (2026-07-27); referências de linha podem
derivar — há um redesign visual do mobile em andamento na mesma árvore (D9).

## D1 — A prévia reusa `POST /rebalance/option-choice` com campo aditivo `items`

**Decision**: estender `OptionChoiceRequest` com `items?: {itemId, foodId, quantityGrams}[]`
(overlay da refeição-gatilho sobre a opção escolhida). Sem `items`, resposta byte-a-byte a de hoje.

**Rationale**: o cálculo da edição em lote é IDÊNTICO ao da troca de opção — "monte o dia com a
refeição-gatilho nesta composição e pergunte ao motor o que acontece". O `rebalance.service` já
faz toda a montagem (paciente/exposure/parâmetros/dayType override da 014/consumo real das
registradas/`diaComEscolha`) e o outcome DTO já é o que a tela da prévia renderiza. Um endpoint
novo duplicaria ~300 linhas de montagem para mudar só a composição do gatilho. Aditivo é o padrão
provado do `dayTypeId` (014): cliente antigo não quebra, e2e existente passa com diff vazio.

**Alternatives considered**: endpoint novo `/rebalance/meal-edit` (mais superfície, mesma
lógica, dois lugares para o mesmo bug); calcular a prévia no app (duplicaria o motor fora do
core e não veria o consumo real das refeições registradas).

## D2 — Forma do overlay = a forma do `consumo.items` do registro

**Decision**: `items` tem exatamente a forma de `RegistroConsumo.items`
(`{itemId, foodId, quantityGrams}`, múltiplas entradas por `itemId` permitidas — combinação).

**Rationale**: o que a prévia avalia deve ser exatamente o que o registro vai gravar (SC-005 "a
prévia nunca mente"). Uma forma só torna divergência inexpressável e o mobile já produz essa
estrutura (`consumoOverrides` → `montarConsumo`).

## D3 — Overlay aplicado na casca; `packages/core` intocado

**Decision**: o service substitui, na montagem do `diaComEscolha`, os itens overlaid da
refeição-gatilho pelas entradas do overlay (macros do food do overlay nas gramas dadas). Nenhuma
mudança em `previewTrocaOpcao`/`rebalancearPorKcal`/`ehAlavanca`.

**Rationale**: montar o dia é responsabilidade que a casca JÁ tem — é assim que refeições
registradas entram (itens sintéticos `reg-<mealId>-<idx>` com consumo real). A refeição-gatilho é
excluída das alavancas por `position` no core, então os campos de flexibilidade dos itens overlay
são irrelevantes para o motor; só os macros contam no `totalAtual`. Foods do overlay que não
estão no dia exigem um `select` extra por ids — 1 query.

**Prova**: SC de `git diff` vazio em `packages/core` ao fim da feature.

## D4 — Validação da prévia: estrutural + pertencimento; grupo não re-validado

**Decision**: 400 para UUID/gramas inválidos (padrão `registro.service`); 404 para `itemId` que
não pertence à opção escolhida ou `foodId` inexistente; item travado/sem grupo no overlay → 422
(mesma classe do `consumo` do registro). A pertinência do food ao grupo do item NÃO é re-validada
na prévia.

**Rationale**: o registro é o ponto de enforcement (`classificarEstado` → `consumo-fora-do-grupo`
→ 422) e o único que persiste; a prévia é efêmera e o cliente só produz trocas dentro do grupo
(as gramas vêm do servidor via `/substitutions`). Re-validar custaria 1–2 queries por request
para pegar apenas bug de cliente. `ponytail:` no código apontando o upgrade (validar grupo na
prévia se aparecer cliente third-party).

**Nota**: item travado/sem grupo rejeitado na prévia mesmo sem o registro rejeitar hoje igual —
editar item travado é instrução contraditória (mesmo argumento do `isLocked`×`groupId` da 017).

## D5 — Estado no mobile: reducer `edits.ts`; render continua nas estruturas existentes

**Decision**: novo reducer puro `apps/mobile/src/edits.ts` com
`EditState = Record<mealId, {previous: Record<itemId, {name?, consumo?}>, adjustments: Record<itemId, label>}>`.
Confirmar a edição escreve as trocas em `nameOverrides`/`consumoOverrides` (exatamente como
`handleSubstitute` faz hoje) e guarda em `edits[mealId]` o estado anterior + os ajustes da prévia.
Desfazer restaura `previous` e descarta os ajustes — atômico. Re-editar substitui a edição
anterior (o `previous` da segunda edição é o estado após a primeira; desfazer cobre a última).

**Rationale**: uma única fonte de render e de consumo (as estruturas que `ItemRow` e
`montarConsumo` já leem) — a alternativa (terceira estrutura de display) recriaria o bug de
inconsistência que a 005 matou. Os rótulos de ajuste das outras refeições entram no mesmo
`qtyOverrides`/`adjustedItemIds` via flatten (padrão `flattenAdjustments`), então
`deveSinalizar` funciona sem mudança.

**Alternatives considered**: estender `swaps.ts` (semântica errada — desfazer via chip da opção
default deixaria as trocas de item órfãs, o bug da 005); registrar direto no confirm (muda o
modelo de registro sem necessidade — o "Feito" existente já deriva "troquei").

## D6 — A prévia não enxerga adaptações efêmeras de outras refeições

**Decision**: manter o modelo atual — o servidor calcula com plano + consumo real registrado;
swaps de opção/edições não registradas de OUTRAS refeições não entram.

**Rationale**: é exatamente o comportamento da prévia de troca de opção hoje (duas trocas em
refeições diferentes: a segunda prévia não vê a primeira). Consertar isso é uma decisão de
produto separada (mandar o estado efêmero da sessão inteira ao servidor) — resíduo aceito e
documentado, não escondido.

## D7 — Item à vontade no modo de edição

**Decision**: trocável 1:1 (como na folha de troca hoje), mas a troca é só de exibição — não
entra no `items` da prévia nem no `consumo` do registro.

**Rationale**: contribui zero para o alvo (018), então não há impacto a calcular; e
`quantityGrams: 0` é rejeitado pela validação do registro (400) e da prévia. **Achado colateral
(pré-existente)**: `handleSubstitute` hoje grava `consumoOverrides` com `quantityGrams: alt.gramas`
mesmo quando `alt.adLibitum` (gramas 0) — um "Feito" depois de trocar um item à vontade enviaria
`quantityGrams: 0` e levaria 400. Verificar na implementação e corrigir como colateral (guarda no
`handleSubstitute`/`montarConsumo`).

## D8 — UI do modo de edição

**Decision**: `MealEditSheet` novo (Modal full-screen, padrão dos sheets existentes): lista os
itens da opção ativa partindo da composição exibida (FR-010); item flexível abre o
`SubstitutionSheet` existente como picker aninhado (busca/paginação de graça); travado aparece
desabilitado; à vontade troca 1:1. Rodapé: "Ver impacto" (desabilitado sem troca pendente) e
"Cancelar". Submeter chama a prévia e renderiza via `RebalancePreviewSheet` com prop nova
opcional (`consumoItems`) que entra no corpo da requisição; confirmar aplica tudo e mostra
snackbar com desfazer (padrão `UndoSwapToast`).

**Entrada**: botão "editar refeição" no `MealCard`, visível quando `!meal.registro` e a opção
ativa tem ≥1 item com `substitutable` (DTO já expõe).

## D9 — Sequenciamento: backend primeiro, mobile por último

**Decision**: implementar types → api (+e2e) → api-client → mobile, com o mobile re-lendo o
estado corrente dos arquivos imediatamente antes de editar.

**Rationale**: há uma sessão paralela ATIVA na mesma árvore reescrevendo
`HomeScreen`/`SubstitutionSheet`/`RebalancePreviewSheet` (redesign visual, mtimes de segundos
atrás durante o planejamento). Os arquivos do backend desta feature são disjuntos do redesign.
Editar por cima do estado corrente com `Edit` (match exato) falha alto em conflito em vez de
sobrescrever silenciosamente.

# Research — 009 Coerência da troca de tipo-de-dia após consumo

Decisões de design (Phase 0). Todas as `NEEDS CLARIFICATION` foram resolvidas no gate Specify→Plan (2026-06-10).

## D1 — Sinal por refeição via flag aditiva `rebalanceado: boolean`

**Decisão**: Adicionar `rebalanceado: boolean` em `MealDto` (`@bamboo/types`). True quando ≥1 item da **opção default** da refeição teve a grama recalculada pela reconciliação (item presente no mapa `ajuste` que a casca já computa). Granularidade **por refeição** (Q2).

**Racional**: Q2 = por-refeição (mais limpo, alinhado a "o plano se ajustou"). O mapa `ajuste` (itemId→gramasNovo) já existe em `calcularAjusteTrocaTipoDia`; derivar um booleano por refeição é trivial e puro. Booleano não vaza número (Princípio II).

**Alternativas**: (a) flag por item — rejeitada (Q2; polui, chama atenção pro número). (b) devolver gramaPlanejada por item pro app diferenciar — rejeitada (expõe mais dado que o necessário e empurra a decisão "mudou?" pro cliente).

## D2 — Badge de registro pareado por posição na casca (reusa campo existente)

**Decisão**: Com override (`?dayTypeId`) ativo, `registro` de cada refeição é resolvido **por posição** a partir do consumo do dia (`carregarConsumoDoDia.porMeal`, que já carrega `position` + `state` type-agnostic). Sem override, mantém o comportamento atual (estado vigente por `mealId`).

**Racional**: o campo `registro: { state } | null` já existe no contrato; só muda **como** é preenchido sob override. É a mesma regra de single-count (pareamento por posição) que o motor já usa. Zero mudança de contrato.

**Alternativas**: novo campo "registradoPorPosicao" — rejeitado (redundante com `registro`). Carregar via mais uma query — rejeitado (o `carregarConsumoDoDia` do caminho de override já traz tudo).

## D3 — Badge pareado é display-only sob override (coerência do desfazer cruzado)

**Decisão**: Quando o override está ativo, o badge de registro é **informativo** — sem as ações de desfazer/corrigir (pulei↔feito) que ele tem hoje. Para mexer no registro, o paciente volta ao tipo em que registrou.

**Racional**: o badge atual é tocável e faz `POST /registro {mealId, intent}`. Sob override, a refeição exibida tem `mealId` do **novo** tipo, mas o evento vive no `mealId` do tipo em que comeu → tocar desfazer ali agiria no `mealId` errado (no-op/erro). Display-only evita mutação cruzada incoerente. Coerente com FR-012 ("informativo, nunca barra") e com a assumption "badge = já resolvido hoje". O app já tem o estado `dayTypeId` (override) pra decidir isso — regra de cliente, sem campo novo.

**Alternativas**: fazer o desfazer mirar o `mealId` real registrado — rejeitado pro v0 (exigiria o app conhecer o `mealId` de origem por posição; complexidade desproporcional). Deixar tocável (bug) — rejeitado.

## D4 — Conteúdo do sinal: frase curta de porquê, sem número (Q3)

**Decisão**: Frase curta explicando o porquê, número-free. Caminho tipo-de-dia: _"Ajustei o resto do dia porque você já comeu."_ Caminho troca-de-opção: _"Ajustei pra fechar seu dia."_ (ou equivalente referenciando a troca). Mesmo tratamento visual nos dois (FR-009); a frase adapta ao gatilho. Sem kcal/macro/percentual (Princípio II, FR-007).

**Racional**: Q3 = frase de porquê. "Dá ação/entendimento, não número." A string exata é detalhe de implementação dentro dessas restrições.

**Alternativas**: selo mínimo "Ajustado" — rejeitado no gate (comunica menos o porquê). Mostrar variação % — proibido pela constituição.

## D5 — Sinal da troca de opção derivado no cliente (sem API)

**Decisão**: No caminho de troca de opção, o app deriva o sinal do estado de sessão `swaps` (feature 005: `swaps[mealId].adjustments` lista os itens/refeições reconciliados). Não usa `rebalanceado` do servidor (que só é populado no caminho de override de tipo-de-dia).

**Racional**: a 005 já mantém os ajustes derivados no cliente; o app sabe exatamente o que mudou sem ida ao servidor. O seletor puro (D6) unifica as duas fontes.

## D6 — Seletor puro unifica as duas fontes; ciclo de vida derivado

**Decisão**: Função pura no app `deveSinalizar(meal, swaps)` → `meal.rebalanceado === true` (servidor, tipo-de-dia) **OU** a refeição é alvo de ajustes do `swaps` vigente (cliente, opção). O sinal é **derivado por render**: aparece enquanto a condição vale e some sozinho quando deixa de valer (voltar ao tipo padrão zera `rebalanceado` no próximo `/today`; desfazer a troca zera `swaps`; registrar a refeição a tira do conjunto reconciliado). Persistência = enquanto vigora (Q3), sem timer.

**Racional**: ciclo de vida "persistente enquanto vigora" cai naturalmente de um estado derivado; não precisa de toast nem timer (distinto do toast de desfazer da 005). Testável em isolamento (Vitest, infra da 005).

## D7 — Zero mudança no motor / core

**Decisão**: `packages/core` não é tocado. As gramaturas exibidas permanecem idênticas (SC-006). A feature só **anota** (badge + flag) o que o motor já produziu.

**Racional**: a investigação confirmou que o motor já reconcilia corretamente (treino→descanso com `feito` reduz almoço/jantar ~10%). O buraco era de UX, não de cálculo.

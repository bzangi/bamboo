# Research — Fase 0: Motor lê o registro

Decisões aterradas no código real (investigação + verificação adversarial do plano). **Decisão / Rationale / Alternativas.** Revisão pós-verificação: 2 decisões do dono (troquei exato; troca-de-dia = override ativo) + correção dos majors.

## D1 — A matemática da engine NÃO muda

**Decisão**: `rebalancearPorKcal` permanece intacto. Já trata os dois sentidos: `deltaKcal>0` → reduz proporcional à kcal, clamp no piso, transborda em passes, recusa `estoura-piso`; `deltaKcal<0` → aumenta proporcional (sem teto rígido — `deltaKcal` é exatamente o que falta pra chegar ao alvo). Mira o **alvo** (`deltaKcal = total − alvo`); a faixa é a zona de no-op.

**Rationale**: FR-009/FR-010 já são o comportamento implementado (rebalance.ts:100-138). Mexer aqui seria reescrever um primitivo testado sem necessidade.

**Risco conhecido (herdado da Fase 2, NÃO introduzido aqui)**: o ajuste é ancorado em **kcal**; o gate de no-op (`TODOS_DENTRO`) avalia os 4 nutrientes mas a correção é por kcal. SC-004 ("não ultrapassa o alvo / não fura o piso") é garantido **em kcal e em gramas exatas**; em cada macro isoladamente o resultado pode ficar fora da faixa. Cobrir com um e2e de macros mistos pra não dar falsa confiança; não bloqueia.

## D2 — `previewTrocaOpcao` exclui refeições registradas das alavancas

**Decisão**: Adicionar `isRegistered: boolean` (**obrigatório**) à interface `RefeicaoDia`. O filtro de alavancas passa de `r.position !== triggerPosition` para `r.position !== triggerPosition && !r.isRegistered`.

**Rationale**: É o que o comentário do v0 antecipa (rebalance.ts:222-225). `alvo` segue `alvoDoDia(refeicoesDefault)`; `totalAtual` segue a soma de `diaComEscolha` — que agora carrega o **consumo real** nas registradas (D3/D6).

**Call-sites a atualizar (obrigatório, TS strict)** — adicionar `isRegistered` a TODOS os literais `RefeicaoDia`: `rebalance.service.ts` (montagem do dia), `rebalance.test.ts` (~6 literais), `phase2.edge.test.ts` (~L86-87). É tarefa explícita no tasks.

**Alternativas**: `isRegistered?` opcional default false (rejeitado: zero-churn mas a casca pode esquecer e o bug volta; obrigatório força a casca a sempre informar) · marcar item-a-item `isLocked` (rejeitado: registro é por refeição).

## D3 — Consumo real por estado — **troquei EXATO** (decisão do dono)

**Decisão**: O consumo real de uma refeição registrada:

- **feito** → itens da opção cumprida (`chosen_meal_option_id`) nas gramas planejadas (macros do food × gramas).
- **troquei** → **soma de `meal_event_item`** (food × gramas), que passa a ser o **snapshot COMPLETO** do que foi consumido (ver D3b).
- **pulei** → zero.
- **não-registrada** → itens planejados (default; ou a escolhida, se for o gatilho).

**Rationale**: FR-005/FR-006 — o total reflete o consumo real, resolvido **no servidor**. Com o snapshot completo (D3b), troquei vira `soma(meal_event_item)` direto, sem precisar reconstruir/parear.

## D3b — **Mudança na escrita do registro (Fase 3)**: `meal_event_item` = snapshot completo do troquei

**Decisão** (consequência de "troquei exato"): `registro.service`, ao gravar um **troquei**, materializa e grava em `meal_event_item` o **snapshot COMPLETO** do consumo (todos os itens da refeição como comida), não só os trocados. **NÃO é "só mais linhas" — é lógica de carga NOVA** (hoje o service só grava `consumo.items` e, no troquei-por-opção, grava ZERO linhas):

1. Carregar **todos os `meal_item`** da opção cumprida (`id`, `food_id`, `quantity_grams`) — inclui travados e não-trocados.
2. **Overlay por `itemId`** (troquei-por-substituição/combinação): para cada `itemId` presente em `consumo.items`, **remover** a linha do plano daquele `itemId` e **inserir todas** as entradas de `consumo.items` desse `itemId` (1..N — a combinação 1→2 manda 2 entradas pro mesmo `itemId`).
3. Gravar TODAS as linhas resultantes (travados + flexíveis-mantidos + substitutos/combinados).
4. troquei-por-opção-não-default → grava todos os itens da opção não-default (sem overlay).

`feito`/`pulei`/`desfazer` seguem sem `meal_event_item`.

**Rationale**: a Fase 3 gravava só os deltas (itens trocados), impossibilitando o total exato. O snapshot completo torna `consumido(troquei) = soma(meal_event_item)` exato e auto-contido. **Sem migration** (a tabela já tem food+gramas) e **sem mudança no mobile** (o servidor reconstrói da opção cumprida + os overrides que o app já envia). `consumo.items[].itemId` = o `meal_item.id` planejado sendo substituído (confirmado no contrato da Fase 3) — o pareamento por `itemId` é factível.

**Impacto**: atualizar os e2e de troquei da Fase 3 (`registro.e2e-spec.ts`): troquei cria `meal_event_item` = refeição inteira (não 1 linha), inclusive troquei-por-opção (antes: nenhuma linha) e combinação (2 linhas pro slot combinado). É lógica nova no service, não tweak.

**Alternativas**: aproximação v0 (troquei-substituição conta como planejado) — **rejeitada pelo dono** (queria exato) · adicionar vínculo `replaces_meal_item_id` (rejeitado: migration + mais complexo que gravar o snapshot completo).

## D4 — Helper compartilhado de consumo (casca), por (paciente, plano, data) — **type-agnostic**

**Decisão**: Novo `apps/api/src/registro-consumo.ts`: carrega `meal_event` por **(patientId, planId, `localToday()`)** — **sem** restringir `mealId` a um tipo-de-dia —, reduz por refeição com `estadoVigente`, e materializa: (a) o **consumo real por refeição** (D3) e (b) o **vetor agregado `consumido`** do dia. Reusado por `rebalance.service` (itens reais no dia) e por `plan.service` (vetor `consumido` na troca de tipo-de-dia).

**Rationale**: FR-012 — o consumido é **type-agnostic** (soma de TODAS as registradas de hoje, qualquer tipo-de-dia). **Crítico**: NÃO reusar o filtro `mealId IN (meals do tipo)` do `getToday` — na troca de tipo-de-dia isso zeraria o consumido (as registradas são do tipo anterior). A fonte de data DEVE ser `localToday()` (mesma do registro e do `/today`), nunca `new Date()`/UTC.

**Alternativas**: reusar a query type-scoped do getToday (rejeitado: zera o consumido na troca) · duplicar carga nos 2 services (rejeitado: divergência).

## D5 — Troca de tipo-de-dia: **override ativo = sempre ajustado** (decisão do dono)

**Decisão**: `getToday`, **sempre que há `?dayTypeId` override** (o paciente está vendo um tipo-de-dia escolhido) **e** há consumo hoje, computa o `consumido` (D4) e chama `previewTrocaTipoDia`; aplica as gramas ajustadas (D7). **Sem `?dayTypeId`** (tipo-de-dia padrão por weekday): **nunca** ajusta — só exibe (Q1: registrar não auto-recalcula o padrão).

**Evita double-count (BLOCKER da verificação)**: `previewTrocaTipoDia` recebe como `refeicoesRestantesNovoTipo` **apenas as refeições do novo tipo nos slots AINDA NÃO registrados hoje** — NÃO todas. Os slots já registrados (café/almoço/… comidos sob qualquer tipo) já entram via `consumido`; somar também o equivalente planejado do novo tipo contaria o slot duas vezes (`totalProjetado` inflado → reduz o resto erradamente). **Pareamento de slot por `position`** (v0): um slot registrado hoje exclui a refeição de mesma `position` do novo tipo das restantes. (O nome do parâmetro da Fase 2 — "restantes" — já previa isso.)

> **Limitação v0 do pareamento**: pareia por `position`, assumindo que os tipos-de-dia têm slots alinhados (café=1, almoço=2…). Se os tipos tiverem nº/ordem de refeições diferentes, o pareamento é aproximado. `day_selection` (instância por data) resolve exato em fase posterior.

**Rationale**: o app **persiste** o `?dayTypeId` e reenvia em todo reload (HomeScreen.tsx useState L66 + `load(dayTypeId)` pós-registro). Logo "só no toque de trocar" não se sustenta sem um sinal novo. O dono escolheu: **enquanto um tipo-de-dia override está ativo, o cardápio sempre reflete o consumido** (qualquer reload). O tipo padrão (sem override) continua sem auto-ajuste por registro — preserva o espírito do Q1. Sem mudança no app.

**Alternativas**: sinal efêmero de "troquei agora" (`?reason=daytype-switch`) — **rejeitado pelo dono** (exige mudança no app + param novo).

> **Quirk v0 (documentar)**: tipo-de-dia é template (sem `day_selection`). Ao ver um override, as refeições do novo tipo nos **slots não comidos** são alavancas; os slots **já comidos** (pareados por position) saem das restantes e entram via `consumido`. O **número fecha** (cardápio ajustado pelo total consumido, sem double-count), mas a **marcação "feito" por-refeição não aparece** no novo tipo (linhas diferentes) e o slot comido aparece no planejado (não-ajustável). Aceitável no v0; `day_selection` resolve em fase posterior.

## D6 — `rebalance.service` monta o dia com consumo real

**Decisão**: Em `optionChoice`, carregar o estado vigente + consumo real (D4, com `localToday()`). Montar `diaComEscolha`: registrada (≠ gatilho) → `itens` = consumo real (D3), `isRegistered: true`; não-registrada → opção default planejada, `isRegistered: false`; gatilho → opção escolhida, `isRegistered: false`. `refeicoesDefault` (alvo) inalterado.

**Gatilho registrado** (edge): pela UI o gatilho não é uma refeição registrada (refeição registrada exibe badge, não os chips de opção) — option-choice num gatilho registrado **não é alcançável** pelo app. Contrato: a do gatilho sai das alavancas por `position !== trigger` (independe de `isRegistered`) e contribui ao total com a **opção escolhida**. Não exige tratamento especial.

**Fonte de data**: usar `localToday()` (hoje o `rebalance.service` usa `new Date().getDay()` só pro weekday e não carrega eventos — passa a carregar via o helper, com `localToday()`).

## D7 — Aplicar o ajuste no `/today` (mapper) — só na opção default, com nutrition recomputada

**Decisão**: `today.mapper.toTodayResponse(input, ajustePorItem?)` recebe um `ReadonlyMap<itemId, { gramasNovo, medidaCaseira }>` (do `AlavancaAjustada[]` de `previewTrocaTipoDia`). O ajuste aplica-se **apenas aos itens flexíveis da opção default** — `toItemDto` ganha o map + um flag de "é default"; quando o item está no map E é da opção default, usa `gramasNovo`/`medidaCaseira` E **recomputa a `nutrition` pela grama nova**. As demais opções (alternativas) seguem no planejado.

**Rationale**: hoje `toMealDto` mapeia todas as opções igual e `toItemDto` usa `quantityGrams` cru (today.mapper.ts:142-191). O casamento ajuste→item é por **`itemId`** (não position) — robusto à troca de tipo. Mapper puro (Princípio III).

**Alternativas**: aplicar a todas as opções (rejeitado: as alternativas não foram rebalanceadas) · novo campo "ajuste sugerido" no DTO (deferido — indicador visual de "ajustado pelo que você comeu" é nice-to-have).

## D8 — Sem schema novo; rebalanceamento efêmero

**Decisão**: Nenhuma tabela/coluna nova (D3b só muda QUANTAS linhas de `meal_event_item` o registro grava). O rebalanceamento continua efêmero (FR-014) — nada do resultado é gravado.

## D9 — `feito` com `chosen_meal_option_id` nulo → fallback

**Decisão**: Se um `feito` tiver `chosen_meal_option_id` nulo (a coluna é nullable; o seed "tudo flexível" pode não ter default explícito), o consumo usa a **opção default vigente da refeição** (ou, se ausente, a primeira opção) — nunca zero.

**Rationale**: evita que um feito vire consumo zero (déficit falso). **Nota**: eventos gravados pelo `registro.service` atual SEMPRE têm `chosen_meal_option_id` em feito (fallback já aplicado na escrita); o fallback de LEITURA cobre apenas eventos legados/seed manual — é defensivo, não caso comum. Adicionar teste.

## D11 — Correção de conteúdo de troquei: o consumido reflete o ÚLTIMO troquei persistido

**Decisão**: `consumido(troquei) = soma(meal_event_item)` do evento **vigente** (último). A Fase 3 já definiu que corrigir o _conteúdo_ de um troquei se faz **desfazer → re-registrar** (correção troquei→troquei-distinto sem desfazer é fora de escopo / no-op pela idempotência por estado). Logo o motor sempre lê o consumo do troquei efetivamente vigente; não há ambiguidade.

**Rationale**: alinha o consumo-real com a semântica de correção da Fase 3 (last-write-wins por estado; conteúdo novo do troquei exige desfazer+re-registrar). Documentado para o implementador não tentar "mesclar" troquei sobre troquei.

## D10 — Recusa orientada: mapear o motivo

**Decisão**: A casca/mapper mapeia `RebalanceOutcome.recusa-orientada.motivo` → mensagem certa: `sem-alavanca` ("sem o que ajustar"), `estoura-piso` no excesso ("hoje ficou acima, segue leve e volta amanhã") e no déficit ("hoje ficou abaixo, segue e volta amanhã"). Não exibir um "não foi possível" genérico.

---

## Riscos / notas

- **previewTrocaTipoDia**: "restantes do novo tipo" = refeições do novo tipo nos **slots não registrados hoje** (pareado por position) — NÃO todas (evita double-count, ver D5).
- **consumido=0** (início do dia / sem registro): `previewTrocaTipoDia` já devolve `sem-acao` → cardápio no planejado. Teste já existe (`rebalance.test.ts` "início do dia"); **confirmar que segue verde** (não é caso novo).
- **Casamento ajuste→item por `itemId`** (não position): os `itemId` são únicos por `meal_item`; positions colidem entre tipos. O e2e de troca-de-tipo deve assertar que as gramas ajustadas caem nos itens do **novo** tipo.
- **Exposição (FR-015)**: o `/today` já filtra nutrition pelo gate; gramas ajustadas são ação, não número de adesão; nenhum total/desvio vai pro paciente.

# Research — Desfazer coerente com o rebalanceamento

Fase 0 do plano. Decisões técnicas e alternativas. Tudo confinado a `apps/mobile`.

## Estado atual (verificado por leitura)

`HomeScreen.tsx` mantém quatro mapas de override de sessão:

- `nameOverrides: Record<itemId, NameOverride>` — alimento/quantidade exibidos após **substituir/combinar** aquele item (`handleSubstitute`/`handleCombine`).
- `qtyOverrides: Record<itemId, string>` — rótulos de quantidade vindos **só** do rebalanceamento (`handleConfirmRebalance`).
- `optionOverrides: Record<mealId, optionId>` — opção ativa após troca.
- `consumoOverrides: Record<itemId, ConsumoItem[]>` — consumo efetivo p/ o POST registro.

Fatos que ancoram o fix:

1. `qtyOverride` é setado **exclusivamente** por `handleConfirmRebalance` (rebalanceado). Substituir/combinar setam `nameOverride` (+`consumoOverride`), nunca `qtyOverride`. Logo `qtyOverride ⟺ derivado-do-rebalanceamento`.
2. O botão "↺ desfazer" por-item (`ItemRow`) aparece quando `nameOverride || qtyOverride`; `onReset(itemId)` apaga só os overrides daquele item — **não recalcula**. Esse é o gap.
3. `qtyOverride` é **só display** — não entra no `consumo` enviado ao registro. Portanto reorganizá-lo não afeta o backend nem o registro.
4. O outcome `rebalanceado` (`RebalanceOutcomeDto`) traz `refeicoesAfetadas[].itensAjustados[]` = `{ itemId, food, gramasNovo, medidaCaseira }` — fonte dos rótulos derivados.

## D1 — Modelar a troca como unidade: `swaps[mealId]`

**Decision**: substituir `optionOverrides` + `qtyOverrides` por um único `swaps: Record<mealId, ActiveSwap>`, onde `ActiveSwap = { chosenOptionId, previousOptionId, adjustments: Record<itemId, string> }`. Os ajustes derivados moram dentro da troca.

**Rationale**: torna o desfazer atômico (apagar `swaps[mealId]` remove opção + ajustes juntos — FR-003/005) e a re-troca uma substituição atômica (FR-006). Tira o ajuste derivado do mapa que dirige o botão por-item → FR-001 sai "de graça" por construção. Single source of truth para "qual opção está ativa" e "quais quantidades derivadas exibir".

**Alternatives considered**: manter os dois mapas e adicionar uma estrutura paralela rastreando quais itemIds cada troca tocou. Rejeitado: dois lugares para a mesma verdade, fácil dessincronizar; o desfazer atômico já exige esse rastreio, então consolidar é mais simples, não mais complexo.

## D2 — Botão por-item: só para mudança direta

**Decision**: a condição do "↺ desfazer" em `ItemRow` passa de `nameOverride || qtyOverride` para **`nameOverride`** apenas.

**Rationale**: `nameOverride` = mudança direta no próprio item (substituir/combinar), legitimamente desfazível por-item (FR-002). `qtyOverride`/ajuste derivado nunca mais aciona o botão (FR-001). A linha que esconde a nutrição quando há ajuste permanece (`nameOverride || qtyAjuste` → continua escondendo no item rebalanceado, correto: a quantidade mudou).

**Alternatives considered**: manter o botão mas fazê-lo recalcular o rebalanceamento. Rejeitado: contradiz a decisão de produto (rebalanceamento não é desfeito item-a-item) e exigiria re-disparar o motor a cada item — complexidade desnecessária.

## D3 — Desfazer da troca: snackbar (~5s) + chip durável

**Decision**: dois caminhos, ambos chamando o mesmo `undoSwap(mealId)`:

- **Snackbar temporário**: ao confirmar a troca, exibe `UndoSwapToast` com "↺ Desfazer"; auto-some em ~5s.
- **Durável**: com troca ativa, re-tocar o chip da opção **default** da refeição desfaz a troca (em vez de abrir a prévia).

**Rationale**: o snackbar cobre o arrependimento imediato em 1 toque (FR-004/SC-003); o chip cobre o desfazer tardio sem estado extra (FR-005). Tocar uma opção _diferente_ segue abrindo a prévia (re-troca), que no confirm chama `applySwap` e substitui a troca anterior (FR-006).

**Timer**: `useEffect` keyed no objeto do toast — agenda `setTimeout(5000)` e limpa no cleanup. Nova troca cria novo objeto → effect re-roda → timer reinicia (US2 cenário 4). Unmount limpa o timer. Sem `Date.now()`/estado mutável de instância.

**Alternatives considered**: (a) só snackbar — rejeitado: desfazer some para sempre após 5s, fere "nunca barra"; (b) só chip — rejeitado: descoberta ruim para o arrependimento imediato. Stakeholder escolheu ambos.

## D4 — Estratégia de teste

**Decision**: extrair o reducer puro `swaps.ts` e testá-lo com **Vitest** (env `node`) adicionado ao `apps/mobile` (`vitest.config.ts` incluindo `src/**/*.test.ts`; devDep `vitest`; script `"test": "vitest run"`). Rodar via `pnpm --filter mobile test`. O reducer não importa nada de RN — Vitest roda sem jsdom/preset. Type-check via `tsc --noEmit`. Timer/render do snackbar: verificação manual (quickstart).

**Rationale**: `apps/mobile` não tem runner de teste hoje; o módulo puro permite TDD da lógica de valor sem montar RTL/jest-expo. Imports type-only de `@bamboo/types` são apagados na transpilação — sem custo em runtime de teste.

**Alternatives considered**: pôr o reducer em `packages/core` (que já tem Vitest). Rejeitado: é estado de apresentação, não domínio — violaria a fronteira "core = matemática de domínio agnóstica de plataforma". RTL completo no mobile: rejeitado por desproporção (ver Complexity Tracking do plano).

## D5 — `previousOptionId` e o alvo do desfazer durável

**Decision**: gravar `previousOptionId` na troca; no v0 ele é sempre o `defaultOption.id` (antes de qualquer troca a opção ativa É a default). O afordância de desfazer durável é o **chip da opção default**.

**Rationale**: simples e correto no v0; deixa o campo pronto caso no futuro a opção ativa inicial não seja a default. A detecção "há troca ativa" = `swaps[mealId]` definido (equivalente a `chosenOptionId !== defaultOption.id`).

## D6 — Re-troca = substituição atômica

**Decision**: `applySwap(state, {mealId, ...})` sobrescreve `state[mealId]` inteiro (nova opção + novos ajustes), descartando os ajustes da troca anterior daquela refeição.

**Rationale**: garante FR-006 (sem ajuste fantasma). Como os ajustes vivem dentro da troca, a substituição é naturalmente atômica.

## D7 — Escopo do gatilho (confirmado com stakeholder)

**Decision**: apenas a troca de opção dispara rebalanceamento; substituir/combinar permanece mudança local do item, com seu próprio desfazer. Sem expansão.

**Rationale**: FR-009 + Assumption. Substituição preserva o nutriente-base por design (carbo↔carbo), então não precisa rebalancear no v0. Expandir seria feature de escopo Fase 2, fora deste bug.

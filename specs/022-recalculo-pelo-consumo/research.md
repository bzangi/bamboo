# Research — 022 Recálculo pelo consumo + gatilho como alavanca de último recurso

Cada decisão abaixo foi tomada com o código na mão; as linhas citadas foram lidas, não inferidas.

## D1 — Onde a Parte 1 mora: apagar a condição, não acrescentar caminho

**Decisão**: em `apps/api/src/plan/plan.service.ts:250`, o ternário `dayTypeId ? this.calcularTrocaTipoDia(...) : undefined` vira chamada incondicional. O método privado é renomeado para `calcularAjustePeloConsumo` — o nome atual descreve o gatilho antigo (troca de tipo-de-dia) e passaria a mentir.

**Rationale**: o recálculo pelo consumo já é uma peça montada e testada — `previewTrocaTipoDia` no núcleo, com guarda de double-count (refeição registrada sai das restantes e entra via `consumido`, pareada por `position`) e alavancas restritas a item flexível não-à-vontade. A feature não constrói nada; remove a condição que a mantinha atrás de um override. `packages/core` fica com `git diff` vazio.

**Alternativas rejeitadas**:

- Parâmetro de query novo (`?recalc=1`): reintroduz exatamente a assimetria de contrato que a `014` provou ser a raiz do KI-005 (o cliente precisa saber pedir o comportamento certo, e esquecer produz erro silencioso).
- Recalcular no app: duplicaria a matemática fora do núcleo. Proibido pela constituição (Princípio III).

## D2 — `registroPorPosition` continua atrás do override, sem parâmetro novo

**Decisão**: `calcularAjustePeloConsumo` continua devolvendo `{ ajuste, registroPorPosition }`; o **chamador** passa `registroPorPosition` ao mapper somente quando há `dayTypeId`. Nenhum parâmetro novo no método.

**Rationale**: `today.mapper.ts:213` escolhe a fonte do estado de registro pela **presença** do mapa — presente, pareia por posição; ausente, usa o estado vigente por `mealId`. Essa preferência é semântica da `009`/`014` (o resíduo A2 vive aí). Passar o mapa sempre mudaria a marcação de "registrado" em todo dia com registro de outro tipo-de-dia, que é justo o que FR-005/SC-004 proíbem. O `getToday` já sabe se há override; a decisão fica no chamador, uma linha.

**Alternativas rejeitadas**: passar `sobOverride: boolean` para o método — parâmetro que só recomunica o que o chamador já tem.

## D3 — A regra do último recurso mora no núcleo

**Decisão**: em `previewTrocaOpcao` (`packages/core/src/rebalance.ts`), o conjunto de alavancas passa a ser: as flexíveis das refeições não-registradas ≠ gatilho; **se esse conjunto for vazio**, as flexíveis do próprio gatilho.

**Rationale**: "quem é alavanca" é decisão de domínio, e `ehAlavanca` já é a definição única de item flexível (lição da `018`: filtrar na casca cria a segunda definição, e é assim que elas divergem). O conjunto vazio já é tratado por `rebalancearPorKcal` (`rebalance.ts:89`), então quando o gatilho também não tem item elegível o desfecho continua `sem-alavanca` — FR-010 sai de graça, sem ramo novo.

**Consequência aceita**: com o gatilho como alavanca, um excesso reduz as quantidades da própria refeição escolhida, com o piso calculado sobre as gramas planejadas dessa opção. É o comportamento correto ("adaptar"), e o piso protege.

## D4 — FR-008 (não reescalar o que o paciente escolheu) já está garantido, por item

**Decisão**: **nenhuma flag nova**. Os itens do overlay da edição em lote entram no dia como `isLocked: true, groupId: null` (`rebalance.service.ts:439-441`), logo `ehAlavanca` os rejeita. O gatilho virar alavanca não os alcança.

**Refinamento do FR-008**: a guarda é **por item**, não por refeição. Um item da refeição-gatilho que o paciente **não** editou continua alavanca legítima — a regra da `020` protege o que ele escolheu, não a refeição inteira por contágio.

**Alternativas rejeitadas**: flag `gatilhoEditado` na entrada do adaptador — duplicaria informação já presente nos itens e criaria uma segunda definição de "editado", que é o erro que a `020` evitou.

## D5 — Zero mudança de contrato HTTP

**Decisão**: nenhum campo, path, status ou parâmetro novo. A resposta da prévia já suporta o caso: `toOptionChoiceResponse` (`rebalance.mapper.ts`) agrupa alavancas por `position` **sem filtrar o gatilho**, e `foodByItemId` é montado sobre **todas as opções de todas as refeições** (`rebalance.service.ts:505-513`), então os itens da opção escolhida resolvem nome de alimento normalmente — não caem no `continue` defensivo.

**Verificação exigida na implementação**: um teste que confirme que o gatilho aparece em `refeicoesAfetadas` com nome de alimento preenchido. Esse `continue` é silencioso; se algum dia o lookup encolher, a resposta vira `rebalanceado` com lista vazia.

## D6 — Os dois testes que caracterizam a decisão revogada são reescritos, não apagados

**Decisão**: `apps/api/test/today-daytype.e2e-spec.ts:333` ("Q1 — após consumo, GET /today SEM dayTypeId mostra o PLANEJADO … nada ajustado") e `:502` ("009/US3 — SEM dayTypeId: rebalanceado=false em tudo e registro por mealId") são reescritos.

- A metade que **inverte**: "mostra o planejado" → "mostra ajustado"; `rebalanceado=false em tudo` → `true` nas refeições com item flexível ajustado.
- A metade que **permanece e vira prova**: `registro` por `mealId` continua idêntico nos dois. É a asserção que sustenta FR-005/SC-004.
- O nome do teste passa a citar a `022` e o ADR, senão um leitor futuro encontra "Q1" no nome e conclui que a regra antiga vale.

**Rationale**: apagar removeria a única cobertura do caminho sem override.

## D7 — Texto da prévia quando a refeição afetada é a própria do gatilho

**Decisão**: em `apps/mobile/src/RebalancePreviewSheet.tsx`, o cabeçalho do desfecho `rebalanceado` escolhe a frase comparando a lista de afetadas com a refeição do gatilho — quando a única afetada é ela, frase própria ("Ajustei as quantidades do próprio jantar para fechar o dia", texto final na task). Comparação inline no componente, sem seletor novo: é uma condição de exibição, não regra.

## D8 — Riscos identificados

1. **Suítes vermelhas por estado do banco de dev**: `today-daytype`, `adesao` e `ciclo` já falham hoje, isoladas e na suíte completa, por estado/data do banco de desenvolvimento (registrado na `021`, confirmado lá por reversão). Os testes **novos** desta feature são self-contained via `buildScenario` (`013`) para não herdar isso; ao mexer em `today-daytype`, medir o antes/depois do arquivo, não o verde absoluto.
2. **Adesão não é afetada pelo ajuste**: a métrica compara consumo real (snapshot dos registros) com o alvo (opções padrão do plano). O ajuste é efêmero e não entra em nenhum dos dois lados. Nenhuma mudança esperada — o que **é** afetado é o resíduo já documentado na spec (o "Feito" grava o planejado).
3. **Custo por requisição** _(medido na execução; a redação original estava errada)_: dia **sem registro** não muda — o early-return de `vigentesHoje.length === 0` vem antes de qualquer leitura. Dia **com registro e sem override** passa a executar o que o caminho com override sempre executou: 1 query de parâmetros da nutricionista + até 3 de `carregarConsumoReal` (`consumo-real.loader.ts:76,103,123`, todas condicionais). Não é query nova no código — é trabalho que não rodava naquele caminho, que é a feature em si. A leitura de `meal_event` segue única (`012`).

## D9 — Descoberto na execução: quatro testes caracterizavam a regra restringida, não dois

O plano previa reescrever **dois** testes (D6, ambos em `today-daytype.e2e-spec.ts`). A execução encontrou mais quatro, todos com a mesma causa: o fixture tinha a refeição-gatilho **flexível** e nenhuma outra alavanca, então afirmavam `sem-alavanca` por causa da exclusão do gatilho.

- `packages/core/src/rebalance.test.ts` — "nenhuma refeição não-gatilho com alavanca" e "se TODOS os flexíveis das não-gatilho são à vontade": passaram a travar o gatilho/marcá-lo à vontade também. O que eles afirmam ("não há alavanca em lugar nenhum") continua íntegro; o fixture é que precisava dizer isso de verdade.
- `apps/api/test/rebalance.e2e-spec.ts` — "FR-004 recusa: todas MENOS o gatilho registradas" e "Déficit sem alavancas": **invertem**, e viram a prova e2e do bug corrigido no plano semeado.

Isso falsifica a redação original do SC-003 ("os 15 casos calibrados não mudam"): 13 dos 15 não mudam; 2 mudam de propósito. A reversão (T011) mede exatamente isso — desligar a cláusula derruba 4 casos e nenhum outro.

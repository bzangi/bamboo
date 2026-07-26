# Tasks: A prévia de rebalanceamento passa a enxergar o override

**Input**: [spec.md](./spec.md) · [plan.md](./plan.md)

**Baseline**: core **164** · db **20** · api **147** · mobile **24**.
**A única suíte cujas expectativas mudam é `colisao-position.e2e-spec.ts`** — e mudam de
propósito: os 2 casos do `KI-005` eram caracterização de bug. Qualquer outra expectativa que
precise mudar é bug.

**Git**: commits direto na `main`, um por checkpoint.

---

## Phase 1: Os testes primeiro

- [x] **T001** Registrar o baseline das 4 suítes.
- [x] **T002** **[TDD — VER FALHAR]** Inverter os 2 casos do bloco `KI-005` em
      `apps/api/test/colisao-position.e2e-spec.ts`: de "404" para **200 + prévia**, com o
      `dayTypeId` do tipo B no corpo. O cabeçalho do arquivo já autoriza: as asserções `[BUG]`
      devem ser invertidas quando a correção vier.
      ⚠️ Renomear o bloco: deixa de ser "KI-005 — prévia inalcançável" e passa a asserir o
      comportamento novo. O `[BUG]` sai desses dois.
- [x] **T003** **[TDD — VER FALHAR]** Caso novo da **US2**: registro `pulei` na pos 1 do tipo B
      (sob override) + gatilho numa refeição **de B** com `dayTypeId: B` → a prévia é
      **diferente** da prévia sem aquele registro. É o que prova que o motor passou a enxergá-lo.
      ⚠️ Precisa de uma opção não-default numa refeição de **B** — hoje só a pos 2 de **A** tem.
      Acrescentar ao cenário (`buildScenario`), sem mexer nas gramas de A.
      ⚠️ Calibrar a alternativa de B pela MESMA conta de A (alvo 300g, faixa ±10%, piso 50%):
      160g contra 100g. Asserir `outcome.kind === 'rebalanceado'` como pré-condição, senão o
      caso passa por vacuidade.
- [x] **T004** **[TDD — VER FALHAR]** Casos novos da **US3**: (a) `dayTypeId` que não é do plano
      ativo → **404** com a mensagem do `POST /registro`; (b) `dayTypeId` válido **de B** mas
      `triggerMealId` de **A** → 404 "refeição do gatilho não está no dia corrente".
- [x] **T005** Rodar a suíte e confirmar que T002/T003/T004 estão **vermelhos** e os outros
      casos verdes.

**Checkpoint**: o comportamento desejado está escrito e falhando.

---

## Phase 2: O contrato

**Depende de**: T005

- [x] **T006** `packages/types/src/rebalance.ts`: `OptionChoiceRequest` ganha
      `dayTypeId?: string`, com o docblock do [plan.md](./plan.md). Aditivo — cliente antigo não
      quebra.

---

## Phase 3: A casca

**Depende de**: T006

- [x] **T007** `apps/api/src/rebalance/rebalance.service.ts` bloco 4: resolver o tipo-de-dia do
      override quando presente (validado pertencer ao **plano ativo**, 404 com a mensagem do
      `POST /registro`), senão o weekday. O roster (`:177`) passa a usar o tipo resolvido.
      ⚠️ Copiar a **forma** de `registro.service.ts:120-140`, não inventar variação — a
      assimetria entre os três caminhos é a causa raiz do KI-005.
      ⚠️ **NÃO** tocar o pareamento por `mealId` (`:285-286`): com o roster certo ele casa
      sozinho. É a razão de (a) ter sido escolhida em vez de (b).
      ⚠️ **NÃO** restringir a leitura do consumo ao tipo resolvido — ela é type-agnostic de
      propósito (FR-008); restringir ressuscita o bug que a 004 corrigiu.
      ⚠️ **NÃO** tocar `packages/core` (FR-011).
- [x] **T008** `rebalance.controller.ts`: documentar o campo no Swagger.
      ⚠️ **A premissa desta task estava errada e foi corrigida na execução.** Ela dizia
      "espelhando como o `/registro` documenta o dele" — mas **nenhum dos 6 POSTs da API
      documenta `requestBody`** (verificado no `openapi.json` gerado). Não havia padrão a
      espelhar, e criar um `@ApiBody` + modelo só para este endpoint seria inconsistente com os
      outros 5 e scaffolding não pedido. Foi para a descrição do `@ApiOperation`, que é como
      esta API descreve comportamento hoje. O gap de `requestBody` é **pré-existente e
      API-wide** — item próprio, se algum dia incomodar.
- [x] **T009** Rodar a suíte completa. T002/T003/T004 verdes; **`rebalance.e2e-spec.ts` verde
      com `git diff` vazio** — é a prova de FR-003, e a suíte tem 15 casos calibrados no seed.
- [x] **T010** Reescrever o comentário do caso do **resíduo A2** (gatilho em **A**, registro em
      **B** → prévia idêntica). Ele **continua verde e continua pinado**, mas deixou de ser
      "[BUG]": passou a ser consequência **decidida** de (a) — o motor segue o tipo exibido,
      coerente com FR-013a da 004. Registrar que a divergência badge-vs-motor sobrevive nesse
      caminho.

**Checkpoint**: KI-005 morto, Sintoma A morto no caminho do override.
Commit: `fix(api): 014 — option-choice aceita o override de tipo-de-dia (KI-005 + KI-002/A)`.

---

## Phase 4: O app

**Depende de**: T007

- [x] **T011** `RebalancePreviewSheet` ganha a prop `dayTypeId?: string` e a envia no corpo.
      ⚠️ **`dayTypeId` entra nas deps do `useEffect`** (hoje `[meal, option]`) — senão trocar de
      tipo-de-dia com a sheet aberta manda o corpo velho.
- [x] **T012** `HomeScreen` passa o `dayTypeId` do override (o mesmo estado que alimenta
      `overrideActive`) para a sheet.
- [x] **T013** `pnpm --filter mobile test` (24) + `tsc` do mobile (exige `pnpm build` antes) +
      lint.
      ⚠️ O smoke manual da UI fica **pendente e explícito** (mesma situação da 005/010): validar
      no simulador que o chip de opção sob override agora abre a prévia em vez de erro. Requer
      julgamento manual; designado ao Bruno.

**Checkpoint**: o app manda o campo. Commit: `feat(mobile): 014 — envia o override na prévia`.

---

## Phase 5: Verificação e fechamento

**Depende de**: T009, T013

- [x] **T014** Verificar os SCs com comando: **SC-003** `git diff` vazio nas 11 suítes não
      tocadas + as 3 contagens · **SC-005** contagens de `meal_event`/`meal_event_item`
      idênticas antes/depois de uma prévia sob override · **SC-006** `git diff` vazio em
      `packages/core` · **SC-007** nenhuma migration nova.
- [x] **T015** Regenerar o OpenAPI. Done-gate: `pnpm lint` + `pnpm format` + `pnpm check-types`.
- [x] **T016** **Superseder o ADR-0001** com um ADR novo que registra a decisão (a), por que (b)
      foi rejeitada (não mata o KI-005 — verificado por reversão) e o resíduo A2. O ADR-0001
      passa a `superseded`.
- [x] **T017** Fechar **KI-005** (resolvido) e atualizar **KI-002**: o Sintoma A morre no
      caminho do override e sobrevive no caminho "voltei para o tipo padrão"; o Sintoma B segue
      aberto (rota da nutri, ADR-0002). Atualizar `docs/estado-atual.md`, `CONTEXT.md` (o termo
      **override de tipo-de-dia** passou a ter efeito no motor) e o bloco SPECKIT.

---

## Dependências

```
T001 → T002 ∥ T003 ∥ T004 → T005 → T006 → T007 → T008 → T009 → T010
                                              └─→ T011 → T012 → T013
                                                          T009,T013 → T014 → T015 → T016 → T017
```

## O que NÃO fazer

1. **Não** trocar o pareamento por `position` — é a opção (b), rejeitada. Com o roster certo o
   `mealId` casa sozinho.
2. **Não** restringir a leitura do consumo ao tipo-de-dia resolvido (FR-008).
3. **Não** tocar `packages/core` — a matemática não muda, só o dia que ela recebe.
4. **Não** alterar nenhuma expectativa de `rebalance.e2e-spec.ts`: ele é a prova de que o
   caminho sem override não mudou.
5. **Não** apagar o caso do resíduo A2 porque "não é mais bug" — ele é o pino da consequência
   decidida. Só o comentário muda.
6. **Não** inventar variação na resolução do tipo-de-dia: copiar a forma do
   `registro.service.ts`. Três formas diferentes foi o que causou o KI-005.
7. **Não** esquecer `dayTypeId` nas deps do `useEffect` da sheet.
8. **Não** fazer o campo obrigatório — quebraria cliente antigo sem necessidade.

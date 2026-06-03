# Research — Fase 0: Registro pendurado na consulta

Consolidação das decisões técnicas que sustentam o plano. Cada decisão: **Decisão / Rationale / Alternativas**. Decisões aterradas no código real (Fase 0, 6 investigadores paralelos). Onde houve divergência entre investigadores, a reconciliação está marcada **[reconciliado]**.

---

## D1 — Tabela `meal_event` (append-only) + filha `meal_event_item`

**Decisão**: Criar `meal_event` (var `mealEvent`, tabela `meal_event`) e a filha `meal_event_item`, ambas em `packages/db/src/schema.ts`, seguindo as convenções do arquivo (PK `uuid().primaryKey().defaultRandom()`, FKs `.references(() => x.id)`, `createdAt timestamp().defaultNow().notNull()`). Append-only: nunca UPDATE/DELETE em runtime; cada toque é um INSERT. **[reconciliado]** Nome `meal_event` (não `meal_log`).

**Rationale**: O bloco "ADIADO" do schema (schema.ts:237-244) já nomeia "meal_event / log" e descreve a semântica exata. "event" reflete o modelo append-only (FR-011) melhor que "log" (confunde com logging de app). O schema é 100% relacional normalizado (zero `jsonb`), então o consumo efetivo item-a-item vai em tabela filha, espelhando `meal_item` (food + gramas).

**Alternativas**: `meal_log` (rejeitado: ambíguo) · upsert numa linha única por (paciente, refeição, dia) (rejeitado: viola FR-011 append-only e a escolha consciente de já modelar append-only para não retrabalhar no offline) · `jsonb` para o consumo (rejeitado: nenhuma tabela usa, perde FK→food e a integridade que barra comida-fora-da-lista).

## D2 — Estado vigente = último evento; **desfazer = evento com `state` NULL** (tombstone)

**Decisão**: **[reconciliado]** O enum `meal_event_state` tem **exatamente 3 valores** (`feito`, `troquei`, `pulei`) e a coluna `state` é **NULLABLE**. Um evento de marcação carrega `state ∈ {feito,troquei,pulei}`; um evento de **desfazer** carrega `state = NULL` (anulação). O estado vigente de (paciente, refeição, dia) = `state` do evento mais recente; se não há eventos OU o mais recente tem `state = NULL` → **não-registrada** (ausência).

**Rationale**: FR-002 crava "exatamente três estados" e "'não registrada' é a ausência, não um quarto estado". `state` NULL unifica "desfazer" e "nunca registrou" como a mesma ausência, sem 4º valor de enum e sem flag booleana redundante. Mantém o enum como vocabulário de produto puro.

**Alternativas**: enum de 4 valores com `desfeito` (rejeitado: 4º estado, fere FR-002) · flag `is_undo boolean` com `state` NOT NULL (rejeitado: `state` fica sem sentido no evento de anulação; mais estado que o necessário) · DELETE da linha (rejeitado: viola append-only, perde histórico).

## D3 — Idempotência por **estado-alvo vs vigente** (não `clientRequestId`)

**Decisão**: **[reconciliado]** A idempotência (FR-012) é decidida comparando o **estado-alvo** com o **estado vigente atual**, dentro de `db.transaction` com **advisory lock** no escopo (paciente, refeição, dia): se o alvo == vigente → **no-op** (não insere; retorna o vigente); se difere (correção) ou não há vigente → **insere** novo evento. `clientRequestId` **não** entra nesta feature.

**Rationale**: FR-012 define idempotência literalmente "pelo estado-alvo": reenviar o mesmo estado não muda nada; mudar o estado é correção legítima (novo evento). UNIQUE não serve em tabela append-only (precisa de N linhas por chave). O lock serializa o duplo-toque concorrente (retry de rede). `db.transaction` **já existe** no projeto (`packages/db/scripts/seed.ts`, `ingest-taco.ts`) — referência de sintaxe; o **inédito** é (a) `db.transaction` na **casca `apps/api`** (grep nos services = 0) e (b) o **lock explícito** (`pg_advisory_xact_lock`), 1º controle de concorrência do projeto. A decisão de gravar/não-gravar é regra de domínio → função pura no core (`decidirRegistro`); o I/O é casca. Como o lock serializa os INSERTs por (paciente, refeição, dia), `created_at` (microssegundo via `now()`) é estritamente crescente por escopo e basta como `seq` do core — sem coluna `seq` dedicada.

> **Limitação v0 [reconciliado com a verificação]**: a idempotência por rótulo de estado não distingue dois `troquei` de conteúdo diferente. Corrigir o _conteúdo_ de um troquei se faz **desfazendo → re-registrando** (a UI só oferece a troca em "o agora"; refeição registrada exibe o estado). Logo não há perda silenciosa pelo caminho de UX. Correção direta troquei→troquei-distinto sem desfazer é fora de escopo no v0 (documentado em spec/contracts).

**Alternativas**: `clientRequestId` UNIQUE (defensável e robusto p/ offline, mas a spec define idempotência por estado-alvo, não por chave de request; fica **deferido** como robustez de offline-sync na Fase 4) · idempotência só na leitura/Home (rejeitado: FR-012 exige na escrita; duplo-toque concorrente gravaria 2 eventos).

## D4 — Âncora desnormalizada: `patientId`, `planId`, `mealId`, `dayTypeId`, `loggedDate`

**Decisão**: `meal_event` carrega FKs `patientId`→patient, `planId`→plan, `mealId`→meal, `dayTypeId`→day_type (todas NOT NULL), `chosenMealOptionId`→meal_option (NULLABLE, a opção cumprida) e `loggedDate date NOT NULL` (dia-calendário). `state` enum NULLABLE (D2), `createdAt timestamp defaultNow notNull`.

**Rationale**: FR-005 ancora em (paciente, refeição, dia); FR-015 ancora direto no plano (sem ciclo); FR-014 carrega o tipo-de-dia em vigor → `dayTypeId` denormalizado (snapshot do momento, default OU override de sessão, sem materializar `day_selection`). `loggedDate` é `date` (não timestamp): o registro é por dia-calendário, e a chave (paciente, refeição, dia) precisa ser estável para last-wins/idempotência. Desnormalizar a âncora (guardar patient/plan além do derivável via meal) evita 3 joins na derivação de "o agora" e na futura leitura de adesão — padrão que o schema já pratica (`day_schedule` guarda `planId` + `dayTypeId`).

**Alternativas**: só `mealId` + derivar o resto por join (rejeitado: "o agora" re-deriva a cada registro e a leitura da nutri varre por paciente+dia) · FK para um objeto ciclo (rejeitado: fora de escopo, plano direto no v0) · `timestamp` para o dia (rejeitado: ambíguo na virada de dia; `date` é semanticamente correto).

## D5 — Consumo efetivo do "troquei": filha `meal_event_item`, **dentro da lista**

**Decisão**: Para **troquei por substituição/combinação** (FR-004a), gravar N linhas em `meal_event_item` (`mealEventId`, `foodId`→food, `quantityGrams doublePrecision`), espelhando `meal_item`. Para **troquei por opção não-default** (FR-004b), nenhuma filha — só `chosenMealOptionId` no pai. Os `foodId` das filhas são sempre alimentos do plano (FK→food), garantindo "dentro da lista".

**Rationale**: FR-004 distingue os dois casos de troquei; a forma food+gramas casa com o que o motor do core já consome (sem novo parser) e a FK→food barra comida-fora-da-lista (Fase 4). O snapshot do consumido é auto-contido (sobrevive a edições futuras do plano), coerente com append-only. **O cliente é a fonte da lista final consumida** (os overrides de substituição/combinação são efêmeros/client-side, D8): envia `items` já materializados (`foodId` + `quantityGrams`); o servidor **não recompõe** a combinação — valida só o pertencimento ao grupo (DB-resolvido, D-acl) e `gramas > 0`. Reconciliação de quantidade contra o plano é fora de escopo v0.

**Alternativas**: gravar só o item alterado, não o snapshot (rejeitado: append-only quer o consumido auto-contido) · texto livre de alimento (rejeitado: abriria fora-da-lista, fora de escopo).

## D6 — Núcleo puro: `packages/core/src/registro.ts` (4 funções)

**Decisão**: Novo arquivo `registro.ts` (+ `registro.test.ts`, + barrel em `index.ts`). Quatro funções puras:

1. `classificarEstado(input): Result<EstadoRegistro, ClassificacaoError>` — a partir da marcação (consumiu/não-consumiu) + adequação presente, devolve feito/troquei/pulei; valida within-group do consumo (grupo antes de gramas).
2. `estadoVigente(eventos): EstadoRegistro | null` — last-wins por `seq` monotônico; tombstone (state null) ou lista vazia → null. Total, não-`Result`.
3. `decidirRegistro({ vigente, alvo }): Decisao` — discriminated union `{ kind: "inserir" } | { kind: "no-op" }` (idempotência alvo-vs-vigente, D3). Pura; a casca executa o I/O conforme o `kind`.
4. `derivarOAgora({ refeicoes, vigentes }): OAgora` — `{ kind:"refeicao", mealId } | { kind:"dia-concluido" }`; 1ª refeição (por ordem) com vigente null; lista vazia → dia-concluido. Total, não-`Result`.

Tipos: `EstadoRegistro = "feito"|"troquei"|"pulei"` (string-literal union, padrão do core); `Adequacao` (DU `substituicao-combinacao` { itens } | `opcao-nao-default` { mealOptionId }); `ClassificacaoError` (DU `consumo-fora-do-grupo` | `consumo-invalido`); `EventoRegistro` ({ seq, state: EstadoRegistro|null }); `OAgora`.

**Rationale**: Princípio III. Cada conceito de domínio do core já mora em arquivo próprio com test colado e re-export central. A classificação troquei (FR-003) e a derivação de "o agora" (FR-006) são regra de negócio testável sem banco — espelham `previewTrocaOpcao`/`combinar`. `estadoVigente`/`derivarOAgora` são reduções totais (retornam valor, não `Result`, como `somaNutrientes`/`alvoDoDia`). A validação within-group reusa a semântica de erro `fora-do-grupo` de `substituir`/`combinar`.

**Alternativas**: pôr a lógica no service (rejeitado: viola Princípio III, intestável sem banco) · `EstadoRegistro` como discriminated union com payload (rejeitado: o core usa string-union para enum fechado pequeno; o consumo é campo separado do evento) · idempotência inteira no core (rejeitado: gravar é I/O; o core só decide o `kind`).

## D7 — "O agora" como invariante derivada (substitui o estático)

**Decisão**: `getToday` deixa de fixar `currentMealId = mealRows[0].id` (plan.service.ts:186). Após carregar as refeições (já ordenadas por `position`), faz **uma** query `DISTINCT ON (meal_id) ... WHERE patient_id, plan_id, logged_date=hoje ORDER BY meal_id, created_at DESC` → `Map<mealId, state|null>`, e o mapper deriva `currentMealId` = 1ª refeição com estado null (via `derivarOAgora` do core). Todas registradas → `currentMealId = null` + `diaConcluido = true`.

**Rationale**: FR-006/007/013 — "o agora" é a 1ª não-registrada na ordem do plano; registrar/corrigir/desfazer re-deriva pela mesma invariante, sem mutar ponteiro. Edge "refeição anterior esquecida": uma não-registrada antiga permanece "o agora". Query agregada única (sem N+1), padrão `measureRows`→`measuresByFood`. A derivação fica no mapper puro (testável sem banco).

**Alternativas**: ponteiro `currentMeal` persistido (rejeitado: redundante, divergível do append-only) · `meal.horario` dirige "o agora" (rejeitado: schema diz explicitamente que horario é informativo e NÃO dirige) · N+1 por refeição (rejeitado: padrão do repo é query agregada).

## D8 — Contrato de escrita: **troquei derivado da presença de adequação no corpo**

**Decisão**: `POST /patients/:patientId/registro`, corpo `{ mealId, intent: "feito"|"pulei"|"desfazer", dayTypeId?, consumo? }`. O servidor **nunca** recebe `troquei` como intent. Para `intent="feito"`, o corpo carrega `consumo: { chosenOptionId, items?: [{ itemId, foodId, quantityGrams }] }` (o estado de sessão do app). O core (`classificarEstado`) decide: opção default + sem `items` → **feito**; opção não-default OU `items` presentes → **troquei** (validando within-group). `pulei`/`desfazer` não carregam consumo.

**Rationale**: FR-003 — troquei é derivado, nunca botão/campo. Como substituição/combinação/opção são **efêmeras e client-side** (FR-026 da Fase 2 — o backend não as conhece), o cliente DEVE enviar o consumo efetivo ao marcar feito; o servidor classifica a partir da presença de adequação. Isso fecha US2 sem persistir as Fases 1/2.

**Alternativas**: cliente envia `state: "troquei"` (rejeitado: fere FR-003; servidor não pode confiar) · backend infere a troca (rejeitado: impossível, overrides não são persistidos).

## D9 — Casca: módulo `registro`, transação+lock, `Result`→`HttpException`, validação na borda

**Decisão**: Novo `apps/api/src/registro/{module,controller,service,mapper}.ts`. Controller fino `@Controller('patients')`, `@Post(':patientId/registro')` `@HttpCode(200)`, `ParseUUIDPipe` no patientId. Service: `db.transaction` + advisory lock por (paciente, refeição, dia); valida corpo na borda (UUID_RE + enum + `BadRequestException`, **sem** class-validator/ValidationPipe — segue o padrão atual do repo); resolve plano ativo + dayType vigente; carrega histórico; chama `estadoVigente`+`classificarEstado`+`decidirRegistro` (core); insere `meal_event` (+ `meal_event_item` se troquei); re-deriva "o agora"; converte `Result`→`HttpException` com `match(...).exhaustive()`. Mapper puro → `RegistroResponse`.

**Rationale**: Espelha `rebalance.service.ts` (casca com db + Result→HttpException opção 1). `@HttpCode(200)` porque é upsert-de-estado idempotente (às vezes no-op/anulação), como rebalance/combine. Manter validação manual na borda evita introduzir class-validator transversal no meio da fase (decisão à parte). DbModule é `@Global`.

**Alternativas**: class-validator + ValidationPipe global (defensável, mas é mudança transversal — PR próprio) · `201 Created` (enganoso p/ correção/no-op/desfazer) · lógica no service (rejeitado: Princípio III).

## D10 — LGPD v0: **pertencimento** na casca; auth real deferida e nomeada

**Decisão**: Enforcement por **pertencimento** (FR-017): o service prova, dentro da transação e ANTES do insert, que a `mealId` pertence ao **plano ativo** do `patientId` da rota (cadeia meal→day_type→plan(isActive)→patient). Falha → `NotFoundException` (404). Auth real (derivar patientId de token/sessão), canal de leitura da nutri, RLS e auditoria ficam **deferidos e nomeados** como dívida no plano.

**Rationale**: É a primeira escrita persistida de dado de saúde; o Princípio V proíbe empurrar LGPD pro fim. Sem identidade autenticada (auth stub, fora de escopo), o que dá pra fazer é fechar o IDOR cross-patient (gravar refeição de B sob patientId de A). 404 (não 403) porque sem identidade não se afirma "sem permissão", só "não existe para este paciente" — coerente com os outros endpoints. Template da cadeia de joins meal→day_type→plan→patient: **`combination.service.ts:87-95`** (hoje só lê exposure). A **novidade** é adicionar `eq(plan.isActive, true)` + `eq(plan.patientId, :patientId-da-rota)` no WHERE (combine é `@Controller('meal-items')`, não patient-scoped; registro é `@Controller('patients')`). **A mesma cadeia resolve no banco o `groupIdEsperado` (do `meal_item`) e o grupo do food consumido (via `food_substitution_group`)** para a checagem within-group — esses grupos **nunca** vêm do payload (correção da verificação: a fronteira de confiança fica no servidor, como em `substitution.service.ts`). `FR-017` aqui cobre só a escrita do paciente; o canal de leitura da nutri é deferido (sem superfície de leitura nesta feature).

**Alternativas**: não checar nada (status quo dos efêmeros) (rejeitado: registro PERSISTE saúde; IDOR aqui é a dívida que o Princípio V manda não criar) · guard/JWT agora (rejeitado: auth real fora de escopo) · RLS Postgres (rejeitado: exige identity context inexistente no v0).

## D11 — Migration e seed

**Decisão**: Migration gerada por `pnpm --filter @bamboo/db db:generate` (próximo sequencial `0002_*.sql` + `_journal.json`), aplicada por `db:migrate`. Editar **só** `schema.ts`. No `seed.ts`, dentro de `clearPlanTables(tx)`, adicionar como **duas primeiras linhas** (antes de `meal_item`): `await tx.execute(sql`DELETE FROM ${mealEventItem}`)` e `await tx.execute(sql`DELETE FROM ${mealEvent}`)` — seguindo o estilo raw `tx.execute(sql`...`)` do script (NÃO o query-builder `tx.delete()`), com `sql` importado de `drizzle-orm` (padrão do seed) e os imports `mealEvent`/`mealEventItem` adicionados.

**Rationale**: É o pipeline já estabelecido (0000/0001 gerados; header do schema instrui gerar). O seed é idempotente limpando em ordem de FK; sem incluir as novas tabelas, o re-seed quebraria com violação de FK.

**Alternativas**: SQL à mão (rejeitado: dessincroniza o snapshot do drizzle-kit) · `ON DELETE CASCADE` (rejeitado: o repo não usa cascade em nenhuma FK; manter consistência).

---

## Riscos transversais (carregados para o plano/tasks)

- **Breaking no `TodayResponse`**: `currentMealId` passa a `string | null` e ganha `diaConcluido` + `registro` por refeição. Consumidores (mobile, e2e `today*.e2e-spec.ts`, swagger model, api-client) precisam tratar. Sem eventos semeados, "o agora" continua sendo a 1ª refeição (retrocompat preservada).
- **Timezone**: `loggedDate`/weekday vêm de `new Date()` no fuso do servidor (mesma fonte de `plan.service`/`rebalance.service`). Perto da meia-noite pode divergir do fuso do paciente. Dívida documentada (consistente com o código atual); helper `resolveLocalDate(tz)` recomendado mas não bloqueante.
- **Advisory lock**: 1º uso de concorrência do projeto; sem precedente para copiar. Mecanismo: `pg_advisory_xact_lock(hash(patientId, mealId, loggedDate))` dentro da transação.
- **`troquei` por combinação [resolvido]**: o **cliente** envia a lista final consumida (food+gramas) já materializada no `consumo.items` — o servidor não recompõe a combinação. Grava 1 linha `meal_event_item` por item; valida só grupo (DB-resolvido) + `gramas > 0`.
- **`DISTINCT ON` inédito no repo**: `db.selectDistinctOn([mealEvent.mealId], ...)` existe na API do Drizzle mas nunca foi usado aqui; exige a 1ª coluna do `orderBy` = a do distinct (`asc(mealId), desc(createdAt)`). **Fallback idiomático**: carregar todos os eventos do dia (`inArray`) e reduzir com `estadoVigente` do core (padrão `measureRows`→`measuresByFood`). Decidir na task.
- **LGPD**: pertencimento ≠ autenticação; não cobre impersonação (cliente manda patientId). Limite consciente do v0, escrito no plano.
- **Sandbox/migration**: `drizzle-kit` precisa de `DATABASE_URL` e banco acessível; validar que roda (ver MEMORY sobre build scripts no sandbox).
- **Limpeza recomendada (fora de escopo, anotar)**: `test/jest-e2e.json` + bloco `"jest"` e2e morto podem induzir alguém a rodar e2e em Jest e quebrar (imports de `vitest`).

# Feature Specification: Registro pendurado na consulta — feito / troquei / pulei

**Feature Branch**: `003-registro-consulta`

**Created**: 2026-06-02

**Status**: Draft

**Input**: User description: "Fase 3 — registro pendurado na consulta: o paciente marca cada refeição como feito / troquei / pulei (logs ancorados no plano, nunca formulário separado)"

## Visão geral

A Fase 1 entregou ver **"o agora"** e substituir um item dentro do grupo; a Fase 2 entregou o **motor de rebalanceamento** (escolher opção desigual, combinar, trocar tipo-de-dia) — tudo **efêmero**: nada do que o paciente faz é gravado (FR-026 da Fase 2).

Esta feature introduz a **primeira escrita de estado real do paciente**: o **registro pendurado na consulta**. Com um toque na Home, o paciente marca a refeição do momento como **feito**, **troquei** ou **pulei**. O registro captura adesão como **subproduto** (a métrica é só-da-nutri, fora desta feature) e faz **"o agora" avançar** para a próxima refeição. Não é formulário nem tela separada — é pendurado na consulta.

Decisões de fronteira (cravadas com o dono do produto):

1. **Escopo:** captura o evento **+** avança "o agora". O motor de rebalanceamento por **consumo real** (gatilho dormente da Fase 2) **NÃO** é ligado aqui.
2. **Granularidade:** registro **por refeição**; o **delta** de uma troca desce ao item.
3. **"troquei":** não é um terceiro botão — é **derivado** da substituição/combinação/opção-não-default que já existe na Home.
4. **Correção:** registro **corrigível** (última-escrita-vence por paciente+refeição+dia); armazenamento append-only.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Registrar "feito" / "pulei" num toque (Priority: P1)

Na Home, o paciente vê a refeição do momento ("o agora"). Quando come a refeição como planejada, toca **feito**; quando não come nada dela, toca **pulei**. O toque resolve a refeição inteira, sem abrir formulário, e "o agora" avança para a próxima refeição ainda não registrada. As refeições já registradas mostram o estado registrado em vez das ações.

**Why this priority**: É o coração da feature e o primeiro estado real do paciente gravado no produto — sozinho já captura adesão (feito vs pulei) e fecha o laço da consulta ("o que como agora" → "marquei"). Entrega valor sem depender de troca nem de correção.

**Independent Test**: Com um plano semeado e a Home aberta, tocar **feito** na refeição corrente e confirmar que (a) o registro persiste e sobrevive a recarregar, (b) "o agora" avança para a próxima refeição não-registrada, (c) a refeição registrada passa a exibir "feito". Repetir com **pulei**.

**Acceptance Scenarios**:

1. **Given** um paciente com plano ativo e a refeição do momento exibida na Home, **When** o paciente toca **feito** na refeição corrente, **Then** o sistema registra a refeição como feito, "o agora" avança para a próxima refeição não-registrada, e a refeição registrada passa a exibir o estado "feito" sem ações.
2. **Given** a mesma Home, **When** o paciente toca **pulei** na refeição corrente, **Then** o sistema registra a refeição como pulei e "o agora" avança igualmente, sem barrar nem pedir confirmação extra.
3. **Given** uma refeição já registrada como feito, **When** o paciente recarrega a Home, **Then** o estado "feito" persiste e a refeição não volta a oferecer as ações de registro.
4. **Given** o paciente registra a **última** refeição não-registrada do dia, **When** o registro é gravado, **Then** a Home mostra um estado de **dia concluído** (sem próxima refeição), nunca um erro.

---

### User Story 2 - "troquei" derivado da troca que já existe (Priority: P2)

Quando o paciente substitui um item, combina dois ou escolhe uma opção diferente da default e então marca a refeição como feita, o sistema registra automaticamente o estado **troquei** — sem um botão extra e sem toque adicional — guardando o que foi efetivamente consumido. Assim a adesão sabe que houve adequação (que conta como aderente) e não uma cópia idêntica do papel.

**Why this priority**: É o que torna a adesão fiel à tese ("% da intenção cumprida", não "% idêntico ao papel"): adequar é aderir. Reaproveita 100% da UX de troca/combinação já entregue nas Fases 1/2 — o registro é subproduto, custo marginal de UX zero. Depende da US1 (o ato de marcar feito) já existir.

**Independent Test**: Com a Home aberta, substituir/combinar um item (ou escolher opção não-default) na refeição corrente, marcar **feito**, e confirmar que o registro gravado tem estado **troquei** e carrega o que foi consumido (itens efetivos ou a opção cumprida), sem o paciente tocar em nenhum botão de "troquei".

**Acceptance Scenarios**:

1. **Given** a refeição corrente com uma substituição confirmada (item trocado dentro do grupo), **When** o paciente marca a refeição como **feito**, **Then** o sistema registra o estado **troquei** com os itens efetivamente consumidos (alimentos + quantidades), não **feito**.
2. **Given** a refeição corrente em que o paciente escolheu uma **opção diferente da default**, **When** o paciente a marca como feita, **Then** o registro é **troquei** e referencia a opção efetivamente cumprida.
3. **Given** a refeição corrente em que o paciente abriu uma troca e depois a **desfez** (↺) antes de marcar, **When** o paciente marca a refeição como feita, **Then** o registro é **feito** (conforme o plano), não troquei.
4. **Given** qualquer registro **troquei** por substituição/combinação, **When** ele é gravado, **Then** os itens consumidos permanecem **dentro da lista** (mesmo grupo de equivalência) — comida fora da lista não é capturada nesta feature.

---

### User Story 3 - Corrigir um toque errado (Priority: P3)

O paciente que tocou no estado errado (ex.: marcou **pulei** mas tinha comido) pode corrigir o registro daquela refeição, ou desfazê-lo de vez. O último registro prevalece; o sistema nunca barra a correção.

**Why this priority**: "Nunca barra" exige permitir desfazer um deslize de toque sem fricção. É um refinamento sobre a US1 — agrega robustez, mas a feature já entrega valor sem ele.

**Independent Test**: Registrar uma refeição como **pulei**, corrigir para **feito**, e confirmar que o estado vigente da refeição passa a ser **feito** (última-escrita-vence) e que reenviar o mesmo registro não cria duplicata observável.

**Acceptance Scenarios**:

1. **Given** uma refeição registrada como **pulei**, **When** o paciente corrige para **feito**, **Then** o estado vigente da refeição passa a **feito** e o histórico do evento anterior é preservado.
2. **Given** uma refeição já registrada, **When** o paciente **desfaz** o registro (volta a não-registrada), **Then** ela deixa de ter estado vigente e, se for a refeição não-registrada mais antiga do dia, volta a ser "o agora".
3. **Given** o mesmo registro reenviado (toque repetido / retry), **When** o sistema recebe a duplicata, **Then** o estado vigente não muda e **nenhuma** duplicata é observável na Home.

---

### Edge Cases

- **Dia concluído**: registrar a última refeição não-registrada do dia leva a Home a um estado de "dia concluído", não a um erro nem a uma próxima refeição inexistente.
- **Refeição anterior esquecida**: se o paciente não registrou uma refeição anterior, ela permanece "o agora" (a não-registrada mais antiga) até ser registrada — o app não pula refeições não-registradas. É a forma de fechar o laço, nunca uma barreira.
- **Desfazer para não-registrado**: desfazer um registro volta a refeição a "não registrada"; "o agora" volta a apontar para ela se for a não-registrada mais antiga do dia.
- **Troca desfeita antes de marcar feito**: se o paciente desfaz a substituição/combinação antes de marcar, o registro é **feito** (plano), não **troquei**.
- **Reenvio do mesmo registro (retry)**: reenviar o mesmo estado para a mesma refeição/dia não muda o estado vigente nem produz duplicata observável; mudar o estado é correção (novo evento).
- **Tipo-de-dia trocado na sessão**: o registro carrega o tipo-de-dia em vigor no momento (o override escolhido na sessão, se houver), pois ainda não se persiste o tipo-de-dia seguido por data.
- **Exposição oculta**: mesmo registrando, o paciente não vê adesão/percentual — o gate de exposição controlado pela nutri é respeitado.

## Requirements _(mandatory)_

### Functional Requirements

#### O registro e seus três estados

- **FR-001**: O paciente MUST poder registrar a refeição do momento como **feito** ou **pulei** com **um único toque**, direto no card da refeição na Home, sem formulário nem tela separada.
- **FR-002**: O sistema MUST definir os estados de registro como **exatamente três**: **feito** = consumiu a refeição conforme a opção ativa (default ou escolhida); **pulei** = não consumiu nada da refeição; **troquei** = consumiu a refeição com adequação (substituição, combinação ou opção não-default). "Não registrada" é a **ausência** de estado vigente, NÃO um quarto estado.
- **FR-003**: **troquei** MUST NOT ser um botão próprio nem exigir toque/confirmação extra: o sistema MUST derivá-lo — quando a refeição marcada como feita tem uma adequação ativa, o estado gravado MUST ser **troquei**, no **mesmo toque** do "feito".
- **FR-004**: Para o estado **troquei**, o sistema MUST capturar o que foi efetivamente consumido, distinguindo dois casos: (a) **por substituição/combinação** → grava os **itens efetivos** (alimentos + quantidades), que MUST permanecer **dentro da lista** (mesmo grupo de equivalência); (b) **por opção não-default** → grava a **opção efetivamente cumprida**. Comida fora da lista é fora de escopo.
- **FR-005**: Cada registro MUST se ancorar em **(paciente, refeição, dia)**; a granularidade-base é a **refeição** e o detalhe do que foi consumido (item-a-item) só existe no caso **troquei por substituição/combinação**.

#### "O agora" e seu avanço

- **FR-006**: O sistema MUST derivar **"o agora"** como a **primeira refeição do dia ainda não registrada**, na ordem do plano. Apenas "o agora" MUST exibir as ações de registro (feito/pulei); refeições já registradas MUST exibir seu estado registrado.
- **FR-007**: Registrar "o agora" MUST, por consequência da invariante de FR-006, fazer "o agora" passar para a próxima refeição não-registrada do dia.
- **FR-008**: Quando todas as refeições do dia estiverem registradas, "o agora" MUST exibir um estado de **dia concluído**, sem erro.
- **FR-009**: O ato de registrar MUST NOT barrar o paciente nem exigir passo extra além do toque (assinatura "nunca barra").

#### Correção (última-escrita-vence)

- **FR-010**: O paciente MUST poder **corrigir** o registro de uma refeição (ex.: pulei→feito) e **desfazê-lo** (voltar a não-registrada); o **estado vigente** de uma refeição num dia MUST ser o **último** registro, e desfazer produz a **ausência** de estado vigente (não um quarto estado).
- **FR-011**: O armazenamento dos registros MUST ser **append-only** (histórico de eventos preservado), com o estado vigente derivado do último evento por (paciente, refeição, dia).
- **FR-012**: Reenviar o **mesmo** registro — mesmo (paciente, refeição, dia) e mesmo estado-alvo — MUST ser **idempotente**: não altera o estado vigente nem produz **duplicata observável** (na Home / na visão do paciente). Mudar o estado-alvo é uma **correção legítima** (novo evento), não uma duplicata.
- **FR-013**: Corrigir ou desfazer o registro de uma refeição MUST re-derivar "o agora" pela invariante de FR-006 — ou seja, "o agora" passa a ser a refeição não-registrada mais antiga do dia.

#### Dia, tipo-de-dia e ancoragem (v0)

- **FR-014**: Cada registro MUST carregar a **data** do dia registrado e o **tipo-de-dia em vigor** no momento (o default do plano ou o override escolhido na sessão), já que ainda não se persiste o tipo-de-dia seguido por data.
- **FR-015**: O registro MUST ancorar **direto no plano do paciente** (v0, sem objeto de ciclo).

#### Exposição e privacidade (transversais)

- **FR-016**: O sistema MUST NOT expor ao paciente qualquer métrica de adesão ou percentual derivado do registro; a exposição de números MUST respeitar o **gate de exposição controlado pela nutri**, que **já existe** (Fases anteriores) e NÃO é construído nesta feature. _(Adesão é só-nutri.)_
- **FR-017**: O acesso aos registros de refeição do paciente (dado de saúde) MUST respeitar controle de acesso — só o próprio paciente e a nutri responsável. _(LGPD — transversal.)_

### Key Entities _(include if feature involves data)_

- **Registro de refeição**: evento append-only que marca uma refeição de um dia, para um paciente, como **feito / troquei / pulei**. O estado vigente de cada (paciente, refeição, dia) é o último evento; desfazer é um evento de anulação (ausência de estado vigente), não um quarto estado.
- **Estado de registro**: exatamente um de **feito**, **troquei** ou **pulei**. **troquei** é derivado de uma adequação (substituição/combinação/opção-não-default) confirmada, nunca de um botão dedicado.
- **Consumo efetivo (do "troquei")**: para troquei por substituição/combinação, os alimentos e quantidades efetivamente consumidos, sempre **dentro do grupo de equivalência** (dentro da lista); para troquei por opção, a opção cumprida.
- **"O agora"**: a refeição corrente da Home; deixa de ser estática (a primeira refeição do dia, na ordem do plano) e passa a ser a primeira refeição **não registrada** do dia.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: O paciente registra uma refeição (feito ou pulei) em **no máximo 1 toque** a partir da Home, sem abrir formulário ou outra tela.
- **SC-002**: Após registrar a refeição corrente, "o agora" passa para a próxima refeição não-registrada em **100%** dos casos; com todas registradas, exibe "dia concluído" em **100%** dos casos.
- **SC-003**: Uma refeição com adequação confirmada (substituição/combinação/opção-não-default) é gravada como **troquei** com o consumo efetivo em **100%** dos casos, sem nenhum toque extra além de marcar feito.
- **SC-004**: O paciente corrige um registro (ex.: pulei→feito) e o estado vigente reflete a correção em **100%** dos casos; reenvio do mesmo registro produz **0** duplicatas observáveis.
- **SC-005**: Em **0** casos o paciente vê número de adesão ou percentual derivado do registro (adesão é só-nutri; gate respeitado).
- **SC-006**: Um registro persiste e tem o mesmo estado vigente após **recarregar a Home** e após **encerrar e reabrir a sessão do app** (nova consulta ao backend) em **100%** dos casos — distinguindo-se dos overrides efêmeros das Fases 1/2.

## Assumptions

- **Granularidade**: registro **por refeição** (aponta a opção cumprida); o detalhe item-a-item só aparece no troquei por substituição/combinação (decisão de fronteira Q2).
- **"troquei" derivado**: não é botão — emerge da substituição/combinação/opção-não-default já existente na Home + marcar feito, no mesmo toque (Q3). Comida fora da lista é Fase 4.
- **Correção**: **upsert** por (paciente, refeição, dia), última-escrita-vence, sobre armazenamento append-only; a idempotência de reenvio atua sobre o **estado vigente** (não sobre o histórico), distinguindo retry de correção pelo estado-alvo (Q4).
- **Avanço de "o agora"**: registrar avança "o agora"; o motor de rebalanceamento por consumo real permanece **dormente** (Q1).
- **Dia / tipo-de-dia**: ainda não se persiste o tipo-de-dia seguido por data; o registro carrega a **data** e o **tipo-de-dia em vigor** no momento (default do plano ou override de sessão) e ancora direto no plano (sem objeto de ciclo).
- **Identidade**: v0 = auth stub, paciente fixo por env; o registro atrela-se a esse paciente. O endurecimento real de auth segue pendente (transversal).
- **Exposição**: o gate de exposição controlado pela nutri já existe e é respeitado; registrar não devolve métrica ao paciente.

## Out of Scope _(desta feature)_

- **Cálculo da métrica de adesão** e o **relatório de ciclo** (consomem o registro; Fase 3 posterior). Aqui só se garante que o registro **não vaza** número ao paciente.
- **Ciclo como objeto** / versionamento de planos — o registro ancora direto no plano (v0).
- **Registro persistido do tipo-de-dia seguido por data** (default vs override por data) — o registro carrega o tipo-de-dia em vigor sem materializá-lo.
- **Ligar o motor de rebalanceamento ao consumo real** (gatilho dormente da Fase 2). **Nota:** "o agora" avança ao registrar, mas nenhum FR desta feature altera o motor da Fase 2. A regra da Fase 2 (FR-005) já prevê o registro como discriminador de alavancas, mas a implementação v0 ainda seleciona alavancas por posição (gatilho) porque não havia registro; ligar o registro real a essa seleção é incremento futuro — o registro é gravado mas **não** realimenta a prévia de rebalanceamento.
- **Comida fora da lista** (registrar alimento livre fora do plano) — Fase 4 (base de alimentos + casamento de texto + estimativa por IA + piso).
- **Sincronização offline robusta** (fila, retry, resolução de conflito) — Fase 4. **Nota:** o modelo append-only + última-escrita-vence já é escolhido agora para não retrabalhar quando o offline entrar.
- **UI da nutri (web)** e **auto-classificação de alimentos em grupos** — peças separadas da Fase 3.

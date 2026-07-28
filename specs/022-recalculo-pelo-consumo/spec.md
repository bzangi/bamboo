# Feature Specification: Recálculo pelo consumo (dia inteiro) + gatilho como alavanca de último recurso

**Feature Branch**: `022-recalculo-pelo-consumo`

**Created**: 2026-07-27

**Status**: Draft

**Input**: Bug reportado pelo dono no simulador, virado desenho aprovado em conversa nesta sessão. Sintoma: o paciente pulou o lanche da tarde, sobrou saldo no dia, e (a) o jantar continuou exibindo as gramas planejadas, sem absorver o saldo; (b) ao escolher outra opção do jantar — a única refeição não registrada do dia — o app respondeu "Não dá pra ajustar as próximas refeições sem mexer no que está travado — segue o plano e volta amanhã", barrando a troca.

## Contexto: o que muda em relação ao decidido antes

Duas decisões anteriores são revogadas ou restringidas por esta feature. Estão nomeadas aqui porque a spec contradiz artefato aprovado, e contradição silenciosa é o que faz uma regra voltar por acidente:

1. **Q1 / FR-013a da `004-motor-le-registro`** — "registrar não auto-recalcula o tipo-de-dia padrão": o recálculo pelo consumo real só valia enquanto houvesse um override de tipo-de-dia ativo. **Revogada** por esta feature (US1). O registro passa a recalcular o dia sempre.
2. **"a escolha fixou essa"** (`002-rebalanceamento`, adaptador da troca de opção) — a refeição-gatilho nunca é reescalada. **Restringida**, não revogada: continua valendo sempre que existir qualquer outra alavanca no dia; deixa de valer quando o gatilho é a última refeição ajustável (US2).

A regra da `020-edicao-de-refeicao` — "o que o paciente escolheu comer nunca é reescalado" — **não** é tocada e ganha uma guarda explícita (FR-008).

## User Scenarios & Testing _(mandatory)_

### User Story 1 - O dia se reequilibra sozinho depois de registrar (Priority: P1)

O paciente pula o lanche da tarde e toca "Pulei". Sem tocar em mais nada, as refeições seguintes do dia passam a exibir quantidades maiores, absorvendo proporcionalmente o saldo que ficou para trás. O mesmo acontece no sentido oposto: se ele comeu uma refeição maior do que a planejada (registrada como "troquei"), as seguintes diminuem.

Isso já acontecia enquanto o paciente estivesse com um tipo-de-dia trocado à mão; passa a acontecer também no tipo-de-dia programado do dia, que é o caso comum — o paciente não troca de tipo-de-dia todo dia.

**Why this priority**: é o comportamento que o paciente espera de um plano que "dobra sem quebrar", e sem ele o registro é só arquivo: o paciente informa o que aconteceu e a tela não responde. Entrega valor sozinha, sem a US2.

**Independent Test**: registrar qualquer estado numa refeição de um dia sem trocar de tipo-de-dia e observar as quantidades das refeições seguintes na tela inicial.

**Acceptance Scenarios**:

1. **Given** um dia com 4 refeições, nenhuma registrada, tipo-de-dia programado (sem troca à mão), **When** o paciente registra "Pulei" no lanche da tarde (3ª refeição), **Then** os itens flexíveis das refeições seguintes exibem quantidades maiores que as planejadas e aparecem marcados como ajustados, com a frase que explica o porquê.
2. **Given** o mesmo dia, **When** o paciente registra "Feito" numa refeição exatamente como planejada, **Then** nada muda nas seguintes (não há saldo a distribuir).
3. **Given** o mesmo dia, **When** o paciente registra "Troquei" comendo mais do que o planejado, **Then** os itens flexíveis das refeições seguintes exibem quantidades menores, respeitando o piso.
4. **Given** um dia com refeições já registradas, **When** o paciente recarrega a tela inicial, **Then** vê os mesmos valores ajustados (o ajuste é derivado do registro, não de um gesto da sessão).
5. **Given** uma refeição já registrada, **When** o dia é recalculado, **Then** as quantidades dela não mudam — o que foi comido não é reescalado.
6. **Given** um dia sem nenhum registro, **When** o paciente abre a tela inicial, **Then** vê exatamente o plano, sem ajuste e sem marcação de ajustado.

---

### User Story 2 - Trocar a opção da última refeição do dia (Priority: P2)

O paciente registrou todas as refeições do dia menos o jantar. No jantar, ele escolhe outra opção (macarrão → Rap 10). O sistema mostra a consequência: como não há refeição seguinte para ajustar, as quantidades dos itens flexíveis **do próprio jantar** são recalculadas para fechar o dia — e ele confirma ou cancela.

Hoje esse caminho é barrado com uma orientação para seguir o plano, o que é a resposta errada: não existe "próxima refeição" para preservar, e a única coisa ajustável é o jantar.

**Why this priority**: é o sintoma que o dono reportou, mas depende conceitualmente da US1 estar decidida (mesma regra: o dia se fecha no que sobra). Entregue sozinha, já destrava a troca; entregue depois da US1, fica coerente com o número que a tela já mostra.

**Independent Test**: registrar todas as refeições do dia menos uma, escolher outra opção nessa refeição e verificar que a prévia oferece confirmação com as quantidades dela recalculadas.

**Acceptance Scenarios**:

1. **Given** todas as refeições do dia registradas exceto a última, e um saldo de kcal em aberto, **When** o paciente escolhe outra opção nessa última refeição, **Then** a prévia mostra as quantidades dos itens flexíveis **dessa mesma refeição** recalculadas e oferece confirmar ou cancelar.
2. **Given** o mesmo estado, **When** a prévia é exibida, **Then** o texto identifica que o ajuste é na própria refeição, não "no resto do dia".
3. **Given** um dia em que existe ao menos uma outra refeição não registrada com item flexível, **When** o paciente escolhe outra opção numa refeição qualquer, **Then** o comportamento é o de hoje: ajusta as outras refeições e nunca a do gatilho.
4. **Given** a última refeição do dia com todos os itens travados ou "à vontade", **When** o paciente escolhe outra opção nela, **Then** o sistema mantém a orientação de seguir o plano (não há nada ajustável) e ainda assim permite confirmar a troca.
5. **Given** o paciente editando a composição de uma refeição em lote (escolhendo alimentos e quantidades item a item), **When** ele confirma e essa é a última refeição não registrada, **Then** as quantidades que ele escolheu **não** são reescaladas.

---

### Edge Cases

- **Dia sem nenhuma refeição não-registrada** (o paciente registrou tudo): não há alavanca nem gatilho ajustável; o dia é exibido como registrado, sem ajuste.
- **Saldo grande demais para caber**: aumentar não tem teto (o saldo do dia é o próprio limite), então o déficit sempre cabe ou não há alavanca; reduzir respeita o piso e pode resultar em orientação de seguir o plano.
- **Refeição registrada de um tipo-de-dia diferente do exibido**: o consumo é lido independentemente do tipo-de-dia, então o saldo continua correto; a marcação visual de "registrado" segue a regra de hoje, sem mudança (ver FR-005).
- **Itens "à vontade" e travados**: nunca entram no recálculo, em nenhum dos dois cenários — reescalar salada ou furar o que a nutri travou é o que a regra existe para impedir.
- **Registro alterado depois** (o paciente corrige o estado de uma refeição): o recálculo é derivado do registro a cada leitura, então a leitura seguinte já reflete o estado novo; nada fica pendurado.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: Quando existir qualquer refeição registrada hoje, o sistema MUST recalcular as quantidades dos itens flexíveis das refeições **não registradas** do dia a partir do consumo real, independentemente de o paciente ter trocado o tipo-de-dia à mão.
- **FR-002**: O recálculo MUST distribuir o saldo proporcionalmente à contribuição de kcal de cada item flexível, respeitando o piso por item; MUST NOT alterar itens travados nem itens "à vontade".
- **FR-003**: Refeição registrada MUST NOT ter suas quantidades alteradas pelo recálculo; o que foi comido entra na conta do dia, não na lista do que ainda pode mudar.
- **FR-004**: O sistema MUST sinalizar na tela do paciente quais refeições foram ajustadas e por quê, usando a sinalização que já existe — sem número de "quanto falta".
- **FR-005**: A marcação de "registrado" por refeição MUST permanecer inalterada por esta feature em todos os casos, inclusive quando o registro veio de outro tipo-de-dia. A mudança se restringe às quantidades exibidas.
- **FR-006**: Dia sem nenhum registro MUST exibir o plano sem ajuste algum.
- **FR-007**: Ao escolher outra opção de refeição, quando **não houver nenhuma** outra refeição não registrada com item ajustável, o sistema MUST recalcular os itens flexíveis da própria refeição-gatilho para fechar o dia, e MUST apresentar isso como prévia confirmável.
- **FR-008**: A regra do FR-007 MUST NOT ser aplicada quando a composição da refeição-gatilho tiver sido definida pelo paciente item a item (edição em lote) — nesse caso as quantidades escolhidas por ele são preservadas.
- **FR-009**: Enquanto existir ao menos uma outra refeição não registrada com item ajustável, a refeição-gatilho MUST continuar fora do recálculo — o comportamento atual é preservado, não apenas tolerado.
- **FR-010**: Quando a refeição-gatilho for a única ajustável e não tiver nenhum item elegível (todos travados ou "à vontade"), o sistema MUST manter a orientação de seguir o plano e MUST ainda permitir que o paciente confirme a troca ("nunca barra").
- **FR-011**: A prévia MUST descrever corretamente onde o ajuste acontece: quando a refeição afetada é a própria refeição-gatilho, o texto MUST NOT dizer que o ajuste é nas refeições seguintes.
- **FR-012**: Nenhum ajuste MUST ser persistido — o recálculo é derivado do registro em cada leitura, e alterar um registro MUST refletir na leitura seguinte sem limpeza extra.

### Key Entities

Nenhuma entidade nova. A feature lê o registro do dia (estado por refeição + composição real do que foi consumido) e o plano do dia (refeições, opções, itens com marcação de travado / grupo de substituição / "à vontade"). Não há campo novo nem dado novo armazenado.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Depois de pular uma refeição, o paciente vê as quantidades das refeições seguintes já ajustadas na primeira vez que a tela inicial carrega, sem executar nenhuma ação adicional.
- **SC-002**: A troca de opção na última refeição não registrada do dia deixa de ser barrada: 100% dos casos em que existe item flexível nessa refeição resultam em prévia confirmável, contra 0% hoje.
- **SC-003**: Nenhum cenário de rebalanceamento já coberto por teste **em que existe outra refeição ajustável** muda de resultado — verificável por reversão (desligar a regra nova não altera nenhum desses casos). Os cenários em que o gatilho é a única refeição ajustável **mudam de propósito**: eram a caracterização do comportamento que esta feature corrige, e são reescritos, nunca apagados.
- **SC-004**: A marcação de "registrado" por refeição é idêntica antes e depois da feature, em dia com e sem troca de tipo-de-dia à mão.
- **SC-005**: Nenhum dado novo é gravado por esta feature: as contagens das tabelas de registro e de plano são idênticas antes e depois de carregar a tela e de gerar uma prévia.
- **SC-006**: A revogação da decisão Q1 da `004` está registrada como decisão de arquitetura datada, com o motivo — nenhum leitor futuro encontra a regra antiga sem encontrar a revogação.

## Assumptions

- O saldo é ancorado em **kcal**, como todo o rebalanceamento existente; os macros entram na avaliação da faixa, não na distribuição.
- O alvo do dia continua sendo a soma das opções padrão de **todas** as refeições do dia, inclusive a pulada — é o que faz pular gerar saldo em vez de simplesmente encolher o dia.
- "Refeições seguintes" na prática significa **refeições não registradas**, que é como o motor já opera; uma refeição anterior ainda não registrada também é alavanca. Isso é intencional: o paciente pode registrar fora de ordem.
- A tolerância da faixa-alvo e o piso por item continuam vindo dos parâmetros do paciente/nutricionista, sem valor novo.
- O ajuste continua **efêmero** e derivado, coerente com o rebalanceamento de hoje.
- A mudança não exige alteração no app do paciente para a US1 (a sinalização de "ajustado" já existe); a US2 exige apenas texto novo na prévia.

## Resíduo aceito (decisão do dono, 2026-07-27)

**O registro de "Feito" grava o planejado, não o que a tela exibiu.** Hoje o consumo de uma refeição marcada como "Feito" é derivado dos itens **planejados** da opção cumprida; só "Troquei" grava snapshot de quantidades. Logo, se a tela exibir uma quantidade ajustada e o paciente marcar "Feito", o que fica registrado é a quantidade planejada.

Isso **já é verdade hoje** enquanto há um tipo-de-dia trocado à mão, mas esta feature transforma o caso de borda no caminho padrão de todo dia com registro. Consequência: a métrica de adesão que a nutricionista lê subcontará o que o paciente comeu seguindo o plano ajustado.

**Não é corrigido aqui, por decisão.** Corrigir exige decidir como se **chama** "feito com ajuste": o vocabulário do registro é feito/troquei/pulei, e mandar as quantidades ajustadas pelo caminho existente faria o sistema classificar como "Troquei" — rotulando adaptação **do sistema** como adaptação **do paciente**, o que corrompe a mesma métrica por outro lado. É decisão de produto sobre o vocabulário do registro, e vira spec própria.

## Out of Scope

- Corrigir o resíduo acima (registro de "Feito" com quantidade ajustada) — spec separada.
- Prévia de impacto **antes** de confirmar o registro (o dono escolheu ver o resultado depois, na tela inicial — pôr um modal no registro contraria o "registro é um toque").
- Exibir o delta ("200 g → 260 g") nos itens da tela inicial; a tela mostra o número novo.
- Persistir o ajuste em banco.
- Rever o resíduo `014/A2` (divergência entre a marcação por posição e o motor quando o registro veio de outro tipo-de-dia) — esta feature MUST NOT mexer nele, só não pode piorá-lo.
- Comida fora da lista (Fase 4), que é o que permitiria registrar consumo acima do combinado.

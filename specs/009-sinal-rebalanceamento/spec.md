# Feature Specification: Coerência da troca de tipo-de-dia após consumo (refeição registrada + sinal de rebalanceamento)

**Feature Branch**: `009-sinal-rebalanceamento`

**Created**: 2026-06-10

**Status**: Draft

**Input**: User description (consolidado após o gate Specify): "Quando o motor ajusta a gramatura de refeições (na troca de tipo-de-dia ou na troca de opção), o app do paciente deve sinalizar visivelmente, nos slots ajustados, que houve rebalanceamento — uma ação/aviso, não só o número novo. Modelo: o paciente tem um registro do que comeu no dia; a cada troca de tipo-de-dia, comparamos o novo dia com o que já foi consumido. Além disso, a refeição que o paciente já registrou deve aparecer como registrada (feito/troquei/pulei) também no novo tipo-de-dia (pareada por posição), e só as refeições restantes são rebalanceadas e sinalizadas. Coerente com 'rebalanceamento dá ação, não número' e 'nunca barra'."

## Contexto e o problema

O motor de rebalanceamento já funciona e já segue o modelo certo: o paciente tem um **registro do que comeu no dia** (efêmero do ponto de vista do plano, mas persistido como evento de consumo), e a cada **troca de tipo-de-dia** o sistema compara o **novo tipo-de-dia** com **o que já foi consumido**, reconciliando as refeições que faltam (feature 004). O mesmo vale na **troca de opção** (features 002/005).

Dois buracos de UX tornam isso confuso na prática:

1. **O ajuste é silencioso.** A tela mostra só a gramatura nova, sem nada que diga que houve um ajuste, ou por quê. Uma redução de ~10% no almoço/jantar passa despercebida.
2. **A refeição já registrada "some" ao trocar.** Como cada tipo-de-dia tem suas próprias refeições (ids diferentes), ao trocar de tipo-de-dia a refeição que o paciente acabou de registrar aparece **como se não tivesse sido feita** no novo tipo. Ex.: comi o café no dia de treino, troco para descanso, e o café do descanso aparece **não-registrado** — então parece que "nada aconteceu".

Juntos, esses dois buracos fazem o paciente olhar a tela depois de comer + trocar e concluir, erradamente, que o sistema ignorou o que ele fez. A feature fecha os dois: **(A)** a refeição registrada aparece como registrada também no novo tipo-de-dia (pareada por posição), e **(B)** as refeições restantes mostram um **sinal visível de "ajustado"** com o porquê — sem número, sem culpa, sem barrar.

Isso cumpre a assinatura **"rebalanceamento dá ação, não número"**: hoje ele não dá nem ação nem aviso.

### Decisões do gate (Specify, 2026-06-10) — incorporadas

- **Escopo deixou de ser "mobile-only / zero API".** A coerência exige parear por posição contra o registro (que vive no servidor). O badge reusa o campo `registro` que **já existe** na resposta do `/today` (mudança de **lógica** de leitura, não de contrato). Para o sinal "ajustado", o servidor expõe **quais refeições foram reconciliadas** via um campo **aditivo e não-quebrável** (Q1=A). Nada de mudança na matemática do motor.
- O sinal vale para os **três** estados de registro: **feito, troquei e pulei** (qualquer um muda o que sobra a reconciliar — `pulei` consome zero e ainda assim altera o restante).
- Granularidade do sinal: **por refeição** (marcador no card), não por item.
- Conteúdo/tom: **frase curta de porquê** referenciando o consumo (ex.: "Ajustei o resto do dia porque você já comeu"), **sem** kcal/macro/percentual.
- Ciclo de vida: **persistente** enquanto o ajuste vigorar; some ao reverter/desfazer/registrar.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - A refeição que já comi aparece como feita no novo tipo-de-dia (Priority: P1)

O paciente registra uma refeição (feito/troquei/pulei) e troca o tipo-de-dia. A refeição correspondente **na mesma posição** do novo tipo-de-dia aparece **já registrada**, com o mesmo estado — não como pendente. Ex.: comeu o café no treino, troca para descanso → o café do descanso aparece marcado como feito.

**Why this priority**: É o conserto mais direto da confusão que originou a feature. Sem isso, a refeição já feita "reseta" visualmente ao trocar e o paciente acha que o sistema esqueceu o que ele fez. É a base da coerência; sozinha já entrega valor (o dia "lembra" o que foi consumido, independente do tipo-de-dia).

**Independent Test**: Registrar a refeição da posição P num tipo-de-dia; trocar para outro tipo-de-dia; confirmar que a refeição da posição P do novo tipo aparece com o mesmo estado de registro (feito/troquei/pulei).

**Acceptance Scenarios**:

1. **Given** o paciente registrou a refeição da posição P (ex.: café) como "feito" e trocou de tipo-de-dia, **When** ele vê o novo tipo-de-dia, **Then** a refeição da posição P do novo tipo aparece marcada como "feito".
2. **Given** o paciente registrou a refeição da posição P como "pulei" (ou "troquei"), **When** ele troca de tipo-de-dia, **Then** a refeição da posição P do novo tipo reflete o mesmo estado ("pulei"/"troquei").
3. **Given** a refeição registrada aparece marcada no novo tipo, **When** o paciente a observa, **Then** ela permanece no **planejado** (não rebalanceada) e **sem** sinal de "ajustado" — ela é a referência (single-count), não um slot reconciliado.

---

### User Story 2 - Perceber que o resto do dia se adaptou ao que já comi (Priority: P1)

As refeições ainda-não-registradas do novo tipo-de-dia aparecem com a gramatura recalculada **e com um sinal visível** indicando que foram ajustadas em função do consumo. O paciente entende, sem comparar números, que o plano se adaptou ao que ele comeu.

**Why this priority**: É a outra metade da coerência e o que cumpre "dá ação, não número". Com a US1 (refeição feita marcada) o paciente vê que o sistema sabe o que ele comeu; com a US2 ele vê o que o sistema **fez** com essa informação.

**Independent Test**: Após registrar uma refeição e trocar de tipo-de-dia, confirmar que as refeições reconciliadas exibem o sinal de ajuste e que o sinal comunica o porquê sem expor kcal/macro/percentual.

**Acceptance Scenarios**:

1. **Given** o paciente registrou uma refeição e trocou para um tipo-de-dia que reconciliou as refeições restantes, **When** ele olha a tela, **Then** cada refeição cuja gramatura mudou exibe um sinal visível de "ajustado".
2. **Given** uma refeição reconciliada com o sinal, **When** o paciente o observa, **Then** ele comunica a adaptação ao consumo (frase curta de porquê), sem número de kcal, de macro ou percentual.
3. **Given** o paciente ainda não registrou nada no dia, **When** ele troca o tipo-de-dia (sem gap → sem reconciliação), **Then** nenhuma refeição exibe sinal de ajuste.

---

### User Story 3 - Sinal preciso: só onde houve ajuste (Priority: P2)

O sinal de "ajustado" aparece **exclusivamente** nas refeições cuja gramatura foi recalculada. A refeição registrada (que fica no planejado, US1) não mostra "ajustado". Refeições não tocadas pela reconciliação também não.

**Why this priority**: Guarda de confiança. Sinal no lugar errado mente para o paciente. Precisão separa "ajuda" de "ruído".

**Independent Test**: Após uma reconciliação, verificar que o conjunto de refeições com sinal de "ajustado" é exatamente o conjunto com gramatura ≠ planejado, e que a refeição registrada (US1) não está nesse conjunto.

**Acceptance Scenarios**:

1. **Given** uma reconciliação que ajustou só algumas refeições, **When** o paciente vê a lista, **Then** somente as refeições com gramatura alterada exibem o sinal; as inalteradas não.
2. **Given** a refeição registrada que disparou a reconciliação, **When** o paciente a vê no novo tipo, **Then** ela aparece como registrada (US1), no planejado, e **sem** sinal de "ajustado".

---

### User Story 4 - Mesmo sinal na troca de opção (Priority: P3)

Quando a reconciliação vem da **troca de opção** de uma refeição, as outras refeições recalculadas exibem o **mesmo** sinal de "ajustado", com a mesma semântica e tom.

**Why this priority**: Consistência entre os dois gatilhos de rebalanceamento. Aditivo sobre a US2; reaproveita o mesmo sinal. (A troca de opção não cria refeição registrada nova, então a US1 não se aplica a ela.)

**Independent Test**: Trocar a opção de uma refeição que rebalanceia as demais; confirmar que as refeições ajustadas exibem o mesmo sinal; desfazer a troca (feature 005) remove o sinal junto.

**Acceptance Scenarios**:

1. **Given** uma troca de opção que rebalanceou outras refeições, **When** o paciente as vê, **Then** elas exibem o mesmo sinal de "ajustado" da troca de tipo-de-dia.
2. **Given** uma troca de opção sinalizada, **When** o paciente desfaz a troca, **Then** o sinal some junto com os ajustes revertidos.

---

### Edge Cases

- **Posição sem correspondente no novo tipo**: se o novo tipo-de-dia não tem refeição na posição P registrada, nenhum badge é exibido para ela; o consumo daquela refeição **ainda conta** na reconciliação (entra no `consumido`).
- **Estado cruzado de registro (feito/troquei em tipos diferentes)**: a refeição da posição P no novo tipo tem um cardápio diferente do que foi efetivamente comido. O badge reflete o **estado** registrado (feito/troquei/pulei); _default adotado_: o card do slot mostra os itens planejados do **novo** tipo (o badge sinaliza "já resolvido hoje", não "comi exatamente estes itens"). **Assumption vetável** — ver Assumptions.
- **Sem gap → sem sinal**: trocar sem ter comido, ou quando o projetado cai dentro da faixa-alvo (motor "sem-ação"), não reconcilia → nenhum sinal.
- **Recusa do motor (estoura-piso/sem-alavanca)**: o motor mantém o planejado ("nunca barra") → não houve mudança de gramatura → nenhum sinal de "ajustado". (Aviso de "não consegui ajustar" é outra feature.)
- **Voltar ao tipo-de-dia padrão**: ao remover o override (tipo padrão por weekday nunca auto-ajusta — Q1 da 004), some o sinal de "ajustado"; o badge da refeição registrada continua coerente com o registro do dia.
- **Registrar a refeição reconciliada**: ao registrar uma refeição que estava com "ajustado", ela sai do conjunto reconciliado (passa a registrada) e perde o sinal de "ajustado".
- **Re-troca de opção (A→B→C)**: o sinal acompanha o conjunto de ajustes vigente; nada de sinal "fantasma" de uma troca anterior.

## Requirements _(mandatory)_

### Functional Requirements — Refeição registrada (coerência, US1)

- **FR-001**: Com um tipo-de-dia em override ativo, para cada refeição registrada hoje na posição P (em qualquer tipo-de-dia), o sistema DEVE marcar como registrada a refeição da **mesma posição P** no tipo-de-dia exibido, com o **mesmo estado** (feito/troquei/pulei).
- **FR-002**: O pareamento entre a refeição registrada e o slot do novo tipo é **por posição** (type-agnostic), reusando a mesma regra de single-count que exclui essa posição do rebalanceamento.
- **FR-003**: A refeição registrada pareada DEVE permanecer no **planejado** (não recebe ajuste de gramatura) e **não** exibe o sinal de "ajustado".
- **FR-004**: Se o novo tipo-de-dia não tiver refeição na posição P, nenhum badge é exibido para essa posição; o consumo correspondente continua contando na reconciliação.

### Functional Requirements — Sinal de "ajustado" (US2/US3/US4)

- **FR-005**: Quando o app exibe refeições com gramatura recalculada por reconciliação (gatilho: troca de tipo-de-dia OU troca de opção), o sistema DEVE exibir um **sinal visível de "ajustado"**, **por refeição** (marcador no card), em cada refeição reconciliada.
- **FR-006**: O sinal DEVE aparecer **somente** nas refeições cuja gramatura difere do planejado por efeito da reconciliação; refeições não alteradas e a refeição registrada (FR-003) NÃO o exibem.
- **FR-007**: O sinal DEVE comunicar a adaptação ao consumo com uma **frase curta de porquê** (ex.: "Ajustei o resto do dia porque você já comeu"), e NÃO deve expor número de kcal, número de macro nem percentual de variação.
- **FR-008**: O sinal é **persistente** enquanto o ajuste vigorar e DEVE desaparecer quando o ajuste deixar de valer — ao voltar ao tipo padrão, ao desfazer a troca de opção, ou ao registrar a refeição reconciliada.
- **FR-009**: O sinal de "ajustado" da troca de tipo-de-dia e o da troca de opção DEVEM ser visualmente o mesmo (mesma linguagem).

### Functional Requirements — Fronteira e invariantes

- **FR-010**: Para o sinal da troca de tipo-de-dia, o servidor DEVE expor — de forma **aditiva e não-quebrável** no `GET /today` — **quais refeições do dia exibido foram reconciliadas** pelo rebalanceamento, para o app sinalizá-las. (O badge de registro da US1 reusa o campo `registro` já existente; é mudança de lógica, não de contrato.)
- **FR-011**: A feature NÃO deve alterar a matemática do motor de rebalanceamento nem o que ele recalcula.
- **FR-012**: O sinal NUNCA deve barrar, bloquear ou exigir ação do paciente — é informativo; o paciente segue podendo registrar/trocar normalmente ("nunca barra").
- **FR-013**: A feature não cria nova entidade persistida; o badge e o sinal são **derivados** por requisição a partir do registro de consumo já existente e do plano exibido.

### Key Concepts

- **Registro de consumo (do dia)**: o que o paciente comeu hoje (feito/troquei/pulei), por posição de refeição, válido para qualquer tipo-de-dia. É a referência da reconciliação.
- **Reconciliação (na troca)**: comparar o tipo-de-dia exibido com o consumo do dia e recalcular as refeições restantes. Já existe (motor); a feature a torna visível.
- **Refeição registrada pareada**: o slot do novo tipo, na posição de uma refeição já registrada, exibido como registrado e no planejado (single-count) — não recebe sinal de "ajustado".
- **Refeição reconciliada**: refeição restante com gramatura ≠ planejado por efeito da reconciliação — recebe o sinal de "ajustado".

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Após registrar a refeição da posição P e trocar de tipo-de-dia, em 100% dos casos o slot da posição P no novo tipo aparece com o mesmo estado de registro; e não recebe sinal de "ajustado".
- **SC-002**: Após uma reconciliação, 100% das refeições com gramatura alterada exibem o sinal de "ajustado" e 0% das inalteradas (incluindo a registrada) o exibem.
- **SC-003**: Em teste de uso, depois de comer + trocar de tipo-de-dia, o paciente identifica que (a) a refeição que comeu está registrada e (b) o resto do dia foi adaptado — **sem precisar comparar números** (hoje ambos são imperceptíveis).
- **SC-004**: O sinal de "ajustado" não contém nenhum número de kcal/macro nem percentual (zero gatilhos de culpa numérica).
- **SC-005**: O sinal some em no máximo uma atualização de tela após o ajuste deixar de valer (voltar ao tipo padrão, desfazer a troca, ou registrar a refeição).
- **SC-006**: As gramaturas exibidas permanecem idênticas às de antes desta feature — a matemática do motor não muda; apenas ganham badge/sinal.

## Assumptions

- **Estado cruzado de registro**: para uma refeição registrada pareada por posição num tipo-de-dia de cardápio diferente, o card mostra os itens planejados do **novo** tipo e o badge reflete o estado registrado (feito/troquei/pulei). O badge significa "já resolvido hoje", não "comi exatamente estes itens". _Vetável_: se preferir mostrar o que foi efetivamente consumido nesse slot, sai uma decisão de Plan (precisa carregar o snapshot consumido também na exibição).
- O sinal é **informativo**, não um controle; não cria caminho de desfazer (desfazer da troca = feature 005; "voltar" da troca de tipo-de-dia = re-trocar o tipo).
- Não há sinal de "não consegui ajustar" (recusa por piso/sem-alavanca) nesta feature.
- O campo aditivo do `GET /today` (FR-010) é não-quebrável: clientes que o ignoram seguem funcionando.
- Reaproveita o estado de sessão já existente no app (overrides/swaps da 005) para o caminho de troca de opção; nenhuma persistência nova.

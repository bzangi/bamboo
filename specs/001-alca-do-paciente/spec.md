# Feature Specification: Alça do paciente — ver "o agora" e substituir

**Feature Branch**: `001-alca-do-paciente`

**Created**: 2026-05-31

**Status**: Draft

**Input**: User description: "alça do paciente: ver a refeição do momento (o agora) e substituir um alimento flexível dentro do grupo, com quantidade recalculada e medida caseira; item travado não troca"

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Ver "o agora" (Priority: P1)

O paciente abre o app e, sem buscar nem navegar, vê a refeição do momento ("o agora") com seus alimentos e quantidades, sob o rótulo **anunciado** do tipo-de-dia ("Hoje: dia de treino"). Logo abaixo, vê a lista das demais refeições do dia, na ordem.

**Why this priority**: É o momento de uso dominante (consulta: "o que como agora?") e a primeira prova viva da assinatura do produto — "mostra o certo por padrão, sem caçar". Entrega valor sozinha, mesmo sem a substituição: o paciente já consulta seu plano do dia certo. É o MVP mínimo viável.

**Independent Test**: Com um plano semeado para um paciente, abrir o app e confirmar que a tela inicial mostra (a) o rótulo do tipo-de-dia do dia corrente, (b) a refeição do momento com seus itens, e (c) a lista das refeições do dia — sem que o paciente precise tocar em nada além de abrir o app.

**Acceptance Scenarios**:

1. **Given** um paciente com um plano ativo e um tipo-de-dia programado para o dia da semana corrente, **When** o paciente abre o app, **Then** o app exibe no topo o rótulo do tipo-de-dia de forma anunciada (ex.: "Hoje: dia de treino") e a refeição do momento, sem exigir navegação.
2. **Given** o plano do dia tem várias refeições, **When** a tela inicial carrega, **Then** o app lista todas as refeições do dia na ordem definida, com a refeição do momento em destaque.
3. **Given** uma refeição tem mais de uma opção pré-montada (ex.: "3 almoços"), **When** a refeição é exibida, **Then** o app mostra a **opção default** dessa refeição, sinalizando que é a default e que existem outras opções.
4. **Given** o nível de exposição do paciente está em "oculto", **When** os itens da refeição são exibidos, **Then** o app mostra alimentos e quantidades **sem** números nutricionais (kcal/macros), respeitando o gate de exposição.
5. **Given** o nível de exposição permite macros ou kcal, **When** os itens são exibidos, **Then** o app mostra os números nutricionais no nível autorizado para aquele paciente.

---

### User Story 2 - Substituir num toque (Priority: P2)

O paciente toca num alimento **flexível** da refeição, vê as alternativas do mesmo grupo já com a **quantidade recalculada** e a **medida caseira** correspondente, escolhe uma e a refeição na tela passa a refletir a troca. Um item **travado** não oferece troca.

**Why this priority**: É a alça que prova a tese — adaptar o plano à vida real, sem conta de cabeça. Depende de a consulta ("o agora") já existir para ter onde a troca acontecer, por isso vem depois da US1.

**Independent Test**: Com o plano semeado contendo ao menos um item flexível com substitutos e um item travado, tocar no item flexível e confirmar que aparecem alternativas do mesmo grupo com quantidade equivalente + medida caseira; selecionar uma e ver a refeição atualizar; confirmar que o item travado não abre opção de troca.

**Acceptance Scenarios**:

1. **Given** um item de refeição flexível pertencente a um grupo de substituição com outros alimentos, **When** o paciente toca no item, **Then** o app apresenta as alternativas do **mesmo grupo**, cada uma com a quantidade recalculada e a medida caseira correspondente.
2. **Given** a lista de alternativas está aberta, **When** o paciente seleciona uma alternativa, **Then** o app atualiza a refeição exibida para o novo alimento, com a nova quantidade e a medida caseira (estado local, sem persistir no v0).
3. **Given** um item de refeição **travado**, **When** o paciente toca nele, **Then** o app **não** oferece opção de troca.
4. **Given** uma alternativa do grupo, **When** sua quantidade equivalente é calculada, **Then** a quantidade preserva o nutriente-base do grupo (carbo por carbo, proteína por proteína, conforme a base de equivalência do grupo) dentro da tolerância aceita.
5. **Given** uma alternativa cujo alimento tem medidas caseiras cadastradas, **When** a alternativa é exibida, **Then** a quantidade é arredondada para a medida caseira mais próxima e a medida é apresentada como unidade principal (ex.: "2 colheres de sopa").

---

### Edge Cases

- **Item flexível sem substitutos no grupo**: quando o grupo do item não tem nenhum outro alimento elegível, o app informa que não há alternativas disponíveis — sem barrar com erro, apenas comunica a ausência. (Assinatura: "nunca barra".)
- **Item flexível sem grupo definido**: um item não-travado mas sem grupo de substituição associado não é substituível; o app não oferece troca para ele.
- **Alvo fora do grupo**: o app só oferece alternativas do mesmo grupo; uma troca para alimento de outro grupo é rejeitada e não é aplicada (guarda de domínio — não deve ser alcançável pela UI, mas o cálculo a recusa).
- **Alvo com nutriente-base zero**: um alimento-alvo cujo valor do nutriente-base do grupo é zero não pode ser destino de equivalência; o app o exclui das alternativas oferecidas (recusa o cálculo, não trava o app).
- **Alvo sem medida caseira**: quando o alimento-alvo não tem medida caseira cadastrada, o app exibe a quantidade em gramas, sem rótulo de medida caseira.
- **Faixa-alvo, não teto**: a substituição dentro do grupo **preserva** o nutriente-base (é equivalência), não reduz nem "economiza". O app **não** enquadra a troca como "cortar"/"economizar caloria" nem mostra bucket de calorias em % — comer de menos é tão fora de adesão quanto comer de mais.
- **Nenhuma refeição registrada hoje**: "o agora" é a **primeira refeição do dia** (estado inicial e, no v0 desta feature, o estado permanente — ver FR-006a).
- **Sem tipo-de-dia para o dia corrente**: ver Assumptions (o v0 assume programação cobrindo os 7 dias da semana).

## Requirements _(mandatory)_

### Functional Requirements

#### Ver "o agora" (US1)

- **FR-001**: O sistema MUST apresentar, na tela inicial do paciente, a refeição do momento ("o agora") sem exigir que o paciente busque ou navegue.
- **FR-002**: O sistema MUST exibir de forma **anunciada** e sempre visível o rótulo do tipo-de-dia do dia corrente (ex.: "Hoje: dia de treino"), resolvido pela programação semanal default do plano para o dia da semana atual — nunca de forma silenciosa.
- **FR-003**: O sistema MUST listar todas as refeições do dia, na ordem definida, além de destacar a refeição do momento.
- **FR-004**: Para cada refeição com múltiplas opções pré-montadas, o sistema MUST exibir a opção **default**, sinalizando que é a default e que há outras opções.
- **FR-005**: O sistema MUST exibir, para os itens da refeição, alimentos e quantidades; a exibição de números nutricionais (kcal/macros/%) MUST respeitar o nível de exposição configurado para aquele paciente (oculto / só % / % + macros / kcal cheio).
- **FR-005a**: O sistema MUST exibir o **horário** da refeição quando este estiver definido (informação que ajuda o paciente a se organizar e a nutri a planejar). O horário é metadado de exibição e **NÃO** determina "o agora" (ver FR-006) — a feature não depende dele.
- **FR-006**: O sistema MUST resolver "o agora" como a **refeição seguinte à última refeição registrada no dia corrente**. A contagem **reseta a cada dia**: sem registro no dia anterior, hoje recomeça da primeira refeição; conforme o paciente registra refeições, "o agora" avança para a seguinte. (Decisão de produto — não usa relógio/horário.)
- **FR-006a** _(dependência / comportamento no v0)_: O avanço de "o agora" depende do **registro de refeição** (feito / troquei / pulei), que está **fora do escopo desta feature** (diferido para fase posterior — ver Out of Scope). Portanto, nesta feature (sem registro disponível), "o agora" resolve **sempre para a primeira refeição do dia**; a regra completa de avanço (FR-006) passa a valer quando o registro existir.

#### Substituir num toque (US2)

- **FR-007**: Para um item de refeição flexível (não travado e associado a um grupo de substituição), o sistema MUST permitir abrir as alternativas de troca com **um toque**.
- **FR-008**: O sistema MUST listar como alternativas apenas alimentos do **mesmo grupo de substituição** do item, cada um com a quantidade recalculada e a medida caseira correspondente.
- **FR-009**: A quantidade recalculada de uma alternativa MUST preservar o nutriente-base do grupo (a base de equivalência: carbo, proteína, gordura ou kcal) dentro de uma tolerância aceita.
- **FR-010**: O sistema MUST arredondar a quantidade recalculada para a medida caseira mais próxima do alimento-alvo e apresentá-la como unidade principal; quando o alvo não tiver medida caseira, MUST exibir a quantidade em gramas.
- **FR-011**: Ao selecionar uma alternativa, o sistema MUST atualizar a refeição exibida com o novo alimento, a nova quantidade e a medida caseira (estado local no v0; persistência fora de escopo).
- **FR-012**: O sistema MUST NOT oferecer troca para um item travado; um item travado não apresenta gatilho de substituição.
- **FR-013**: O sistema MUST recusar (sem aplicar) qualquer troca para alimento fora do grupo do item, ou para alvo cujo nutriente-base do grupo seja zero, e MUST excluir tais alvos das alternativas oferecidas.
- **FR-014**: Quando um item flexível não tiver alternativas elegíveis no grupo, o sistema MUST comunicar a ausência de alternativas, sem barrar com erro.

#### Transversais

- **FR-015**: O sistema MUST NOT enquadrar a substituição como economia/corte de caloria nem exibir "bucket de calorias em %"; a troca dentro do grupo é equivalência, não redução.
- **FR-016**: O acesso aos dados de plano e saúde do paciente MUST respeitar controle de acesso (somente o próprio paciente e a nutri responsável veem os dados daquele paciente). _(LGPD — transversal.)_

### Key Entities _(include if feature involves data)_

- **Paciente**: pessoa que segue o plano; possui um nível de exposição (quanto número vê) e vínculo com a nutri responsável.
- **Plano**: conjunto do paciente; agrupa tipos-de-dia e a programação semanal. Pertence direto ao paciente no v0.
- **Tipo-de-dia**: variação do plano conforme a atividade (treino pesado / leve / descanso); carrega as refeições daquele tipo de dia.
- **Programação semanal**: mapeia cada dia da semana a um tipo-de-dia (default que o app anuncia).
- **Refeição**: slot do dia (ex.: "Almoço"), com posição na ordem do dia e um **horário opcional** (informativo: quando aquela refeição costuma acontecer — ajuda o paciente a se organizar e a nutri a planejar). O horário não determina "o agora" (ver FR-006).
- **Opção de refeição**: uma das variações pré-montadas de uma refeição (os "3 almoços"); uma é a default. Carrega os itens.
- **Item de refeição**: alimento + quantidade dentro de uma opção, com marcação de flexibilidade — **travado** (não troca) ou **flexível** apontando o grupo dentro do qual pode ser trocado.
- **Alimento**: item da base nutricional com valores por 100 g (kcal, carboidrato, proteína, gordura, fibra); origem TACO no v0.
- **Medida caseira**: tradução de gramas para linguagem real ("1 colher de sopa cheia" = X g), por alimento.
- **Grupo de substituição**: agrupa alimentos equivalentes; define a **base de equivalência** (qual nutriente é preservado na troca). Cada vínculo alimento↔grupo carrega a porção de referência do alimento no grupo (origem do recálculo).
- **Nível de exposição**: gate, controlado pela nutri, de quanto número nutricional o paciente enxerga.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Ao abrir o app, o paciente vê o rótulo do tipo-de-dia e a refeição do momento **sem nenhum toque adicional** (zero passos de navegação).
- **SC-002**: 100% das alternativas oferecidas numa substituição pertencem ao mesmo grupo do item e exibem quantidade equivalente + medida caseira (ou gramas, quando não houver medida caseira).
- **SC-003**: A quantidade recalculada preserva o nutriente-base do grupo dentro de uma tolerância de **≤ 2%** em relação ao nutriente-base do item original.
- **SC-004**: Item travado apresenta opção de troca em **0** casos (nunca).
- **SC-005**: O paciente conclui uma substituição em **no máximo 2 toques** (1 para abrir as alternativas, 1 para escolher) e vê a refeição atualizada imediatamente.
- **SC-006**: O rótulo do tipo-de-dia está visível e anunciado em 100% das aberturas da tela inicial (nunca silencioso).
- **SC-007**: Quando um item flexível não tem substitutos, o paciente recebe uma mensagem clara de ausência de alternativas (e nunca uma tela de erro/bloqueio).

## Assumptions

- **Auth stub (v0)**: o paciente é fixo (resolvido por configuração de ambiente); autenticação de verdade está fora de escopo desta feature.
- **Plano semeado**: os dados (paciente, plano, grupos, alimentos, refeições, opções, itens) são semeados direto no banco; a UI da nutri para criar plano está fora de escopo.
- **"Hoje"**: o dia da semana corrente é o do relógio/local do dispositivo; assume-se que a programação semanal do plano cobre os 7 dias (há sempre um tipo-de-dia para o dia corrente).
- **"O agora" no v0**: como o registro de refeição é diferido (fora de escopo), "o agora" resolve para a **primeira refeição do dia** nesta feature. A regra completa (avanço pela última refeição registrada, com reset diário — FR-006) só vale quando o registro existir.
- **Escopo do registro**: permanece **diferido** nesta feature — não foi puxada fatia de "marcar refeição"; por isso "o agora" = primeira refeição no v0.
- **Horário da refeição**: a entidade Refeição ganha um campo de **horário (opcional, informativo)**, exibido quando definido. É metadado de planejamento; **não** dispara a lógica de "o agora" (decisão consciente: "o agora" é dirigido pelo registro, não pelo relógio). Reflete-se no data-model do plano e na migração de schema (T2); não altera `docs/schema.ts` nesta etapa.
- **Opção default**: cada refeição com múltiplas opções tem uma marcada como default; o app exibe a default. Escolher outra opção (e o rebalanceamento que isso dispara) está fora de escopo.
- **Arredondamento de medida caseira**: a quantidade equivalente é arredondada para a medida caseira mais próxima do alimento-alvo; sem medida caseira, exibe-se em gramas.
- **Tolerância de equivalência**: ≤ 2% sobre o nutriente-base (parâmetro ajustável).
- **Exposição default**: na ausência de configuração, o nível de exposição é "oculto" (sem números).
- **Aplicar a troca é client-side no v0**: a substituição altera apenas o estado local da tela; nada é persistido.

## Out of Scope _(desta feature)_

- Rebalanceamento multi-refeição e qualquer gatilho dele (escolher entre opções desiguais, troca de tipo-de-dia, registro do que comeu de fato).
- Substituição em combinação (trocar 1 alimento por 2, ex.: macarrão → arroz + batata).
- Override manual do tipo-de-dia / seleção de dia.
- Registro/log (feito / troquei / pulei), métrica de adesão e relatório de ciclo. **Nota:** o avanço de "o agora" (FR-006) depende deste registro; por isso fica como primeira-refeição-do-dia até esta capacidade existir.
- UI da nutri (web) e import de plano por IA.
- Offline robusto, notificações, comida fora da lista.
- Autenticação de verdade (v0 = auth stub).
- Persistência da troca escolhida.

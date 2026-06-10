# Feature Specification: Ciclo de acompanhamento como objeto

**Feature Branch**: `007-ciclo-de-acompanhamento`

**Created**: 2026-06-10

**Status**: Draft — aguardando aprovação do dono do produto (gate Specify→Plan)

**Input**: User description: "Ciclo de acompanhamento como objeto de primeira classe: início (consulta + plano) → duração → fim (reavaliação), versionando os planos do paciente no tempo; fundação da métrica de adesão por período e do relatório de ciclo."

## Visão geral

Hoje o plano pertence **direto ao paciente, sem dimensão temporal** — decisão deliberada do v0, com a ressalva explícita de que "o ciclo vira o wrapper que versiona planos numa fase posterior" (plano-de-build.md:92). **Esta feature é essa fase posterior.** Sem ela, não existe como responder a pergunta que fundamenta a adesão por período e o relatório: _"neste ciclo, com este plano, a adesão foi X"_.

A decisão de produto já está tomada: o ciclo é **objeto de primeira classe** — início (consulta + plano) → duração → fim (reavaliação + relatório), com **plano versionado por ciclo** (decisoes-produto.md:103). O modo de operar também: **autonomia entre consultas** — o paciente se vira sozinho dentro das regras e a nutri **revisa olhando pra trás** no fim do ciclo, sem ping em tempo real (decisoes-produto.md:104). O ciclo de acompanhamento é, junto com autonomia e rebalanceamento, um dos três eixos de diferenciação do produto (Constituição, Princípio I).

Duas fronteiras moldam o escopo:

1. **Pro paciente, o ciclo é invisível.** Nada muda no app: ele segue vendo o plano ativo do dia ("mostra o certo por padrão"). O ciclo é **instrumento da nutri** — e, como ainda não há UI da nutri (seed-first), as capacidades desta feature são exercidas por operação interna/seed, não por telas.
2. **Esta feature não calcula nada.** Ela **estrutura o tempo**: delimita janelas de período e amarra os planos a elas. A métrica de adesão (feature 006, paralela) e o futuro relatório de ciclo **consomem** essa janela.

Três decisões de produto seguem em aberto e estão marcadas como pontos de clarificação nos requisitos: o **ciclo de vida e a duração** (o que abre e o que fecha um ciclo; quem define a duração prevista, se há default e se é obrigatória ao abrir — a pergunta "duração?" do handoff), o **grão do vínculo plano×ciclo** (referência 1:N vs cópia 1:1 — versionar em si já está decidido) e a **retroatividade** (o que fazer com o histórico existente desde a Fase 3).

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Abrir o ciclo na consulta (Priority: P1)

Na consulta, a nutri define o plano do paciente e **abre o ciclo** informando a duração prevista (ex.: 6 semanas). A partir desse momento, o acompanhamento tem um "agora" estruturado: existe a resposta "qual ciclo está valendo, com qual plano, desde quando". Hoje o sistema já responde "qual plano vige agora" (o plano ativo do paciente) e cada registro já guarda o plano em uso no momento; o que não existe é a **dimensão temporal** — o "desde quando" e a janela de período. _(Seed-first: o papel da nutri é exercido via operação do sistema, sem tela.)_

**Why this priority**: É a existência do objeto. Sem ciclo aberto não há janela, não há linha do tempo, não há fundação pra adesão nem pro relatório. Sozinha já entrega o conceito mínimo testável: um ciclo ativo, com início, duração prevista e plano vinculado, invisível ao paciente.

**Independent Test**: Para um paciente com plano ativo, abrir um ciclo informando a duração prevista e confirmar que (a) o ciclo ativo existe com início + duração + plano vinculado, (b) tentar abrir um segundo falha com orientação, (c) o app do paciente permanece idêntico ao de antes.

**Acceptance Scenarios**:

1. **Given** um paciente com plano ativo e nenhum ciclo, **When** a nutri abre um ciclo informando a duração prevista, **Then** o paciente passa a ter um ciclo **ativo** com data de início, duração prevista e o plano vigente vinculado.
2. **Given** um paciente com um ciclo ativo, **When** se tenta abrir um segundo ciclo, **Then** a operação falha com orientação clara (encerrar o vigente primeiro) e nenhuma sobreposição é criada.
3. **Given** um ciclo recém-aberto, **When** o paciente abre o app, **Then** nada mudou pra ele: vê o plano ativo do dia, registra feito/troquei/pulei e rebalanceia exatamente como antes — nenhum vestígio do ciclo.

---

### User Story 2 - Fechar na reavaliação e abrir o próximo (Priority: P2)

No fim do período, a nutri reavalia o paciente: **fecha o ciclo** — o que delimita a janela [início, fim] sem tocar em nenhum dado cru — e abre o seguinte com o plano da nova fase. A sequência de ciclos vira a **linha do tempo do acompanhamento**: é o "revisa olhando pra trás" da decisão de produto (decisoes-produto.md:104) ganhando o objeto sobre o qual olhar.

**Why this priority**: Fechar é o que transforma o ciclo em **período consultável** — a matéria-prima do relatório. Em produção pressupõe a US1 (precisa existir um ciclo aberto), mas o teste é independente: o estado inicial nasce por seed direto de dados. Não depende da US3.

**Independent Test**: Partindo de um ciclo aberto com registros no período — estado montado por **seed direto de dados**, sem exercer a US1 —, fechar o ciclo e confirmar que (a) a janela [início, fim] fica delimitada, (b) nenhum registro do período é alterado ou perdido, (c) um novo ciclo pode ser aberto em seguida (inclusive no mesmo dia) sem sobreposição.

**Acceptance Scenarios**:

1. **Given** um ciclo ativo com registros de refeição no período, **When** a nutri fecha o ciclo, **Then** a janela [início, fim] fica delimitada e **100%** dos registros crus do período permanecem intactos e consultáveis (nada é apagado, alterado ou congelado).
2. **Given** um ciclo fechado hoje, **When** a nutri abre o próximo ciclo no mesmo dia, **Then** os dois ciclos não se sobrepõem e o dia de fronteira pertence a exatamente **um** deles, de forma determinística.
3. **Given** um paciente sem ciclo ativo, **When** se tenta fechar um ciclo, **Then** a operação não tem efeito destrutivo e orienta (não há o que fechar).

---

### User Story 3 - O ciclo responde por um período (Priority: P3)

Para qualquer dia do acompanhamento, o sistema responde **a qual ciclo o dia pertence e qual plano estava vigente** — a pergunta-fundação de "neste ciclo, com este plano, a adesão foi X". Esta feature entrega a **resposta de atribuição** (determinística, estável); quem calcula métrica em cima dela é a adesão (006) e o relatório (feature seguinte).

**Why this priority**: É o contrato de consumo da fundação — o que a adesão e o relatório vão chamar. Em produção pressupõe ciclos abertos e fechados (US1/US2), mas o valor (a resposta de atribuição) é testável de forma independente: o estado nasce por seed direto de dados.

**Independent Test**: Com dois ciclos consecutivos fechados e registros distribuídos no tempo — estado montado por **seed direto de dados**, sem exercer US1/US2 —, consultar a atribuição de dias dentro de cada ciclo, na fronteira entre eles e fora de qualquer janela, e validar que as respostas são determinísticas e estáveis em consultas repetidas.

**Acceptance Scenarios**:

1. **Given** dois ciclos consecutivos com registros, **When** se consulta a atribuição de um dia dentro do primeiro ciclo, **Then** a resposta é o primeiro ciclo (e o plano vigente nele), idêntica em consultas repetidas.
2. **Given** um dia fora de qualquer janela de ciclo, **When** se consulta a atribuição, **Then** a resposta é **"nenhum ciclo"** — e o tratamento desse histórico segue a decisão de retroatividade (ver FR-011).
3. **Given** um ciclo (aberto ou fechado), **When** um consumidor pede a janela e os registros do período, **Then** recebe o intervalo [início, fim] e o conjunto **exato** dos registros do paciente naquelas datas — sem nenhuma métrica calculada junto.

---

### Edge Cases

- **Registro num período sem ciclo ativo**: a quem pertence? Depende da decisão de retroatividade (FR-011). Sob o default recomendado, permanece consultável (ancorado em paciente + plano + dia, como na Fase 3) e fora de qualquer ciclo — a adesão por ciclo simplesmente não o cobre.
- **Troca de plano no meio do ciclo** (replanejamento sem nova consulta formal): vira nova versão dentro do mesmo ciclo ou novo ciclo? Depende do grão do vínculo plano×ciclo (FR-007) — a spec exige apenas que a resposta "qual plano vigia neste dia deste ciclo" continue determinística.
- **Dois ciclos consecutivos no mesmo dia** (fechou e reabriu): o dia de fronteira pertence a exatamente um ciclo, por desempate determinístico (ver Assumptions) — nunca aos dois, nunca a nenhum.
- **Fronteira com troca de plano** (fechou, reabriu **e** trocou o plano ativo no mesmo dia): as leituras de "consumido hoje" do app do paciente são escopadas pelo plano vigente — registros feitos mais cedo naquele dia, sob o plano anterior, deixam de contar no consumido do novo plano. **Limitação herdada** (já acontece hoje ao trocar o plano ativo, sem ciclo nenhum), não regressão desta feature; o plano técnico deve avaliar esse caminho de leitura no dia de fronteira pra não tensionar o SC-003.
- **Paciente novo sem nenhum ciclo**: nada quebra — o app do paciente funciona como hoje; a atribuição responde "nenhum ciclo" para qualquer dia.
- **Abrir segundo ciclo com um ativo**: falha orientada (FR-002) — nunca cria sobreposição silenciosa.
- **Fechar sem ciclo ativo / fechar duas vezes**: operação sem efeito destrutivo, com orientação (não há o que fechar) — nunca corrompe a linha do tempo.
- **Duração prevista vencida sem fechamento**: o comportamento depende do ciclo de vida escolhido (FR-005); no default recomendado, o ciclo segue aberto — a duração é previsão, não trava.

## Requirements _(mandatory)_

### Functional Requirements

#### O ciclo e seu ciclo de vida

- **FR-001**: O sistema MUST representar o **ciclo de acompanhamento** como objeto de primeira classe por paciente: **início** (marco da consulta, com data), **duração prevista** (definida pela nutri) e **fim** (marco da reavaliação, com data). _(Decisão de produto: decisoes-produto.md:103.)_
- **FR-002**: Um paciente MUST ter **no máximo um ciclo ativo** por vez. A tentativa de abrir um segundo ciclo com um ativo MUST falhar com orientação clara (encerrar o vigente primeiro), nunca criar sobreposição.
- **FR-003**: A duração prevista MUST poder ser expressa em dias/semanas, por ciclo. Quem a define, se o produto sugere um default e se ela é obrigatória no ato de abrir fazem parte da clarificação do FR-005 — é a pergunta "duração?" do handoff (§5), levada ao gate, não decidida aqui.
- **FR-004**: Abrir um ciclo MUST registrar o início (e a duração prevista, conforme a decisão do FR-005); fechar MUST registrar o fim, delimitando a **janela [início, fim]** do ciclo.
- **FR-005**: O sistema MUST definir o que abre e o que fecha um ciclo — e a semântica da duração prevista — conforme [NEEDS CLARIFICATION: ciclo de vida e duração — **(1) o que abre/fecha:** (A) **totalmente manual**: a nutri abre na consulta e fecha quando reavaliar; prazo vencido NÃO fecha sozinho (a duração é previsão, não trava); (B) **fecha automático** ao fim da duração prevista; abrir o próximo segue manual — cria "buraco" sem ciclo ativo se a nutri não agir; (C) **abrir o próximo fecha o anterior** automaticamente, sem ato explícito de fechar — menor atrito, mas perde a distinção fechar≠reavaliar. **(2) duração** (pergunta "duração?" do handoff §5): quem define (a nutri, por ciclo? o produto sugere um default?) e se é obrigatória no ato de abrir. Default recomendado: definida pela nutri a cada ciclo (em dias/semanas), obrigatória ao abrir, sem default global do produto].
- **FR-006**: Fechar/encerrar um ciclo MUST NOT apagar, alterar ou congelar qualquer dado cru do período — os registros de refeição permanecem append-only e consultáveis (Fase 3); o fechamento apenas **delimita** o período. _(LGPD / histórico.)_

#### Ciclo × plano (versionamento no tempo)

- **FR-007**: O ciclo MUST permitir determinar **qual plano (ou quais versões de plano) esteve vigente durante sua janela** — o "plano versionado por ciclo" é decisão de produto **já tomada** (decisoes-produto.md:103); deferir o versionamento contrariaria essa decisão e esvaziaria o propósito declarado da feature, então não é opção aqui. O grão do vínculo é [NEEDS CLARIFICATION: plano×ciclo — (A) o ciclo **referencia** a(s) versão(ões) de plano vigentes nele (1:N por períodos; um plano pode ser reaproveitado/re-vinculado no ciclo seguinte); (B) **1 ciclo = exatamente 1 plano** (cópia/versão nova a cada ciclo). A escolha define o que é "replanejar no meio do ciclo": nova versão no mesmo ciclo (A) ou novo ciclo (B). A decisão também precisa dizer como o vínculo convive com a **vigência que já existe**: o sistema já responde "qual plano vige agora" (o plano ativo do paciente) e cada registro já guarda o plano em uso no momento — o ciclo passa a mandar na vigência ou referencia o mecanismo atual? Não pode haver duas fontes de verdade sobre "qual plano vige"].
- **FR-008**: A introdução do ciclo MUST NOT mudar **nada observável no app do paciente**: ele segue vendo o plano ativo do dia, registrando e rebalanceando como hoje ("mostra o certo por padrão"). O ciclo é instrumento da nutri.

#### Atribuição temporal (fundação de adesão e relatório)

- **FR-009**: Dado (paciente, dia), o sistema MUST responder **deterministicamente** a qual ciclo o dia pertence — exatamente **um** ciclo, ou **nenhum** — de modo que qualquer consumidor (adesão, relatório) obtenha sempre a mesma resposta para a mesma pergunta.
- **FR-010**: Dado um ciclo (aberto ou fechado), o sistema MUST permitir obter a sua **janela de período** e o conjunto de **registros do paciente** dentro dela. Esta feature MUST NOT calcular nenhuma métrica sobre esses dados — adesão (006) e relatório consomem a janela; aqui só se estrutura o tempo.
- **FR-011**: O sistema MUST tratar o histórico existente (plano atual e registros desde a Fase 3) e os registros feitos em período sem ciclo ativo conforme [NEEDS CLARIFICATION: retroatividade/migração — (A) criar um **ciclo retroativo** abraçando o plano e os registros existentes (nada fica órfão, mas inventa um marco de consulta que não houve); (B) histórico pré-ciclo — e qualquer dia sem ciclo ativo — fica **fora de ciclo**: consultável como hoje, mas sem ciclo; a adesão por ciclo simplesmente não o cobre; (C) **início limpo**: ciclos valem daqui pra frente e o primeiro abre na próxima "consulta"].

#### Privacidade e exposição (transversais)

- **FR-012**: **Nesta fase**, o ciclo (existência, datas, duração, vínculos de plano) e qualquer informação derivada dele MUST NOT ser exposto ao paciente — nem tela, nem número, nem percentual. O princípio **perene** com lastro é o gate de exposição da métrica: o paciente vê **ação**, nunca número/percentual/estado de adesão (FR-016 da 003, FR-015 da 004). Estender a invisibilidade à própria existência/datas do ciclo é decisão **desta fase** (ver Assumptions) — reversível se o produto decidir expor, por exemplo, a data da próxima consulta.
- **FR-013**: O sistema MUST NOT expor operações ou dados de ciclo por nenhuma superfície do app do paciente — este é o critério **verificável no v0** (complementa o FR-012). O controle de acesso pleno — somente a nutri responsável pelo paciente (e o próprio sistema) consultam os ciclos daquele paciente (LGPD, dado de saúde) — é declarado e herdado das fases anteriores e endurece quando a web da nutri e a auth real entrarem (ver Assumption "Identidade").

#### Capacidade operacional (seed-first)

- **FR-014**: Abrir, fechar e consultar ciclos MUST ser possível **sem UI da nutri** — o papel da nutri é exercido por operação interna/seed nesta fase. A spec descreve **capacidades**, não telas.

### Key Entities _(include if feature involves data)_

- **Ciclo de acompanhamento**: objeto por paciente com início (marco da consulta), duração prevista (definida pela nutri) e fim (marco da reavaliação). No máximo um ativo por paciente; fechado, vira uma janela [início, fim] consultável. Invisível ao paciente.
- **Vínculo ciclo↔plano**: a resposta a "qual plano vigia neste ciclo (e neste dia dele)". Versionar em si já está decidido; o grão (referência 1:N vs cópia 1:1) está em aberto (FR-007).
- **Linha do tempo de acompanhamento**: a sequência ordenada e sem sobreposição dos ciclos de um paciente. Pode conter lacunas (dias sem ciclo), conforme as decisões de ciclo de vida (FR-005) e retroatividade (FR-011).
- **Janela de período**: o intervalo [início, fim] de um ciclo, em dias-calendário — o que a adesão (006) e o relatório consomem. Só delimitação; nenhuma métrica vive aqui.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Para qualquer (paciente, dia), a atribuição de ciclo tem **uma única resposta** (um ciclo ou nenhum), idêntica em **100%** das consultas repetidas sobre o mesmo estado.
- **SC-002**: Em **0** estados do sistema existem dois ciclos do mesmo paciente sobrepostos (ou dois ativos ao mesmo tempo).
- **SC-003**: **0** mudanças observáveis no app do paciente: Home, registro, substituição e rebalanceamento comportam-se de forma idêntica antes e depois da introdução do ciclo.
- **SC-004**: Fechar um ciclo preserva **100%** dos registros crus do período — mesma contagem e mesmo conteúdo antes e depois do fechamento.
- **SC-005**: Para **100%** dos ciclos fechados, a janela [início, fim] e o conjunto de registros do período são recuperáveis e batem exatamente com os registros do paciente naquelas datas.
- **SC-006**: Em **0** casos o paciente vê ciclo, datas de consulta/reavaliação, duração ou qualquer informação derivada do acompanhamento (número, percentual ou estado).

## Assumptions

- **Não-sobreposição**: ciclos de um paciente não se sobrepõem — no máximo **um ciclo ativo** por paciente por vez; a linha do tempo é uma sequência ordenada, possivelmente com lacunas.
- **Fechar não destrói**: encerrar um ciclo não apaga nem congela dados crus — o registro é append-only (Fase 3) e permanece intacto; o ciclo só **delimita** o período. _(LGPD / histórico.)_
- **Ciclo invisível ao paciente — escopo desta fase**: o que tem lastro perene é o paciente nunca ver número/percentual/estado de adesão (FR-016 da 003 / FR-015 da 004). Estender a invisibilidade à própria existência/datas do ciclo é default **desta fase** (zero mudança no app — FR-008/SC-003) — reversível: na vida real o paciente sabe a data da próxima consulta, e expor algo assim é decisão de produto futura, não violação de princípio.
- **Seed-first, capacidades e não telas**: não há UI da nutri nesta feature; abrir/fechar/consultar ciclo acontece pelo sistema (papel da nutri exercido via seed/operação interna), coerente com o atalho deliberado da Constituição (Princípio VI).
- **Fundação, não cálculo**: a adesão (006) e o futuro relatório de ciclo consomem o ciclo como **janela de período**; esta feature não calcula nenhuma métrica — só estrutura o tempo.
- **Atribuição derivada do período**: um registro pertence a um ciclo por **(paciente + dia dentro da janela)** — não por re-ancoragem ou marcação dos registros existentes. O registro continua ancorado direto no plano, como definido na Fase 3 (FR-015 da 003); nenhum evento histórico é alterado. _(Reversível: se um vínculo explícito se mostrar necessário, é decisão de plano futuro.)_
- **Fronteira em dia-calendário com desempate determinístico**: as janelas de ciclo são delimitadas por dia-calendário (mesma granularidade do registro diário). Quando dois ciclos consecutivos tocam o mesmo dia (fechou e reabriu no mesmo dia), o dia de fronteira pertence ao ciclo **aberto mais recentemente** — default reversível, escolhido só para garantir resposta única. O "dia-calendário" do ciclo usa a **mesma fonte de data** do registro diário — hoje, o dia local do servidor (dívida de timezone consciente e nomeada desde a Fase 3); se as duas pontas divergissem, a atribuição quebraria na virada do dia (FR-009). O fix futuro (fuso do paciente) muda ciclo e registro **juntos**.
- **"Consulta" é marco, não agenda**: o início do ciclo referencia a consulta como **marco de data**, não como objeto de agenda — agenda/gestão de consultas é commodity e fica fora do produto (Constituição, Princípio I).
- **Identidade**: v0 segue com auth stub (paciente fixo por env; a nutri não loga). O controle de acesso pleno do FR-013 é declarado como nas fases anteriores e endurece quando a web da nutri e a auth real entrarem; até lá, o critério verificável é que nenhuma superfície do app do paciente expõe operações ou dados de ciclo.

## Out of Scope _(desta feature)_

- **Relatório de ciclo** — a feature seguinte; consome a janela e os vínculos criados aqui.
- **Métrica de adesão** — feature 006 (paralela); consome o ciclo como janela de período.
- **UI da nutri (web)** e **auth real** — entram juntas em fase posterior (a nutri loga e vê dado de saúde de N pacientes).
- **Detector de fumaça / alertas em tempo real** antes da consulta — exceção calibrada alta, explicitamente deferida (decisoes-produto.md:105); o modo de operar desta fase é "revisa olhando pra trás" (decisoes-produto.md:104).
- **Qualquer mudança no app do paciente** — telas, fluxos, dados exibidos e comportamento permanecem idênticos; o ciclo é invisível pro paciente.
- **Agenda / gestão de consultas** — commodity; a "consulta" aqui é só o marco de data do início do ciclo.
- **Notificações / lembretes** de fim de ciclo ou reavaliação — não há ping nesta fase.
- **Editor de plano / versionamento de conteúdo do plano** — esta feature versiona o vínculo plano↔tempo (conforme o grão decidido no FR-007), não cria edição de plano; o plano segue entrando via seed.

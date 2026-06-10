# Feature Specification: Métrica de adesão a partir do registro (só-nutri)

**Feature Branch**: `006-metrica-adesao`

**Created**: 2026-06-10

**Status**: Draft — aguardando aprovação do dono do produto (gate Specify→Plan)

**Input**: User description: "Métrica de adesão calculada a partir do registro já persistido (feito/troquei/pulei): mede % da intenção nutricional do dia cumprida, conta substituições e rebalanceamentos corretos como aderentes, e é visível somente para a nutricionista (o paciente nunca vê número de adesão)."

## Visão geral

As Fases 1–4 fecharam a alça do paciente: ele consulta "o agora", adequa (substitui, combina, troca opção e tipo-de-dia), registra cada refeição como **feito / troquei / pulei** (Fase 3) e o motor de rebalanceamento já lê esse registro (Fase 4). Tudo isso é do paciente — **a nutri, que é quem paga, ainda não recebe nada de volta**.

Esta feature entrega a primeira devolução à nutri: a **métrica de adesão**, derivada exclusivamente do registro que já existe, por **paciente e por dia**. É a fundação do **relatório de ciclo** — a feature que mais vende (decisoes-produto.md §4) — que consumirá a "adesão ao longo do tempo (a linha dos 80%)" (decisoes-produto.md:109); por isso a métrica precisa existir na **unidade diária**.

Entrega de valor **sem UI** (seed-first): a métrica fica consultável pela nutri via sistema. _Como_ ela acessa é assunto do Plan — esta spec só crava **quem pode ver** e **o quê**.

**Decisões de produto importadas** (já tomadas; não re-decidir aqui):

1. **Só a nutri vê, no início** — evita auto-policiamento e desânimo do paciente (decisoes-produto.md:64).
2. Mede **"% da intenção nutricional do dia cumprida"**, NÃO "% idêntico ao papel": substituições e rebalanceamentos corretos **contam como aderentes** (decisoes-produto.md:65). Trocar dentro do grupo certo não é desvio.
3. **Faixa-alvo, não teto**: comer de menos é tão fora de adesão quanto comer de mais (decisoes-produto.md:69; constituição II).
4. Se um dia for exposta ao paciente, o enquadramento é **positivo** ("80%, no caminho", nunca "62%, falhou") — decisoes-produto.md:66. _Exposição ao paciente é fora de escopo desta feature._
5. **Consumo real** já definido (spec 004 FR-005): feito = planejado da opção cumprida; troquei = o que foi efetivamente consumido; pulei = zero.
6. Registro é **estado vigente com anulação** (spec 003 FR-010/FR-011): registro desfeito = refeição volta a não-registrada.

### Decisões em aberto (as 3 perguntas deste gate)

- **Q1 — Fórmula** (em duas partes — a dimensão é parte da fórmula, não default desta spec):
  - **Q1a — Forma do valor**: (A) dia **binário** — aderente se o consumido total cai na faixa-alvo; (B) **contínua por dia, saturada na faixa** — 100% quando o total fecha **dentro** da faixa-alvo; fora dela, decai com o desvio relativo medido **a partir da borda mais próxima da faixa**, clampado em 0; (C) **por refeição** — % de refeições cumpridas no dia. _Recomendação: B (gradação diária que sustenta a linha dos 80%; a classificação dentro/fora acompanha — FR-006a). A saturação dentro da faixa é obrigatória em qualquer variante contínua: medir o desvio contra o alvo central pontuaria abaixo de 100% um dia que fecha dentro da faixa, reintroduzindo o alvo-ponto que a faixa existe pra evitar (FR-004; constituição II). C conflita com a decisão importada nº 2: pune o pulo mesmo quando o dia compensado fecha na faixa._
  - **Q1b — Dimensão da medição**: (i) **só kcal**; (ii) **os 4 nutrientes** (kcal + 3 macros) dentro das respectivas faixas como critério; (iii) **kcal como valor + flags por macro** fora da faixa. _Contexto: a faixa da Fase 2 existe **por nutriente** (spec 002 FR-002) e "alvo por nutriente, não por caloria só" é decisão de produto (decisoes-produto.md:50); "casar as kcal" (002 FR-010) é regra de **desempate do motor** em conflito de macros, não definição de aderência. Só-kcal contaria como aderente um dia que fecha kcal estourando o piso de proteína que a nutri travou. Recomendação: (iii) — kcal dá a linha única que o relatório consome; os flags preservam o que a nutri travou sem inventar média multi-nutriente._
- **Q2 — Refeição não registrada**: (A) conta como não-aderente; (B) **neutra** — adesão só sobre o registrado, com um indicador separado de **cobertura do registro** pra nutri calibrar a confiança; (C) dia sem nenhum registro = **sem dado**. _Recomendação: B (que subsume C: cobertura zero = sem dado). A pune quem não registra, não quem não segue — o registro é opcional por design._
- **Q3 — Tipo-de-dia que define o alvo da data**: (A) sempre o **default da programação semanal** do plano; (B) o **tipo-de-dia carregado nos registros vigentes** do dia, quando uniforme entre si (cada registro já o grava — spec 003 FR-014), com o default da programação como fallback (sem registro, ou registros divergentes); (C) dia com override detectado nos registros = **sem dado** até persistir a escolha do dia. _Contexto: trocar o tipo-de-dia é a camada **grossa** de flexibilidade (decisoes-produto.md:61) e adequação dentro das regras — FR-005 manda contar como aderente. Sob (A), um dia legitimamente trocado pra "descanso" é medido contra a faixa de "treino" e aparece fora de adesão — a métrica mentiria pra nutri exatamente no comportamento-vitrine. Recomendação: B (usa dado que já existe; só degrada no caso raro de troca no meio do dia). Persistir a escolha do dia (day_selection) segue feature futura em qualquer resposta._

> **Resolvida como Assumption (vetável neste gate)**: a antiga pergunta de **janela/agregação** foi cravada no mínimo YAGNI — **só a série por dia**; média/agregado ficam pro relatório de ciclo, que é quem conhece a janela natural (o ciclo). Ver FR-011 e Assumptions; constituição VI. _(Reversível.)_
>
> **Risco assumido (não é pergunta, mas o dono deve ver)**: a métrica usa a **régua corrente** (plano/tolerância vigentes na consulta) inclusive pra dias passados — mudar tolerância ou plano no meio do ciclo **re-lê o passado** que o relatório vai contar, sem rastro. Aceito no v0; congelar a régua exigiria snapshot/versionamento — dependência registrada pro ciclo (007)/relatório (ver Assumptions).

## User Scenarios & Testing _(mandatory)_

### User Story 1 - A nutri lê a adesão de um dia do paciente (Priority: P1)

A nutri consulta, para um paciente e um dia, a adesão daquele dia: o consumo real das refeições registradas (feito/troquei/pulei) comparado à **intenção nutricional do dia** (a faixa-alvo do tipo-de-dia). O valor é derivado do registro existente — nada novo é pedido ao paciente.

**Why this priority**: É a métrica em si — a primeira devolução de valor à nutri e a fundação do relatório de ciclo. Sozinha já entrega: a nutri passa a enxergar a verdade do dia do paciente.

**Independent Test**: Com um plano semeado e um conjunto conhecido de registros num dia, consultar a adesão daquele dia como nutri e conferir o valor contra a definição (consumo real vs faixa-alvo).

**Acceptance Scenarios**:

1. **Given** um paciente com plano ativo que registrou todas as refeições do dia como **feito** conforme o plano, **When** a nutri consulta a adesão daquele dia, **Then** o dia aparece como aderente — o consumido coincide com a intenção do dia.
2. **Given** um dia em que o paciente **pulou** refeições sem compensação e o total ficou **abaixo** da faixa-alvo, **When** a nutri consulta, **Then** o dia aparece fora de adesão — comer de menos é fora tanto quanto comer de mais.
3. **Given** um dia já consultado e, em seguida, um registro daquele dia **corrigido ou desfeito**, **When** a nutri consulta de novo, **Then** a adesão reflete o **estado vigente** atual do registro (a métrica é derivada, nunca congelada).
4. **Given** um paciente **sem plano ativo no momento da consulta**, ou uma data **futura**, ou **anterior ao primeiro registro** do paciente, **When** a nutri consulta, **Then** o resultado é **"sem dado"** — nunca 0%, nunca erro. _("Sem plano ativo" é estado do paciente na consulta — régua corrente —, não propriedade da data; ver FR-012.)_

---

### User Story 2 - Adequar conta como aderente (Priority: P2)

Substituições dentro do grupo, opções não-default e dias rebalanceados que fecham na faixa contam como aderentes. A adesão julga o **desfecho nutricional do dia** contra a faixa-alvo — nunca a identidade do alimento nem a fidelidade literal ao papel.

**Why this priority**: É o que torna a métrica fiel à tese do produto ("% da intenção cumprida", decisoes-produto.md:65). Sem isso, a métrica puniria exatamente o comportamento que o produto incentiva (adequar para seguir) e mentiria pra nutri.

**Independent Test**: Registrar um dia com uma substituição equivalente dentro do grupo (troquei) cujo total fecha na faixa; confirmar que a adesão é a mesma de um dia equivalente todo "feito".

**Acceptance Scenarios**:

1. **Given** um dia com uma refeição **troquei** (substituição dentro do grupo, quantidade reescalada) cujo desfecho nutricional é o mesmo do planejado, **When** a nutri consulta, **Then** a adesão é **exatamente a mesma** de um dia equivalente todo "feito".
2. **Given** um dia em que o paciente cumpriu uma **opção não-default** e o total fechou na faixa, **When** a nutri consulta, **Then** o dia conta como aderente.
3. **Given** um dia em que o paciente **pulou** uma refeição e o consumo registrado das demais **compensou** (o total do dia fechou na faixa-alvo), **When** a nutri consulta, **Then** o dia conta como aderente — rebalanceamento correto é aderência. _(Condicionado à Q1: a fórmula adotada não pode punir o pulo compensado.)_
4. **Given** um dia com **troquei** cujo consumo real levou o total pra **fora** da faixa, **When** a nutri consulta, **Then** o dia conta como fora de adesão — o consumo real conta fielmente; "correto" significa que o dia fecha na faixa, não um julgamento moral do alimento.

---

### User Story 3 - Série por dia: a linha dos 80% (Priority: P3)

A nutri consulta a adesão de um paciente **ao longo de um período**: uma série com o valor de cada dia, na ordem, com os dias sem dado marcados como tal. É a matéria-prima da "linha dos 80%" do relatório de ciclo.

**Why this priority**: Sem a série temporal, a métrica não alimenta o relatório de ciclo (o consumidor que justifica a feature). Depende da US1 (o valor de um dia precisa existir e estar certo).

**Independent Test**: Registrar refeições em vários dias distintos; consultar o período como nutri; conferir que cada dia traz seu valor e que dias sem registro/sem plano vêm marcados como sem dado.

**Acceptance Scenarios**:

1. **Given** um paciente com registros em vários dias, **When** a nutri consulta um período, **Then** recebe a adesão **de cada dia** do período, em ordem cronológica, com dias sem dado explicitamente marcados (nunca confundidos com 0%).
2. **Given** um período inteiramente anterior ao primeiro registro do paciente, **When** a nutri consulta, **Then** recebe uma série sem dados — nunca um erro.
3. **Given** um período consultado, **When** a resposta retorna, **Then** ela contém **somente a série diária** — nenhum campo agregado (média do período, fechamento semanal) presente. _(Agregação pertence ao relatório de ciclo — ver Assumptions.)_

---

### User Story 4 - O paciente nunca vê (Priority: P4)

O paciente continua vendo **ação** (o que comer, quanto ajustar) — nunca número, percentual ou classificação de adesão. Nenhuma resposta ou tela voltada ao paciente passa a conter a métrica, nem por engano.

**Why this priority**: É a condição de existência da métrica (decisoes-produto.md:64 — evita auto-policiamento) e LGPD/gate (constituição V). É P4 só porque é um invariante negativo sobre o que já existe — mas é inegociável.

**Independent Test**: Exercitar todos os fluxos existentes do paciente (consultar o dia, registrar, substituir, combinar, rebalancear, trocar tipo-de-dia) e verificar que nenhuma resposta contém adesão em qualquer forma.

**Acceptance Scenarios**:

1. **Given** o paciente usando **qualquer** fluxo existente do app, **When** qualquer resposta retorna, **Then** ela **não contém** número, percentual ou classificação de adesão — em nenhum nível de detalhe.
2. **Given** um paciente com o **nível máximo de exposição** de números nutricionais (kcal cheio), **When** ele usa o app, **Then** ainda assim nenhuma adesão aparece — o gate de exposição rege números nutricionais, não a adesão (que é só-nutri e fora do gate nesta feature).
3. **Given** a via de consulta de adesão da nutri, **When** chega uma requisição portando **identidade/credenciais de paciente** (o auth do app), **Then** ela é **negada** — a via da nutri não é alcançável pelos fluxos do paciente (FR-016).

---

### Edge Cases

- **Registro anulado depois de consultado**: a métrica é derivada do estado vigente — a próxima consulta reflete a anulação (o dia é recalculado; pode inclusive virar "sem dado" se era o único registro, conforme Q2).
- **Dia com pulei mas total dentro da faixa** (compensado pelo consumo das demais): aderente — decisão importada nº 2. Fórmulas que punem o pulo em si (Q1a-C) conflitam com essa decisão; a tensão está marcada na Q1.
- **Dia parcialmente registrado**: depende da Q2 — sob a recomendação (neutra + cobertura), a adesão é calculada sobre o registrado e a **cobertura** baixa avisa a nutri de que o valor diz pouco.
- **Troquei com quantidade muito diferente do planejado**: o consumo real captura fielmente; o que decide é o desfecho do dia contra a faixa. (Troca pra **fora do grupo** é barrada na origem, no próprio registro — spec 003 FR-004 — e portanto nunca chega à métrica.)
- **Registros do mesmo dia com tipos-de-dia divergentes** (paciente trocou o tipo no meio do dia): a fonte do tipo-de-dia que define o alvo é a **Q3**; sob a recomendação (B), divergência cai no fallback (default da programação) — limitação conhecida. A mesma limitação vale pra **cobertura** (Q2-B): registro que referencia refeição de **outro** tipo-de-dia pareia com a refeição de **posição equivalente** do conjunto que define o alvo (precedente: pareamento por posição da Fase 4); o pareamento exato é decisão do Plan. Adesão plenamente ciente de override exige persistir a escolha do dia (feature futura).
- **Plano ou tolerância alterados depois do dia**: a métrica é derivada — usa o plano e a configuração **vigentes na consulta**, então o passado é re-lido com a régua atual. Aceito no v0 e **sinalizado como risco assumido no gate**; congelar a régua exigiria snapshot/versionamento — dependência registrada pro ciclo (007)/relatório ("plano versionado por ciclo", decisoes-produto.md:103).
- **Paciente nunca vê — nem por engano**: nenhuma resposta existente voltada ao paciente pode passar a carregar a métrica (cenário negativo explícito, US4).
- **Paciente sem plano ativo / dia futuro / anterior ao primeiro registro**: sem dado — nunca 0%, nunca erro. _("Sem plano ativo" é estado do paciente no momento da consulta, não propriedade da data — o modelo v0 não tem vigência de plano por data; ver FR-012.)_

## Requirements _(mandatory)_

### Functional Requirements

#### Intenção nutricional do dia e consumo real

- **FR-001**: O sistema MUST derivar a **intenção nutricional do dia** como a **faixa-alvo do dia**: o alvo nutricional do dia planejado do tipo-de-dia (como já definido na Fase 2 — "o dia planejado é o alvo") ± a tolerância configurada (precedência paciente → nutri → sistema, já existente). A métrica MUST NOT criar alvo nem tolerância próprios.
- **FR-002**: Para cada data, o tipo-de-dia que define o alvo MUST ser determinado segundo [NEEDS CLARIFICATION: fonte do tipo-de-dia do alvo (Q3) — (A) sempre o default da programação semanal do plano para a data; (B) o tipo-de-dia carregado nos registros vigentes do dia quando uniforme entre si (spec 003 FR-014), com o default da programação como fallback (sem registro, ou registros divergentes); (C) dia com override detectado nos registros = "sem dado" até persistir a escolha do dia? Sob (A), um dia legitimamente trocado de tipo — camada grossa de flexibilidade, adequação dentro das regras que FR-005 manda contar como aderente — é medido contra a faixa errada e aparece fora de adesão]. Persistir a escolha do dia (day_selection) permanece fora de escopo em qualquer resposta.
- **FR-003**: O **consumido do dia** MUST ser a soma do consumo real das refeições com registro vigente naquele dia, conforme já definido (spec 004 FR-005): **feito** = quantidades planejadas da opção cumprida; **troquei** = alimentos × quantidades efetivamente consumidos; **pulei** = zero.
- **FR-004**: A faixa-alvo MUST ser tratada como **faixa, não teto**: um total **abaixo** da faixa MUST contar como fora de adesão tanto quanto um total **acima** (simetria). _(decisoes-produto.md:69; constituição II.)_
- **FR-005**: Adequações dentro das regras (substituição/combinação no grupo, opção não-default) e rebalanceamentos corretos MUST contar como aderentes: a adesão julga o **desfecho nutricional do dia** contra a faixa-alvo, nunca a identidade dos alimentos nem a igualdade literal com o papel. Como o rebalanceamento é efêmero (não persistido — spec 004 FR-014), sua "correção" MUST ser observada pelo desfecho: o dia registrado fecha na faixa.

#### A fórmula (por dia)

- **FR-006**: O sistema MUST converter "intenção nutricional do dia cumprida" em valor por dia segundo [NEEDS CLARIFICATION: fórmula da adesão (Q1), em duas partes. **Q1a — forma do valor**: (A) dia binário — aderente se o consumido total cai na faixa-alvo; (B) contínua por dia, saturada na faixa — 100% quando o total fecha dentro da faixa-alvo e, fora dela, 100% menos o desvio relativo medido a partir da borda mais próxima da faixa, clampado em 0 (a saturação é obrigatória em variante contínua: medir contra o alvo central pontuaria abaixo de 100% um dia dentro da faixa, violando FR-004); (C) por refeição — % das refeições do dia cumpridas dentro do esperado (pune pular mesmo quando o dia compensado fecha na faixa — conflita com a decisão importada nº 2). **Q1b — dimensão da medição**: (i) só kcal; (ii) os 4 nutrientes (kcal + 3 macros) dentro das respectivas faixas; (iii) kcal como valor + flags por macro fora da faixa? A faixa existe por nutriente (spec 002 FR-002; decisoes-produto.md:50); "casar as kcal" (002 FR-010) é desempate do motor, não definição de aderência].
- **FR-006a**: Qualquer que seja a resposta da Q1, a saída por dia MUST incluir a **classificação dentro/fora da faixa-alvo** — é ela que torna verificáveis os cenários "conta como aderente / fora de adesão" (US1.1, US1.2, US2.2, US2.4) e a SC-003, independentemente da forma do valor.
- **FR-007**: O sistema MUST tratar refeições **sem registro vigente** no dia segundo [NEEDS CLARIFICATION: refeição não registrada — (A) conta como não-aderente; (B) neutra: a adesão considera só o registrado e uma **cobertura do registro** separada informa a confiança; (C) dia sem nenhum registro = sem dado? O registro é opcional por design — A penaliza quem não registra, não quem não segue; B subsume C].
- **FR-008**: A(s) **dimensão(ões)** em que a adesão é avaliada (só kcal / por nutriente / kcal + flags) MUST seguir a resposta da **Q1b** (marcador no FR-006) — é decisão de produto deste gate, não default desta spec. Qualquer que seja a resposta, a definição MUST ficar estruturada de modo a admitir dimensões por macro no futuro (sem construí-las agora).
- **FR-009**: A adesão MUST ser **derivada sob demanda** do estado vigente do registro — nunca um valor congelado: correção ou anulação de um registro (mesmo retroativa) MUST refletir na consulta seguinte.

#### Unidade diária e consulta da nutri

- **FR-010**: A métrica MUST existir por **(paciente, dia)** — a unidade-base é o dia, para sustentar a linha temporal que o relatório de ciclo consumirá (decisoes-produto.md:109). O recorte de "dia" MUST ser o mesmo dia-calendário já usado pelo registro.
- **FR-011**: A nutri MUST poder consultar a adesão de um paciente como **série por dia** num período: o valor (ou "sem dado") de cada dia, em ordem cronológica. Esta feature MUST NOT produzir agregados (média de período, fechamento semanal) — agregação pertence ao relatório de ciclo, que conhece a janela natural (o ciclo). _(Mínimo YAGNI cravado como Assumption vetável no gate — ver "Decisões em aberto" e Assumptions; constituição VI.)_
- **FR-012**: Paciente **sem plano ativo no momento da consulta** (qualquer data), datas **futuras** e datas **anteriores ao primeiro uso** MUST resultar em **"sem dado"** — distinto de 0% e nunca um erro. "Sem plano ativo" é propriedade do **paciente na consulta**, não da data: o modelo v0 não tem vigência de plano por data (coerente com a régua corrente — ver Assumptions); vigência por data entra com o ciclo (007).

#### Privacidade e exposição (LGPD — transversais)

- **FR-013**: A adesão MUST ser visível **somente à nutri responsável** pelo paciente. O paciente MUST NOT receber número, percentual ou classificação de adesão em **nenhuma** resposta ou tela — incluindo as já existentes, que MUST permanecer sem a métrica. _(decisoes-produto.md:64; spec 004 FR-015.)_
- **FR-014**: Esta feature MUST NOT alterar nenhum fluxo do paciente nem exigir dado novo dele — a métrica é 100% derivada do registro e do plano que já existem.
- **FR-015**: O **gate de exposição** existente segue regendo apenas números nutricionais e MUST NOT passar a expor adesão nesta feature; a exposição futura ao paciente (com enquadramento positivo — decisoes-produto.md:66) é decisão futura do dono, fora de escopo.
- **FR-016**: Adesão é derivada de **dado de saúde** (registro alimentar): o acesso MUST ser restrito à **nutri responsável** (e ao próprio sistema). No v0 seed-first, sem auth da nutri, esse controle MUST se materializar em dois requisitos verificáveis: (a) **omissão total** da métrica em toda resposta/fluxo do paciente (FR-013/FR-014); (b) a **via de consulta da nutri MUST NOT ser alcançável** pelas credenciais/fluxos do app do paciente — requisição com identidade de paciente à consulta de adesão MUST ser **negada**. O mecanismo da via própria (canal interno, seed, credencial stub de nutri) é decisão do Plan. **Dependência declarada**: a auth real da nutri (transversal pendente; entra com a web — handoff §4) é o que completa o enforcement do Princípio V; até lá, (a)+(b) são o mínimo operacional. _(LGPD — constituição V.)_

### Key Entities _(include if feature involves data)_

- **Adesão do dia**: medida derivada, por (paciente, dia), de quanto o consumo real registrado cumpriu a intenção nutricional do dia. Forma exata pendente da Q1; qualquer que seja, inclui a **classificação dentro/fora da faixa-alvo** (FR-006a). Nunca persiste como verdade congelada — é recalculável do registro vigente.
- **Intenção nutricional do dia (faixa-alvo)**: o alvo do dia planejado do tipo-de-dia que define o alvo da data (fonte pendente da Q3 — FR-002) ± tolerância configurada. Derivada, não armazenada (já existente — Fase 2).
- **Consumo real do dia**: soma do consumo das refeições com registro vigente (feito = planejado da opção cumprida; troquei = consumido; pulei = zero). Já definido (Fase 4).
- **Cobertura do registro** _(condicional à Q2-B)_: proporção das refeições do dia com registro vigente, sobre o conjunto de refeições do tipo-de-dia que define o alvo (Q3). Registro que referencia refeição de outro tipo-de-dia pareia por posição equivalente (ver Edge Cases) — a confiança que a nutri pode depositar na adesão daquele dia.
- **Série de adesão**: a sequência de adesões diárias de um paciente num período, com dias sem dado marcados — a matéria-prima da "linha dos 80%".

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A métrica é **determinística**: o mesmo conjunto de registros vigentes + o mesmo plano/configuração produzem o **mesmo valor** em 100% das consultas repetidas.
- **SC-002**: Um dia com adequação dentro das regras (substituição no grupo / opção não-default / dia compensado) cujo desfecho nutricional é o mesmo de um dia "todo feito" recebe **exatamente a mesma adesão** em 100% dos casos.
- **SC-003**: **Simetria da faixa**: um dia com total X abaixo da borda inferior é classificado fora de adesão exatamente como um dia X acima da borda superior, em 100% dos casos.
- **SC-004**: Corrigir ou desfazer um registro reflete na adesão do dia na consulta seguinte em 100% dos casos.
- **SC-005**: Em **0** casos qualquer resposta ou tela voltada ao paciente contém número, percentual ou classificação de adesão — inclusive com o gate de exposição no nível máximo.
- **SC-006**: A nutri obtém a adesão por dia de qualquer dia com dado no histórico do paciente em 100% das consultas; dias sem dado vêm explicitamente marcados como **sem dado** (jamais 0%).
- **SC-007**: **0** mudanças observáveis nos fluxos do paciente: os mesmos passos produzem as mesmas respostas de antes da feature.
- **SC-008**: Requisições à via de consulta de adesão portando **identidade de paciente** são negadas em 100% dos casos — a métrica é inalcançável a partir dos fluxos do paciente, não apenas omitida das respostas dele.

## Assumptions

- **Zero mudança do lado do paciente**: a métrica é derivada do registro e do plano existentes; nenhum fluxo do app muda, nenhum dado novo é pedido ao paciente.
- **Só a série por dia (agregação deferida)**: o v0 entrega somente a série diária; média/fechamento de período ficam pro relatório de ciclo, que é quem conhece a janela natural (o ciclo) — cravar agregado agora arriscaria contradizê-lo. Cravada como mínimo YAGNI (constituição VI) em vez de pergunta — era a antiga Q3 deste gate. _(Reversível; vetável no gate.)_
- **Fonte do plano = o ativo corrente**: o plano usado pela métrica é o plano **ativo do paciente no momento da consulta** — não o `plan_id` carregado nos registros do dia. Coerente com a régua corrente; o modelo v0 não tem vigência de plano por data (vigência entra com o ciclo — 007). _(Reversível.)_
- **Recorte do dia**: o mesmo dia-calendário local já usado pelo registro (dívida de fuso herdada e consciente das fases anteriores).
- **Tolerância da faixa**: a configuração já existente (paciente → nutri → sistema; ±10% default) — a métrica não introduz tolerância própria.
- **Derivada, com régua corrente**: a métrica usa o plano e a configuração vigentes na consulta, inclusive para dias passados; mudou a tolerância, o passado é re-lido. Aceito no v0 e **sinalizado como risco assumido no gate** (ver "Decisões em aberto") — congelar régua por dia exigiria snapshot (fora de escopo). **Dependência registrada**: snapshot/versionamento da régua pode virar requisito do ciclo (007)/relatório ("plano versionado por ciclo" — decisoes-produto.md:103).
- **A adesão observa o desfecho, não a interação**: como o rebalanceamento é efêmero (spec 004 FR-014), a métrica não sabe se o paciente "seguiu a sugestão do motor" — ela observa o que ele registrou e se o dia fechou na faixa. É exatamente o que a decisão de produto pede (desfecho, não obediência).
- **Identidade da nutri (v0, seed-first)**: não há login da nutri ainda; o controle de acesso do v0 se materializa nos **dois requisitos verificáveis do FR-016** — omissão total da métrica nas respostas do paciente **e** via de consulta própria do sistema, não alcançável pelas credenciais/fluxos do paciente (requisição com identidade de paciente é negada — US4.3/SC-008). Auth real da nutri é transversal pendente, entra com a web (handoff §4) e está **declarada como dependência no próprio FR-016**.

## Out of Scope _(desta feature)_

- **Relatório de ciclo** — consome esta métrica; feature própria. **Ciclo como objeto** (versionamento de planos) — feature 007.
- **Exposição da adesão ao paciente** via gate (o gate existe e segue só pros números nutricionais; expor adesão — com enquadramento positivo — é decisão futura do dono).
- **UI da nutri (web)** e **auth real da nutri** — entram juntas em fase posterior; aqui a consulta é seed-first.
- **Persistir o override de tipo-de-dia** (day_selection) — permanece fora de escopo em **qualquer** resposta da Q3 (a fonte do alvo usa só dado que já existe — FR-002).
- **Detector de fumaça / alertas** em tempo real para a nutri — o produto decide revisar olhando pra trás (decisoes-produto.md §4); alertas calibrados são feature futura.
- **Dimensões além da resposta da Q1b** — a Q1b define a(s) dimensão(ões) do v0; dimensões extras não são construídas agora (estrutura fica aberta — FR-008).
- **Análises do relatório** (quais refeições mais apanham, quais substituições o paciente puxa, concentração de imprevistos) — pertencem ao relatório de ciclo, não à métrica-base.

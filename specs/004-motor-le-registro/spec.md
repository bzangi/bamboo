# Feature Specification: Motor de rebalanceamento lê o registro

**Feature Branch**: `004-motor-le-registro`

**Created**: 2026-06-05

**Status**: Draft

**Input**: User description: "Motor de rebalanceamento lê o registro: refeições já registradas saem das alavancas; o consumo real (feito=planejado, troquei=consumido, pulei=zero) alimenta o total do dia; trocar o tipo-de-dia recalcula o novo cardápio pelo consumido-até-agora."

## Visão geral

A Fase 2 entregou o motor de rebalanceamento (trocar opção, combinar, trocar tipo-de-dia) com os ganchos do registro **dormentes**; a Fase 3 entregou o **registro** (feito/troquei/pulei) mas **não o ligou ao motor**. Resultado: dois comportamentos errados observados —

- **Trocar a opção de uma refeição seguinte recalcula refeições já feitas** (o motor trata refeição registrada como alavanca).
- **Trocar o tipo-de-dia não recalcula** o novo cardápio pelo que já foi consumido.

Esta feature **liga o motor ao registro**: refeições já registradas saem das alavancas (não são recalculadas) e o **consumo real** alimenta o total do dia. Assim, trocar a opção deixa de mexer no que já foi feito, e trocar o tipo-de-dia mostra o novo cardápio ajustado pelo consumido-até-agora.

**Quais gatilhos:** os rebalanceamentos que ajustam o **dia todo** são **trocar opção** e **trocar tipo-de-dia** — são esses que passam a ser cientes do registro. **Combinar** (1→2) é operação **local** de uma só refeição (não rebalanceia o resto do dia), então não é afetada.

Decisões de fronteira (cravadas com o dono do produto):

1. **Gatilho:** registrar **não** dispara prévia; apenas os gatilhos que já existem (trocar opção, trocar tipo-de-dia) passam a ser **cientes do registro**.
2. **Troca de tipo-de-dia:** o recálculo aparece **direto no cardápio** exibido (sem passo de confirmação separado).
3. **Déficit:** quando o consumido deixa o dia **abaixo** da faixa-alvo, o motor sugere **aumentar** as refeições restantes (e reduzir quando acima), sempre **reaproximando do alvo**, dentro de **faixa + piso inviolável**.
4. **Consumo real:** feito = quantidades planejadas da opção cumprida; troquei = alimentos efetivamente consumidos; pulei = zero.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Não recalcular o que já foi feito (Priority: P1)

O paciente registrou o café (feito) e, mais tarde, troca a opção do jantar. O rebalanceamento ajusta só as refeições **ainda não registradas** (fora a do gatilho) — o café **não** é mexido. Mandar mudar o que já foi comido é exatamente o que o produto existe pra evitar.

**Why this priority**: É o bug mais grave e a essência de "adaptar sem desfazer o passado". Sozinho já corrige o comportamento errado mais visível. Não depende dos outros.

**Independent Test**: Registrar uma refeição anterior como feito; trocar a opção de uma refeição posterior; confirmar que a quantidade da refeição registrada **não muda** na prévia.

**Acceptance Scenarios**:

1. **Given** o café registrado como feito e o jantar com opções, **When** o paciente escolhe uma opção diferente no jantar, **Then** a prévia ajusta apenas refeições não-registradas (exceto o jantar, que é o gatilho) e o café permanece **intacto**.
2. **Given** um dia em que todas as outras refeições já estão registradas, **When** o paciente troca a opção da única refeição não-registrada (o gatilho), **Then** não há alavancas e o sistema responde com **recusa orientada**, nunca cortando abaixo do piso.
3. **Given** uma refeição registrada e depois **desfeita**, **When** ocorre um rebalanceamento, **Then** ela volta a ser alavanca (pode ser ajustada) e contribui com o planejado.

---

### User Story 2 - Total do dia pelo consumo real (Priority: P2)

O motor calcula o total/desvio do dia a partir do que foi **efetivamente consumido** nas refeições registradas (feito = planejado; troquei = o que comeu; pulei = zero), não do plano no papel. Assim, pular o almoço vira um **déficit real** que o resto do dia pode compensar (em direção ao alvo), e uma troca mais calórica vira o desvio certo.

**Why this priority**: É o que torna o rebalanceamento fiel à vida real (a tese: adaptar). Depende da US1 (saber quais estão registradas) para saber de onde vem o consumo real.

**Independent Test**: Registrar uma refeição como **pulei**; trocar a opção de outra refeição; confirmar que o dia projeta **abaixo** do alvo e o restante é sugerido a **aumentar** (em direção ao alvo, sem furar o piso). Repetir com **troquei** mais calórico → restante sugerido a **reduzir**.

**Acceptance Scenarios**:

1. **Given** o almoço registrado como **pulei**, **When** o paciente rebalanceia, **Then** o consumido do almoço conta como **zero** e o restante é sugerido a aumentar em direção ao alvo, sem ultrapassá-lo nem furar o piso.
2. **Given** uma refeição registrada como **troquei** com consumo acima do planejado, **When** ocorre um rebalanceamento, **Then** o total do dia reflete o **consumo real** (alimentos × gramas consumidos, não o plano) e o restante é reduzido na medida necessária.
3. **Given** uma refeição registrada como **feito**, **When** ocorre um rebalanceamento, **Then** ela contribui com as **quantidades planejadas da opção cumprida** para o total.

---

### User Story 3 - Trocar o tipo-de-dia recalcula pelo consumido (Priority: P3)

O paciente já comeu parte do dia e troca o tipo-de-dia (ex.: de treino para descanso). O novo cardápio aparece com as quantidades das refeições do novo tipo **ajustadas pelo consumido-até-agora**, não no planejado puro — direto na tela, sem confirmação extra.

**Why this priority**: Fecha o segundo bug e completa a leitura do registro pelo motor. Depende da US2 (consumido-até-agora).

**Independent Test**: Registrar uma ou mais refeições; trocar o tipo-de-dia; confirmar que o cardápio do novo tipo vem **ajustado** (difere do planejado puro quando há desvio) e que isso aparece direto na exibição.

**Acceptance Scenarios**:

1. **Given** refeições já registradas hoje, **When** o paciente troca o tipo-de-dia, **Then** o cardápio do novo tipo é exibido com as refeições recalculadas pelo consumido-até-agora (alvo do novo tipo − consumido), reaproximando do alvo dentro de faixa + piso.
2. **Given** nenhuma refeição registrada ainda, **When** o paciente troca o tipo-de-dia, **Then** o novo cardápio aparece no **planejado** (sem ajuste), como hoje.
3. **Given** o consumido projeta o novo dia fora da faixa, **When** a troca é exibida, **Then** o ajuste aparece **direto no cardápio** (sem passo de confirmação separado).
4. **Given** um tipo-de-dia override ativo e consumo registrado, **When** o paciente recarrega a tela (sem novo toque no seletor), **Then** o cardápio segue ajustado; **e** no tipo-de-dia **padrão** (sem override), recarregar após registrar **não** ajusta o cardápio.
5. **Given** o café já registrado (slot do tipo anterior), **When** o paciente troca de tipo-de-dia, **Then** o slot do café conta **uma única vez** (pelo consumido) — a refeição equivalente do novo tipo sai das restantes; só os slots não comidos são recalculados.

---

### Edge Cases

- **Sem alavanca**: todas as outras refeições já registradas (ou travadas/sem grupo) → **recusa orientada**, nunca corte abaixo do piso.
- **Déficit grande (pulei muito)**: aumenta o restante em direção ao alvo, respeitando o piso; se não couber, recusa orientada ("hoje ficou abaixo, segue e volta amanhã").
- **Excesso grande (troquei calórico)**: reduz o restante até o piso; se não couber, recusa orientada.
- **Troca de tipo-de-dia sem consumo**: cardápio do novo tipo no planejado.
- **Registro desfeito**: a refeição volta a alavanca e ao planejado no total.
- **Gatilho registrado**: a refeição do gatilho é a que o paciente está mexendo agora; mesmo que tenha registro, ela não é travada pela regra de exclusão (a exclusão vale para as **outras** registradas). Corrigir o registro da própria refeição segue as regras de correção da Fase 3.
- **Privacidade**: o paciente vê **ação** (quanto ajustar por refeição), nunca o total/desvio do dia como número ou % de adesão.

## Requirements _(mandatory)_

### Functional Requirements

#### Trocar opção fica ciente do registro

- **FR-001**: Num rebalanceamento por **troca de opção**, o sistema MUST excluir das alavancas as refeições já registradas (feito/troquei/pulei), **exceto a refeição do gatilho**; só refeições não-registradas (fora a do gatilho) têm quantidades ajustadas.
- **FR-002**: Uma refeição registrada que **não** seja a do gatilho MUST NOT ter suas quantidades alteradas por um rebalanceamento disparado por outra refeição.
- **FR-003**: Quando uma refeição registrada é **desfeita** (volta a não-registrada), ela MUST voltar a ser alavanca e a contribuir com o **planejado** no total do dia.
- **FR-004**: Se, excluídas as registradas e a do gatilho, não restar alavanca, o sistema MUST emitir **recusa orientada** (nunca cortar abaixo do piso, nunca forçar).

#### Consumo real alimenta o total do dia

- **FR-005**: O total do dia usado pelo rebalanceamento MUST refletir o **consumo real** das refeições registradas: feito = quantidades planejadas da opção cumprida; troquei = alimentos efetivamente consumidos × gramas consumidos; pulei = **zero**.
- **FR-006**: O vetor nutricional (kcal/macros) do consumo das refeições registradas MUST ser **derivado do que foi registrado** (alimentos + gramas), resolvido pelo sistema — no caso **troquei**, NÃO assumido do plano.
- **FR-007**: Refeições **não registradas** MUST contribuir com o planejado (opção default, ou a escolhida na do gatilho) para o total.
- **FR-008**: O **alvo** do dia (faixa-alvo) MUST permanecer o do plano (default do tipo-de-dia vigente) — registrar muda o **consumido**, não o alvo.

#### Direção do ajuste

- **FR-009**: Quando o projetado (consumido + restante) sai da **faixa-alvo**, o sistema MUST ajustar as alavancas para **reaproximar o dia do alvo**: projeção **abaixo** → aumentar as restantes; **acima** → reduzir. Dentro da faixa → sem ação.
- **FR-010**: O ajuste MUST NOT **ultrapassar o alvo** do dia (sem "encher") nem reduzir **abaixo do piso** inviolável; se o desvio não couber nas alavancas sem furar o piso, **recusa orientada**.

#### Trocar tipo-de-dia recalcula pelo consumido

- **FR-011**: Ao trocar o tipo-de-dia, o sistema MUST recalcular as quantidades das refeições do **novo** tipo-de-dia considerando o **consumido-até-agora**, comparando contra o alvo do novo tipo (mesmas regras de direção/piso dos FR-009/FR-010).
- **FR-012**: O **consumido-até-agora** MUST ser a soma do consumo real das refeições registradas (estado vigente) do **dia corrente**, do plano ativo, resolvida a cada exibição — **sem** persistir o tipo-de-dia escolhido.
- **FR-013**: O recálculo da troca de tipo-de-dia MUST aparecer **direto no cardápio** exibido, sem passo de confirmação separado.
- **FR-013a**: Enquanto houver um **tipo-de-dia escolhido (override) ativo**, o cardápio MUST refletir o consumido a **cada exibição** (não só no toque de trocar). No **tipo-de-dia padrão** (sem override), o sistema MUST NOT auto-recalcular o cardápio por registro — só exibe (preserva "registrar não é gatilho"). _(Decisão Q2 revisada: o app mantém o tipo-de-dia escolhido entre telas.)_
- **FR-013b**: Ao recalcular um tipo-de-dia com consumo, o sistema MUST contar cada refeição (slot) **uma única vez** — os slots já registrados hoje entram pelo consumido e MUST ser excluídos das refeições restantes do novo tipo (evita contagem dupla).

#### Transversais

- **FR-014**: O rebalanceamento MUST permanecer **prévia/efêmero** — esta feature lê o registro (já persistido) e calcula; **não** persiste resultado de rebalanceamento.
- **FR-015**: O paciente MUST ver **ação** (quanto ajustar por refeição), **nunca** o total/desvio do dia nem o consumido-até-agora como número ou percentual de adesão. O consumido-até-agora é grandeza **interna** do motor. _(Gate de exposição / LGPD.)_

### Key Entities _(include if feature involves data)_

- **Consumido-até-agora**: vetor nutricional **interno do motor** que agrega o consumo real das refeições registradas do dia (feito = planejado da opção cumprida; troquei = alimentos × gramas efetivamente consumidos; pulei = 0). Entra no cálculo do desvio; **não** é exposto ao paciente como número.
- **Alavanca**: item flexível de uma refeição **não registrada** (exceto a do gatilho) — única coisa que o motor ajusta. (Refina a definição da Fase 2 excluindo as registradas.)
- **Faixa-alvo / piso**: inalterados da Fase 2 — o alvo é o do plano; o ajuste reaproxima do alvo; o piso é inviolável.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Em **100%** dos rebalanceamentos por troca de opção, **nenhuma** refeição já registrada (que não a do gatilho) tem a quantidade alterada.
- **SC-002**: Registrar **pulei** reflete como **déficit** no total do dia em **100%** dos casos, e o restante é sugerido a aumentar **em direção ao alvo** (sem furar o piso).
- **SC-003**: Trocar o tipo-de-dia após consumir refeições mostra o novo cardápio **ajustado** pelo consumido em **100%** dos casos (difere do planejado puro quando há desvio).
- **SC-004**: Em **0** casos o motor sugere quantidade **abaixo do piso** ou que **ultrapasse o alvo** do dia.
- **SC-005**: O rebalanceamento permanece **prévia**: em **100%** dos casos o estado do plano e do registro fica inalterado após uma prévia.
- **SC-006**: Em **0** casos o paciente vê o total/desvio do dia ou o consumido-até-agora como número ou percentual de adesão (só **ação** por refeição).

## Assumptions

- **Gatilho**: registrar **não** dispara prévia; só trocar opção / trocar tipo-de-dia (Q1). Combinar é operação local de uma refeição (não rebalanceia o dia) — fora do alcance desta feature.
- **Troca de tipo-de-dia**: recálculo **direto no cardápio** exibido, sem confirmação (Q2).
- **Déficit**: compensa **nos dois sentidos** (aumenta no déficit, reduz no excesso), sempre reaproximando do alvo, dentro de faixa + piso (Q3).
- **Consumo real**: feito = planejado da opção cumprida; troquei = alimentos × gramas consumidos (derivados do registro); pulei = 0 (descrição do usuário).
- **Consumido-até-agora** = soma do consumo real das refeições registradas (estado vigente) do **dia corrente**, do plano ativo, recalculada a cada exibição/rebalanceamento — sem persistir tipo-de-dia.
- **Reaproveita a Fase 2**: os ganchos do motor já existem (rebalanceamento por opção e por troca de tipo-de-dia) e a matemática de faixa/piso/recusa-orientada (ajuste em direção ao alvo) é a mesma — esta feature só os torna cientes do registro.
- **Continua efêmero**: rebalanceamento não persiste (mantém a decisão da Fase 2).
- **Auth/identidade**: v0 stub (paciente por env); inalterado.

## Out of Scope _(desta feature)_

- **Registrar como gatilho de prévia** (gatilho-3 pleno: marcar troquei/pulei já abrir a prévia do resto do dia) — deferido (Q1 escolheu não).
- **Combinar (1→2) ciente do registro** — N/A: combinar é operação local de uma refeição e não rebalanceia o resto do dia; não há refeições de terceiros para travar.
- **Persistir** o resultado do rebalanceamento.
- **`day_selection`** (override de tipo-de-dia persistido por data) — a troca continua sessão-only.
- **Adesão / relatório de ciclo**, **UI da nutri**, **comida fora da lista** — fases seguintes.
- **Escolher outros alimentos** para rebalancear (o motor segue reescalando gramas de itens flexíveis, não trocando alimentos) — backlog herdado da Fase 2.

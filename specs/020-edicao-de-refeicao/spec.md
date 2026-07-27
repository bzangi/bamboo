# Feature Specification: Edição de refeição em lote (registrar a refeição "de uma vez")

**Feature Branch**: `020-edicao-de-refeicao`

**Created**: 2026-07-27

**Status**: Draft

**Input**: User description: "precisamos de uma opção no app do paciente para registrar refeições livremente. Quando ele vê o almoço dele e não vai conseguir comer nada do que está listado, fica mais fácil ele colocar todos os itens de uma só vez, do que ir trocando um a um. Acredito que a melhor opção seja trabalharmos com 1 edição única por refeição, além da edição de item a item. Aí o usuário seleciona o modo de edição, muda os itens que ele quer, e no momento que ele vai submeter o form de edição, aparece uma tela/modal exibindo os impactos no resto do cardápio."

## O problema

Hoje, quando o paciente não vai comer **nada** do que está listado numa refeição, o caminho é
trocar item a item: abrir a folha de troca do item 1, escolher, fechar; abrir a do item 2,
escolher, fechar; e assim por diante. Para uma refeição de 4–5 itens são 4–5 fluxos completos —
o oposto de "trocar num toque" quando a mudança é a refeição inteira. Além do atrito, o paciente
nunca vê o efeito **acumulado** das trocas: cada troca preserva o nutriente-base do seu grupo,
mas o desvio de calorias/macros de várias trocas se soma e ninguém mostra se o dia continua
dentro da faixa.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Editar a refeição inteira de uma vez (Priority: P1)

O paciente abre o almoço, percebe que não vai comer nada do que está listado e entra no **modo de
edição** da refeição. Na mesma tela, troca cada item que quiser pela alternativa do grupo
(arroz → batata, frango → ovo, …), vendo as quantidades equivalentes calculadas. Nada é aplicado
enquanto ele edita. Ao submeter, as trocas pendentes são confirmadas de uma vez e a refeição passa
a exibir a nova composição — pronta para ser registrada com o "Feito" de sempre.

**Why this priority**: é a dor relatada — o lote é o produto; sem ele não existe feature.

**Independent Test**: com uma refeição de 3+ itens flexíveis, entrar no modo de edição, trocar 2
itens, submeter e confirmar; a refeição exibe as 2 trocas e o registro "Feito" grava o estado
"troquei" com os itens realmente escolhidos.

**Acceptance Scenarios**:

1. **Given** uma refeição não registrada com itens flexíveis, **When** o paciente entra no modo de
   edição, **Then** cada item flexível oferece as alternativas do seu grupo com quantidade
   equivalente, e itens travados aparecem como não editáveis.
2. **Given** o modo de edição com 2 trocas pendentes, **When** o paciente submete e confirma,
   **Then** as 2 trocas são aplicadas juntas e a refeição exibe os novos alimentos e quantidades.
3. **Given** o modo de edição com trocas pendentes, **When** o paciente cancela, **Then** nenhuma
   troca é aplicada e a refeição volta a exibir o estado anterior.
4. **Given** uma refeição editada e confirmada, **When** o paciente toca "Feito", **Then** o
   registro nasce como "troquei" carregando a composição completa consumida (itens trocados com as
   novas quantidades + itens não trocados como planejados).
5. **Given** um item à vontade (sem quantidade prescrita) no modo de edição, **When** o paciente o
   troca, **Then** a troca é 1:1 (sem quantidade calculada) e o item segue exibido como "à vontade".

---

### User Story 2 - Prévia de impacto no resto do cardápio (Priority: P2)

Ao submeter o modo de edição, antes de qualquer aplicação, o paciente vê uma prévia do efeito das
trocas no restante do dia: ou "tudo certo, sem impacto" (o dia segue na faixa-alvo), ou a lista de
refeições futuras com as quantidades ajustadas para compensar o desvio acumulado, ou uma recusa
orientada quando não há como compensar. Confirmar aplica trocas **e** ajustes num único ato;
recusar/fechar não aplica nada.

**Why this priority**: é a metade "plano que dobra sem quebrar" — sem a prévia, o lote esconde o
desvio acumulado; mas o lote (US1) já entrega valor sozinho com a prévia trivial "sem impacto".

**Independent Test**: editar uma refeição trocando itens cujo acumulado tira o dia da faixa-alvo;
a prévia lista as refeições afetadas com quantidades novas; confirmar aplica tudo; as refeições já
registradas do dia não aparecem entre as ajustadas.

**Acceptance Scenarios**:

1. **Given** trocas pendentes cujo acumulado mantém o dia na faixa-alvo, **When** o paciente
   submete, **Then** a prévia informa que não há impacto no resto do cardápio e oferece confirmar.
2. **Given** trocas pendentes cujo acumulado tira o dia da faixa-alvo, **When** o paciente
   submete, **Then** a prévia exibe, por refeição afetada, cada item ajustado com a quantidade
   nova (e medida caseira), sem número de calorias quando a exposição do paciente não permitir.
3. **Given** a prévia com ajustes exibida, **When** o paciente confirma, **Then** trocas e ajustes
   são aplicados juntos, num único ato, e um desfazer atômico fica disponível (desfaz trocas +
   ajustes de uma vez).
4. **Given** um dia em que a compensação estouraria o piso das demais refeições, **When** o
   paciente submete, **Then** a prévia exibe a recusa orientada (mensagem de ação, sem culpa) e
   nada é aplicado.
5. **Given** refeições já registradas no dia, **When** a prévia calcula ajustes, **Then** nenhuma
   refeição registrada é ajustada, e o consumo real delas entra no total do dia.
6. **Given** a refeição em edição, **When** a prévia calcula ajustes, **Then** a própria refeição
   editada nunca aparece entre as ajustadas (o que o paciente escolheu comer não é reescalado).

---

### User Story 3 - Convivência com os fluxos existentes (Priority: P3)

O paciente que só quer trocar um item continua usando o toque no item, exatamente como hoje. Quem
já trocou um item avulso e depois entra no modo de edição parte do estado que está vendo na tela
(a troca avulsa aparece como composição atual). Trocar de opção de refeição, combinar dois
alimentos e registrar feito/pulei continuam funcionando sem mudança.

**Why this priority**: proteção do que existe; não entrega valor novo, entrega ausência de
regressão.

**Independent Test**: executar os fluxos atuais (troca avulsa, combinação, troca de opção com
prévia, feito/pulei/desfazer) num build com a feature e verificar comportamento idêntico ao atual.

**Acceptance Scenarios**:

1. **Given** um item já trocado avulso na sessão, **When** o paciente entra no modo de edição da
   mesma refeição, **Then** a composição inicial do formulário reflete a troca avulsa já feita.
2. **Given** o modo de edição disponível, **When** o paciente usa a troca item a item fora do
   modo, **Then** o fluxo atual acontece sem alteração (sem prévia de impacto, como hoje).
3. **Given** uma refeição já registrada, **When** o paciente a visualiza, **Then** o modo de
   edição não é oferecido (registro é correção pelo fluxo existente, não edição).

---

### Edge Cases

- Refeição sem nenhum item flexível (todos travados/sem grupo): o modo de edição não é oferecido —
  não existe nada a editar.
- Refeição com opção trocada (chip de opção ativo): o modo de edição opera sobre a opção
  atualmente exibida; trocar de opção continua sendo o fluxo de chips, fora do modo.
- Todas as demais refeições do dia já registradas e o acumulado sai da faixa: não há alavanca —
  recusa orientada (comportamento já existente do motor).
- Paciente submete o formulário sem nenhuma troca pendente: nada a fazer — submeter sem mudança
  não abre prévia nem altera estado (ou o submeter fica desabilitado).
- Falha de rede ao calcular a prévia: mensagem não bloqueante; o modo de edição preserva as trocas
  pendentes para tentar de novo (não descarta o trabalho do paciente).
- Troca de tipo-de-dia com o modo de edição aberto: o modo é descartado junto com os demais
  estados de sessão (regra existente — trocar de tipo reseta a sessão).
- Item cuja lista de alternativas é longa: a busca e a paginação existentes da folha de troca
  valem dentro do modo de edição.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: O paciente DEVE poder entrar num modo de edição por refeição, disponível em qualquer
  refeição do dia ainda não registrada que tenha ao menos um item flexível.
- **FR-002**: No modo de edição, cada item flexível DEVE ser trocável por alternativa **do seu
  grupo de substituição**, com quantidade equivalente calculada pela regra vigente (preserva o
  nutriente-base; medida caseira incluída). Itens travados NÃO são editáveis; itens à vontade
  trocam 1:1 e permanecem "à vontade".
- **FR-003**: As trocas feitas no modo de edição DEVEM permanecer pendentes (sem efeito na
  refeição exibida nem no registro) até a confirmação; cancelar DEVE descartar todas.
- **FR-004**: Ao submeter, o sistema DEVE apresentar uma prévia do impacto no resto do dia antes
  de aplicar qualquer troca, com três desfechos possíveis e mensagens distintas: sem impacto
  (dia segue na faixa-alvo), ajustes por refeição (itens com quantidade nova para compensar o
  desvio acumulado) ou recusa orientada (não há como compensar).
- **FR-005**: A prévia NUNCA DEVE ajustar a refeição em edição nem refeições já registradas; o
  consumo real das registradas DEVE entrar no total do dia considerado.
- **FR-006**: Confirmar a prévia DEVE aplicar trocas e ajustes num único ato atômico; DEVE existir
  um desfazer igualmente atômico (trocas + ajustes voltam juntos).
- **FR-007**: Registrar "Feito" numa refeição editada DEVE produzir o estado "troquei" carregando
  a composição completa consumida, pelo mecanismo de registro existente.
- **FR-008**: Nada da edição nem da prévia DEVE ser persistido antes do registro; edição, prévia e
  ajustes são estado de sessão, como as adaptações existentes.
- **FR-009**: Os fluxos existentes (troca item a item, combinação, troca de opção com prévia,
  feito/pulei/desfazer, troca de tipo-de-dia) NÃO DEVEM mudar de comportamento nem de forma de
  resposta.
- **FR-010**: O modo de edição DEVE iniciar a partir da composição atualmente exibida da refeição
  (incluindo trocas avulsas e combinações já feitas na sessão).
- **FR-011**: A prévia DEVE respeitar o nível de exposição nutricional do paciente (sem números de
  calorias/macros quando a exposição não permitir), como as telas existentes.

### Key Entities

Nenhuma entidade nova. A edição é estado de sessão; a persistência acontece apenas no registro
existente (evento de refeição + snapshot dos itens consumidos), que já comporta a composição
editada.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Trocar N itens de uma refeição exige 1 fluxo de edição + 1 confirmação, em vez de N
  fluxos completos (para N=4, medido em passos de tela: de ~12 toques para ~6).
- **SC-002**: Os fluxos existentes não mudam: as suítes de comportamento atuais do app e da API
  passam sem alteração de expectativa.
- **SC-003**: Uma refeição editada e registrada aparece para a nutricionista como "troquei" com
  exatamente os itens e quantidades confirmados na edição.
- **SC-004**: Após confirmar uma edição com ajustes, o dia projetado fica dentro da faixa-alvo; se
  impossível, o paciente recebe recusa orientada e o estado anterior permanece intacto.
- **SC-005**: O paciente nunca vê a prévia mentir: o que a prévia exibiu é exatamente o que a
  confirmação aplica.

## Assumptions

- **"Livremente" = a refeição inteira de uma vez, não "qualquer comida"**: a troca continua
  confinada ao grupo de substituição de cada item — é o que preserva o nutriente-base e a conta de
  equivalência. Registrar comida fora da lista é a feature própria da Fase 4 e fica fora daqui.
- **Quantidades não são digitáveis**: permanecem sempre calculadas por equivalência ("mostra o
  certo por padrão"). Editar gramas à mão fica fora de escopo.
- **Combinar dois alimentos num item fica fora do modo de edição** (v1): a combinação continua
  disponível no fluxo item a item existente.
- **O modo de edição não registra por si**: confirmar aplica a adaptação; o registro continua
  sendo o ato existente ("Feito" → "troquei" derivado). Um atalho "confirmar e registrar" é
  evolução possível, não requisito.
- **Trocar de opção dentro do modo de edição fica fora de escopo**: opção é o fluxo de chips
  existente, com prévia própria.
- A prévia de impacto usa a mesma semântica de desfecho do motor existente (sem ação /
  rebalanceado / recusa orientada) e os mesmos parâmetros (faixa-alvo, piso).

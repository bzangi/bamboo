# Feature Specification: Desfazer coerente com o rebalanceamento

**Feature Branch**: `005-desfazer-vs-rebalanceamento`

**Created**: 2026-06-10

**Status**: Draft

**Input**: User description: "Corrigir o 'desfazer' (undo) no app do paciente para não quebrar o rebalanceamento. Hoje, quando o paciente troca a opção de uma refeição e o app rebalanceia as outras refeições, o botão '↺ desfazer' aparece nos itens dessas OUTRAS refeições; tocá-lo reverte só aquele item sem recalcular, deixando o dia inconsistente. Comportamento desejado: ajustes derivados do rebalanceamento não têm desfazer por-item; o desfazer por-item permanece só para mudança direta no próprio item; uma troca de opção é desfeita como unidade (opção + ajustes derivados juntos), via botão temporário ~5s e, de forma durável, re-tocando o chip da opção original."

## Contexto e o bug

O app do paciente tem **dois** controles rotulados "↺ desfazer", semanticamente distintos:

1. **Desfazer do registro** — no marcador de uma refeição já registrada (feito/troquei/pulei). Anula o registro daquela refeição. **Fora de escopo desta feature; não muda.**
2. **Desfazer por-item** — em um item flexível de uma refeição, quando aquele item tem uma adequação aplicada. **É o alvo desta feature.**

Quando o paciente troca a **opção** de uma refeição (ex.: almoço "arroz + carne" → "mandioca + carne"), o app rebalanceia as **outras** refeições, ajustando as quantidades dos itens flexíveis delas. Esses ajustes derivados fazem o desfazer por-item aparecer nos itens das outras refeições. Tocá-lo reverte **apenas aquele item** para a quantidade planejada, **sem recalcular o rebalanceamento** — a refeição-gatilho mantém a opção trocada, e o dia fica inconsistente (um "gap" entre o que foi trocado e o que o rebalanceamento previa).

A correção separa as duas coisas: ajuste derivado do rebalanceamento não é uma mudança "do item", e sim consequência da troca da refeição — logo só pode ser desfeito desfazendo a **troca inteira**, nunca item a item.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Desfazer a troca de refeição como unidade, sem deixar gap (Priority: P1)

O paciente troca a opção de uma refeição; o app rebalanceia as outras. Os itens rebalanceados das outras refeições **não** oferecem desfazer por-item (não há como criar inconsistência). Para voltar atrás, o paciente desfaz a **troca inteira** — revertendo a opção escolhida e todos os ajustes derivados de uma vez —, re-tocando o chip da opção original/default da refeição que trocou. O dia volta exatamente ao estado anterior à troca.

**Why this priority**: É o fechamento do bug e o que mantém a assinatura "nunca barra": o paciente sempre tem um caminho de volta, e nunca consegue deixar o dia num estado meio-trocado-meio-revertido. Sozinha já é um MVP coerente (bug fechado + sempre reversível).

**Independent Test**: Trocar a opção de uma refeição com rebalanceamento das demais; confirmar que (a) os itens ajustados das outras refeições não têm controle de desfazer por-item e (b) re-tocar a opção original reverte a opção e todos os ajustes juntos, deixando o dia idêntico ao estado pré-troca.

**Acceptance Scenarios**:

1. **Given** uma troca de opção que rebalanceou outras refeições, **When** o paciente observa os itens ajustados dessas outras refeições, **Then** nenhum deles apresenta o controle "↺ desfazer" por-item.
2. **Given** uma troca de opção ativa (com ajustes derivados aplicados), **When** o paciente re-toca o chip da opção original/default da refeição trocada, **Then** a opção volta à original e todos os ajustes derivados são removidos de uma vez, restaurando as quantidades planejadas das outras refeições.
3. **Given** uma troca de opção ativa, **When** o paciente tenta desfazer parcialmente um item de outra refeição, **Then** isso não é oferecido pela interface (não existe ação de desfazer por-item naquele item).

---

### User Story 2 - Botão temporário "Desfazer" logo após a troca (Priority: P2)

Imediatamente após confirmar uma troca de opção, aparece uma ação temporária "Desfazer" por cerca de 5 segundos. Tocá-la reverte a troca inteira (mesma semântica da US1). Passados os ~5s, a ação some; a partir daí, o caminho durável (chip da opção original) continua disponível.

**Why this priority**: Atalho de baixo atrito para o arrependimento imediato ("troquei sem querer"). É aditivo sobre a US1 — não é a única forma de desfazer.

**Independent Test**: Confirmar uma troca de opção; verificar que a ação "Desfazer" aparece, reverte tudo se tocada dentro da janela, e desaparece sozinha após ~5s sem deixar a troca desfeita.

**Acceptance Scenarios**:

1. **Given** o paciente acabou de confirmar uma troca de opção, **When** a tela atualiza, **Then** uma ação temporária "Desfazer" fica visível por ~5 segundos.
2. **Given** a ação temporária "Desfazer" visível, **When** o paciente a toca dentro da janela, **Then** a troca inteira é revertida (opção + ajustes derivados).
3. **Given** a ação temporária "Desfazer" visível, **When** ~5 segundos se passam sem toque, **Then** a ação desaparece e a troca permanece aplicada.
4. **Given** uma ação temporária "Desfazer" em curso, **When** o paciente faz uma nova troca antes de a janela expirar, **Then** a ação passa a referir-se à nova troca e a janela reinicia.

---

### User Story 3 - Desfazer por-item preservado para mudança direta no item (Priority: P3)

Quando o paciente muda **diretamente** um item — substitui o alimento ou combina dois — aquele item continua tendo seu próprio "↺ desfazer", que reverte só aquela mudança (sem afetar outras refeições, pois essas ações não rebalanceiam).

**Why this priority**: Guarda de regressão. A correção remove o desfazer por-item dos itens _rebalanceados_, mas não pode remover o desfazer das mudanças diretas, que é comportamento legítimo existente.

**Independent Test**: Substituir (ou combinar) um item; confirmar que aquele item oferece "↺ desfazer" e que tocá-lo reverte apenas aquele item, sem mexer em outras refeições.

**Acceptance Scenarios**:

1. **Given** um item que o paciente substituiu ou combinou, **When** ele observa esse item, **Then** o controle "↺ desfazer" por-item está disponível.
2. **Given** um item substituído/combinado, **When** o paciente toca seu "↺ desfazer", **Then** apenas aquele item volta ao planejado, sem alterar as demais refeições.

---

### Edge Cases

- **Re-troca (A→B, depois A→C)**: ao escolher uma opção diferente da já trocada, os ajustes derivados da troca anterior são substituídos integralmente — não pode sobrar ajuste "fantasma" da troca anterior.
- **Troca seguida de desfazer e nova troca**: após desfazer, o dia está limpo; uma nova troca recomeça do estado planejado.
- **Troca de tipo-de-dia**: trocar o tipo-de-dia reinicia o estado de sessão (overrides e trocas), portanto não há troca pendente para desfazer depois disso. Comportamento atual preservado.
- **Item simultaneamente alterado diretamente e alvo de rebalanceamento**: caso raro; o item exibe a mudança direta (prevalece) e mantém o desfazer da mudança direta. Esta feature não altera esse comportamento pré-existente.
- **Desfazer do registro vs. desfazer da troca**: são ações independentes. Desfazer um registro (feito/troquei/pulei) não desfaz uma troca de opção, e vice-versa.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: Itens cujas quantidades foram ajustadas por rebalanceamento (consequência de uma troca de opção de outra refeição) NÃO devem apresentar controle de desfazer por-item.
- **FR-002**: Itens alterados diretamente pelo paciente (substituição ou combinação) DEVEM continuar apresentando controle de desfazer por-item, que reverte apenas aquele item.
- **FR-003**: O paciente DEVE poder desfazer uma troca de opção de refeição como unidade única, revertendo a opção escolhida E todos os ajustes derivados de uma só vez, devolvendo o dia ao estado anterior à troca.
- **FR-004**: Imediatamente após confirmar uma troca de opção, o sistema DEVE oferecer uma ação temporária de desfazer, visível por aproximadamente 5 segundos, que desaparece sozinha em seguida.
- **FR-005**: O sistema DEVE oferecer um caminho durável de desfazer da troca (disponível também depois de a ação temporária sumir): re-selecionar a opção original/default da refeição trocada reverte a troca e remove todos os seus ajustes derivados.
- **FR-006**: Ao trocar para uma opção diferente quando já há uma troca ativa na mesma refeição (re-troca), o sistema DEVE substituir integralmente os ajustes derivados da troca anterior, sem deixar ajustes remanescentes.
- **FR-007**: A correção NÃO deve alterar o desfazer do registro de refeição (marcador feito/troquei/pulei) nem a matemática do rebalanceamento.
- **FR-008**: Todo o estado de troca/desfazer permanece efêmero (apenas na sessão), sem persistência — coerente com o v0.
- **FR-009**: Apenas a troca de opção de refeição dispara rebalanceamento das outras refeições; substituir/combinar um item permanece mudança local do próprio item (com seu desfazer) e não rebalanceia.

### Key Concepts _(estado de sessão, não dados persistidos)_

- **Troca (de opção)**: escolha de uma opção diferente da default em uma refeição; carrega consigo o conjunto de ajustes derivados que produziu nas outras refeições. Desfazer a troca = remover a escolha e todos os seus ajustes juntos.
- **Mudança direta de item**: substituição ou combinação aplicada a um item específico; isolada (não rebalanceia) e desfazível só naquele item.
- **Ajuste derivado**: nova quantidade de um item de outra refeição, resultante de uma troca; pertence à troca, não ao item — só desfeito desfazendo a troca.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Após desfazer uma troca, 100% das quantidades e opções do dia coincidem com o estado imediatamente anterior à troca (zero ajuste residual).
- **SC-002**: É impossível, pela interface, deixar o dia em estado inconsistente desfazendo itens rebalanceados individualmente — zero cenários de "gap" alcançáveis.
- **SC-003**: O paciente consegue reverter uma troca de refeição inteira em no máximo 2 toques, a qualquer momento; e em 1 toque dentro de ~5s após a troca.
- **SC-004**: 100% dos itens alterados diretamente (substituídos/combinados) mantêm seu desfazer individual (sem regressão).
- **SC-005**: A ação temporária de desfazer fica visível por ~5 segundos (±1s) e some sem intervenção.

## Assumptions

- Apenas a troca de opção rebalanceia as outras refeições; substituir/combinar não rebalanceia (confirmado com o stakeholder).
- A janela da ação temporária de desfazer é de ~5 segundos (faixa aceita 3–5s; adotado 5s).
- Tudo é efêmero no v0 (nada persiste no servidor); a correção é no comportamento do app do paciente.
- O desfazer do registro de refeição (feito/troquei/pulei) é uma preocupação separada e permanece inalterado.
- O caso de um item ao mesmo tempo alterado diretamente e alvo de rebalanceamento é raro e mantém o comportamento atual (a mudança direta prevalece); não é objetivo desta feature.

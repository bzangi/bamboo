# Feature Specification: Busca + alimento de origem no modo de combinar

**Feature Branch**: `021-combinar-busca-e-self` (planejada e executada na `main`, padrão 006–020)
**Date**: 2026-07-27
**Origem**: pedido do dono — "ao combinar 2 alimentos, quero poder selecionar o alimento que já
está no plano e também quero o mesmo search que foi implementado na opção de troca". Grilling
confirmou: não é combinação cross-grupo — é especificamente o alimento **de origem** (o que já
está no item que vai ser combinado) faltando na lista de candidatos.
**Status**: Draft

## Por que existe

O modo de combinar (`CombineSheet`) lista **o grupo inteiro** de substituição do item numa lista
simples, sem busca — o mesmo problema que a 019 resolveu para a troca simples (`SubstitutionSheet`)
continua aqui: achar um alimento entre dezenas é rolagem, não "trocar num toque".

Além disso, a lista de candidatos hoje **exclui o alimento que já está no item** (o endpoint
`GET /meal-items/:id/substitutions` tira o food de origem da consulta — correto para troca simples,
onde substituir um alimento por ele mesmo não faz sentido). No combinar isso é uma perda real: o
paciente quer poder dizer "metade do arroz que já como + metade de batata", mantendo o próprio
arroz como uma das duas partes. Hoje isso é impossível — ao abrir o combinar, o alimento do item
simplesmente não aparece na lista.

## User Scenarios & Testing

### User Story 1 — O paciente acha o alimento que quer, também ao combinar (Priority: P1)

No modo de combinar, o paciente digita parte do nome e a lista de candidatos se reduz ao que casa,
com o mais relevante primeiro — igual já acontece na troca simples desde a 019.

**Independent Test**: abrir o combinar de um item com um grupo grande, digitar um trecho do nome de
um alimento do grupo, e ver a lista filtrar para ele.

**Acceptance Scenarios**:

1. **Given** o combinar está aberto com o grupo inteiro carregável, **When** o paciente digita um
   trecho do nome, **Then** a lista de candidatos mostra só o que casa, ordenado por relevância.
2. **Given** um grupo grande, **When** o combinar abre, **Then** só a primeira página de candidatos
   é carregada, crescendo conforme o paciente rola (igual à troca simples).
3. **Given** o campo de busca vazio, **When** o combinar abre, **Then** o comportamento é o de hoje
   (grupo navegável por rolagem, começando pela primeira página).

### User Story 2 — O paciente combina mantendo o próprio alimento como uma das partes (Priority: P1)

Ao combinar um item, o alimento que já está ali (a origem) aparece como um candidato selecionável,
ao lado dos demais do grupo — permitindo "metade do que já era + metade de outro alimento".

**Independent Test**: abrir o combinar de um item, confirmar que o próprio alimento do item aparece
na lista de candidatos, selecioná-lo junto com um segundo alimento do grupo, e ver as duas partes
calculadas normalmente.

**Acceptance Scenarios**:

1. **Given** um item flexível sendo combinado, **When** o paciente abre a lista de candidatos,
   **Then** o alimento que já está no item aparece nela, junto com os demais do grupo.
2. **Given** o alimento de origem selecionado como um dos dois alvos, **When** o paciente também
   seleciona um segundo alimento do grupo, **Then** a combinação é calculada normalmente, com as
   duas partes preservando o nutriente-base do item original.
3. **Given** a troca simples (1 alvo, não combinar), **When** o paciente abre a lista de
   alternativas, **Then** o alimento de origem **não** aparece — comportamento inalterado.

### Edge Cases

- O que acontece se o termo de busca não casar com o alimento de origem? Ele é filtrado como
  qualquer outro candidato — sem tratamento especial na busca.
- O que acontece se o paciente tentar selecionar o alimento de origem duas vezes (como os dois
  alvos)? Continua bloqueado — a regra de "2 alvos distintos" não muda.
- O que acontece com a proporção (split) quando um dos alvos é o próprio alimento de origem? Segue
  a mesma faixa e mecânica de ajuste de hoje (sem alvo com 0% ou 100%).

## Requirements

### Functional Requirements

- **FR-001**: O modo de combinar deve oferecer busca sobre os candidatos, usando a mesma régua
  fuzzy da 019 (`buscarFuzzy`, subsequência pontuada, insensível a caixa/acento).
- **FR-002**: O modo de combinar deve paginar os candidatos (primeira página curta, mais conforme a
  rolagem) — mesmo padrão da troca simples.
- **FR-003**: A lista de candidatos do combinar deve incluir o alimento que já está no item de
  origem, além dos demais do mesmo grupo.
- **FR-004**: Selecionar o alimento de origem como um dos dois alvos da combinação deve calcular as
  duas partes normalmente, sem erro — preservando o nutriente-base do item original.
- **FR-005**: A troca simples (1 alvo, `SubstitutionSheet`) não muda de comportamento — o alimento
  de origem continua excluído da lista ali.
- **FR-006**: A combinação continua restrita ao **mesmo grupo de substituição** do item de origem —
  nenhum alvo de outro grupo, incluindo quando um dos alvos é o próprio alimento de origem.
- **FR-007**: A regra de exatamente 2 alvos distintos não muda.

## Success Criteria

### Measurable Outcomes

- **SC-001**: No combinar, o paciente encontra um alimento entre os candidatos digitando parte do
  nome, com o mesmo comportamento de busca já validado na troca simples (019).
- **SC-002**: O alimento que já está no item aparece na lista de candidatos do combinar e pode ser
  escolhido como um dos dois alvos.
- **SC-003**: Combinar o alimento de origem com outro do grupo produz duas partes cuja soma de
  nutriente-base é igual à do item original (dentro da tolerância de arredondamento já usada).
- **SC-004**: A troca simples (1 alvo) continua sem alteração de comportamento — suítes existentes
  passam sem diff.

## Assumptions

- Busca e paginação do combinar reusam a mesma régua e o mesmo endpoint já usados pela troca
  simples (`GET /meal-items/:id/substitutions`), com um parâmetro adicional opcional para incluir o
  alimento de origem — sem endpoint novo.
- Nenhuma mudança na definição de grupo de substituição nem na matemática de combinação
  (`packages/core/src/combination.ts`) — o alimento de origem, quando escolhido como alvo, passa
  pela mesma conta que qualquer outro alimento do grupo.
- A UI de combinar continua exigindo exatamente 2 alvos (sem 1 ou 3+), como hoje.

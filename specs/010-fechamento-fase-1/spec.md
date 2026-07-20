# Feature Specification: Fechamento da Fase 1 — nutrição da alternativa na substituição

**Feature Branch**: `010-fechamento-fase-1` (planejada na `main` — padrão das features 006–008)

**Created**: 2026-07-20

**Status**: Draft — aguardando gate Specify→Plan (Bruno)

**Input**: User description: "Fechamento da Fase 1 — nutrição da alternativa na substituição + reconciliação dos pendentes obsoletos."

## Contexto e decisão que motiva a spec

A pesquisa de 2026-07-20 (docs + código + board) mostrou que, dos pendentes de Fase 1 no
board Notion, **quatro cards estão obsoletos** — superados por decisões de produto já
documentadas e implementadas:

| Card                                                     | Veredito             | Por quê                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BAM-38 `PATCH /meal-items/:id` (persistir troca)         | **Obsoleto**         | A persistência da troca é via **registro "troquei"** (003, snapshot D3b em `meal_event_item`); mutar o plano é explicitamente rejeitado (`docs/handoff-proximas-fases.md` §8). A exceção deliberada e futura é "fixar substituto no plano" (feature D, EP-2 reframado, Fase 4). |
| BAM-55/56/57 (subtasks do 38: DTO, service, e2e)         | **Obsoletos**        | Caem com o pai. O guard de item travado→422 e a persistência do troquei **já são testados** (suítes `substitutions` e `registro`).                                                                                                                                              |
| BAM-40 "Mobile: trocar useState por chamada real"        | **Obsoleto**         | Não há mock/hardcode no app: os 5 endpoints reais estão cabeados via `@bamboo/api-client`; o estado local de troca é **design** (005, FR-008 — efêmero por decisão), não stopgap.                                                                                               |
| BAM-39 "/substitutions devolver nutrição da alternativa" | **Único com mérito** | A lista de alternativas hoje mostra só nome + quantidade (gramas/medida caseira) — a nutrição da porção equivalente não é exposta em lugar nenhum. É a lacuna funcional real que resta da Fase 1.                                                                               |

Esta feature fecha a Fase 1 com três entregas: (1) a nutrição da alternativa (BAM-39),
(2) o hardening de verificação do que já existe, (3) a reconciliação formal do board e docs.

### Decisão de produto para o gate (D1)

> **Incluir a nutrição da alternativa na escolha de substituição?**
>
> **Recomendação: SIM, sob o gate de exposição** (o mesmo `exposure_level` que governa o
> `/today`). Racional: (a) o card do item já mostra nutrição quando a nutri libera — a lista
> de alternativas é a mesma classe de informação no momento de decidir; (b) as alternativas
> são equivalentes por construção (preservam o nutriente-base do grupo), então os números
> reforçam a mensagem "é equivalente" em vez de induzir caça a caloria; (c) a nutri controla
> por paciente — coerente com a assinatura "ação, não número" para quem ela decidir proteger.
>
> **Se a decisão for NÃO:** a User Story 1 cai inteira; a feature reduz a US2+US3
> (hardening + reconciliação) e a Fase 1 fecha do mesmo jeito.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Nutrição da porção equivalente na escolha da alternativa (Priority: P1)

Ao tocar "Trocar" num item flexível, o paciente vê, para cada alternativa, além do nome e
da quantidade equivalente (gramas + medida caseira), a informação nutricional daquela porção
equivalente — **quando a nutri liberou números para esse paciente**. A apresentação é
neutra: mesma linguagem visual da nutrição que o card do item já usa, sem comparações, sem
"economize X kcal", sem ordenar por caloria. Quem tem números ocultos pela nutri continua
vendo a lista exatamente como hoje.

**Why this priority**: é a única lacuna funcional remanescente da Fase 1 — o paciente decide
a troca hoje sem ver o que aquela porção representa, informação que o app já mostra para o
item corrente no card. Fecha o ciclo "mostra o certo → deixa trocar num toque" com a mesma
transparência nas duas pontas.

**Independent Test**: com um paciente de exposição liberada, abrir o sheet de troca de um
item flexível e conferir a nutrição em cada alternativa; repetir com paciente de exposição
mínima e conferir a ausência de números. Não depende de US2/US3.

**Acceptance Scenarios**:

1. **Given** um paciente cuja exposição permite ver números, **When** ele abre "Trocar" num
   item flexível, **Then** cada alternativa exibe a nutrição (kcal e macros) calculada sobre
   a **mesma quantidade equivalente** exibida (as gramas que preservam o nutriente-base do
   grupo), junto de nome, gramas e medida caseira.
2. **Given** um paciente cuja exposição oculta números, **When** ele abre "Trocar", **Then**
   nenhuma alternativa exibe número de nutrição — a resposta do sistema **não contém** esses
   números (omitidos na fonte, não escondidos na tela).
3. **Given** uma alternativa sem medida caseira cadastrada, **When** a lista é exibida,
   **Then** a nutrição aparece normalmente (ela depende só das gramas equivalentes).
4. **Given** qualquer paciente, **When** a lista é exibida, **Then** a ordem das alternativas
   e o conteúdo de nome/gramas/medida caseira são os mesmos de hoje (sem reordenar por
   caloria, sem destaque de "melhor escolha").

---

### User Story 2 - Confiança no fluxo existente (hardening de verificação) (Priority: P2)

Sem mudança de comportamento: o que a Fase 1–3 entregou ganha as verificações automatizadas
que faltam, para que o fechamento da fase seja um estado comprovado, não declarado. Duas
lacunas conhecidas: (a) a montagem, no app, do consumo efetivo que vira o registro "troquei"
(substituir/combinar → itens efetivos enviados no registro) não tem teste; (b) o caso "grupo
sem outras alternativas → lista vazia, sem erro" não tem verificação explícita na API.

**Why this priority**: o snapshot do troquei é o insumo da adesão (006) e do futuro relatório
de ciclo — se a montagem do payload quebrar silenciosamente, a nutri passa a ver dados
errados. É a peça de maior valor sem cobertura hoje.

**Independent Test**: rodar as suítes; os testes novos falham se a montagem do consumo ou o
contrato da lista vazia regredirem. Não depende de US1/US3.

**Acceptance Scenarios**:

1. **Given** um item substituído (e outro combinado) no app, **When** o paciente registra a
   refeição, **Then** existe verificação automatizada de que o consumo enviado contém os
   itens efetivos (alimento + quantidade) de cada mudança — e ela falha se a montagem quebrar.
2. **Given** um item flexível cujo grupo não tem outras alternativas, **When** as alternativas
   são consultadas, **Then** o sistema responde com lista vazia sem erro — verificado por
   teste automatizado.
3. **Given** as suítes existentes (núcleo, API, app), **When** a feature fecha, **Then** todas
   seguem verdes (nenhuma regressão).

---

### User Story 3 - Fase 1 formalmente encerrada (Priority: P3)

O estado de gestão passa a refletir a realidade: os cards obsoletos do board são fechados com
a justificativa registrada (apontando a decisão documentada que os superou), o BAM-39 reflete
esta spec, e o pendente de verificação manual da 005 (smoke da UI de desfazer — snackbar,
timing, chip da opção default) é executado e tem o resultado documentado. Docs de estado
(`docs/estado-atual.md`, header do `CLAUDE.md`) registram a Fase 1 como concluída.

**Why this priority**: fechar fase é decisão auditável — sem isso o board continua mandando
implementar coisa rejeitada por decisão de produto (foi exatamente o que motivou esta spec).

**Independent Test**: board sem pendências de Fase 1 (cada card fechado com justificativa),
smoke da 005 com roteiro e resultado registrados, docs de estado atualizados.

**Acceptance Scenarios**:

1. **Given** os cards BAM-38/55/56/57/40, **When** a reconciliação é feita, **Then** cada um
   está fechado/marcado como superado com justificativa curta e link para a decisão
   (handoff §8 / 005 FR-008), visível no próprio card.
2. **Given** o smoke manual pendente da 005, **When** executado (simulador + API + banco),
   **Then** o roteiro e o resultado (ok/falha por item) ficam documentados; falhas viram
   pendência explícita, não silêncio.
3. **Given** os docs de estado, **When** a feature fecha, **Then** `docs/estado-atual.md` e o
   header do `CLAUDE.md` declaram a Fase 1 concluída e o porquê dos cards obsoletos.

---

### Edge Cases

- **Alternativa com nutrição ~zero** (ex.: bebidas/vegetais de kcal desprezível): exibe os
  valores reais (inclusive 0) — neutro, sem tratamento especial.
- **Exposição intermediária** (níveis entre "nada" e "tudo"): a alternativa segue exatamente
  a mesma régua que o card do item usa hoje — nível a nível, mostra o que o `/today` mostraria
  para aquele nível.
- **Item travado / sem grupo**: comportamento inalterado (a consulta de alternativas continua
  sendo recusada como não-substituível; a UI continua nem oferecendo o botão).
- **Fluxo de combinar**: a tela de combinar consome a mesma consulta de alternativas; a
  exibição de nutrição **nela** fica fora desta feature (a porção final depende do split, o
  número da porção cheia confundiria). O dado presente na resposta não obriga exibição.
- **Paciente sem exposição definida**: segue o default vigente do sistema (o mesmo que o
  `/today` aplica hoje) — nenhuma regra nova de default.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: Ao listar alternativas de substituição de um item flexível, o sistema MUST
  incluir, por alternativa, a nutrição da porção equivalente (energia e macronutrientes)
  calculada sobre as mesmas gramas equivalentes já exibidas — **condicionado à decisão D1**.
- **FR-002**: A exibição de nutrição da alternativa MUST obedecer ao mesmo gate de exposição
  que governa os números do paciente no restante do app (controlado pela nutri, por
  paciente). Quando o gate oculta números, a resposta MUST omitir a nutrição na origem — o
  dado não trafega para ser escondido no cliente.
- **FR-003**: A apresentação MUST ser neutra e de equivalência: sem ordenar por caloria, sem
  deltas/comparações entre alternativas ou com o item corrente, sem rótulos de "melhor/pior"
  — troca é equivalência, não economia (herda o FR-015 da 001).
- **FR-004**: Nome, quantidade equivalente, medida caseira, ordem das alternativas e os
  comportamentos de borda existentes (item travado → recusa; grupo sem alternativas → lista
  vazia sem erro) MUST permanecer inalterados.
- **FR-005**: A montagem do consumo efetivo no app (substituição e combinação → itens
  efetivos enviados no registro) MUST ter verificação automatizada que falhe se a montagem
  regredir (hoje só o lado servidor do troquei é testado).
- **FR-006**: O caso "grupo sem outras alternativas → lista vazia, sucesso" MUST ter
  verificação automatizada explícita no contrato da API.
- **FR-007**: A feature MUST NOT introduzir persistência nova (sem migration, sem escrita no
  plano): a troca de item continua efêmera na sessão e persistida somente via registro
  "troquei". O motor de rebalanceamento MUST NOT ser alterado (troca de item continua não
  disparando rebalanceamento).
- **FR-008**: O fechamento MUST reconciliar o estado de gestão: cards obsoletos fechados com
  justificativa e referência à decisão documentada; card da nutrição refletindo esta spec;
  docs de estado declarando a Fase 1 concluída.
- **FR-009**: O pendente de verificação manual da 005 (comportamento do desfazer da troca de
  opção: snackbar ~5s, chip durável da opção default, atomicidade do desfazer) MUST ser
  executado e documentado como parte do fechamento; falha observada vira pendência explícita.

### Key Entities

Nenhuma entidade nova e nenhum dado novo persistido. A nutrição da alternativa é **atributo
derivado** (calculado da composição do alimento sobre a quantidade equivalente), exposto na
consulta existente de alternativas apenas quando o gate de exposição permite.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Paciente com números liberados vê energia e macros de **100% das alternativas**
  listadas ao trocar, sem nenhum toque adicional (a informação está na própria lista).
- **SC-002**: Paciente com números ocultos não vê **nenhum** número de nutrição novo em
  nenhuma tela, e as respostas do sistema para ele não carregam esses valores (zero
  vazamento — mesma régua do SC-005/007 da 006).
- **SC-003**: Zero regressão: todas as suítes automatizadas existentes (núcleo, API, app)
  seguem verdes após a feature.
- **SC-004**: As duas lacunas de verificação conhecidas (montagem do consumo no app; lista
  vazia na API) passam a ter testes que falham sob regressão — comprovado vendo-os falhar
  antes da correção/implementação e passar depois (disciplina test-first).
- **SC-005**: Board sem nenhum card pendente de Fase 1: cada um fechado com justificativa
  auditável ou re-endereçado; Fase 1 declarada concluída nos docs de estado.
- **SC-006**: Smoke manual da 005 executado com roteiro e resultado registrados (100% dos
  itens do roteiro com veredito ok/falha).

## Assumptions

- **D1 pendente de ratificação**: a recomendação (incluir nutrição, sob gate) foi assumida
  para escrever US1/FR-001–003; o gate Specify→Plan pode derrubá-la sem afetar US2/US3.
- A exposição do paciente é derivável do próprio item consultado (o item pertence a uma
  opção → refeição → plano → paciente); não é preciso mudar a forma de chamar a consulta.
- A régua de exposição vigente do `/today` é a fonte de verdade de "o que cada nível vê";
  esta feature não cria nível nem regra nova de exposição.
- A tela de combinar não passa a exibir nutrição (fora de escopo de exibição; sem bloqueio
  futuro).
- Sem migration; núcleo de cálculo já existente é reutilizado (nenhuma matemática nova).
- Board Notion é camada de gestão de sincronização manual — a reconciliação (US3) é ato
  desta feature, não automação.

## Out of Scope

- **Persistir a troca no plano** (`PATCH /meal-items/:id` e variantes) — superado: a
  persistência é via registro "troquei"; mutação de plano é rejeitada por decisão documentada.
- **Fixar substituto no plano** (preferência permanente — feature D / EP-2 reframado,
  Fase 4): a exceção deliberada, ainda não specada; não entra aqui.
- **Nutrição do item corrente** na resposta de alternativas (já visível no card via `/today`).
- **Exibição de nutrição no fluxo de combinar.**
- **Qualquer mudança no motor de rebalanceamento, no registro, na adesão ou no ciclo.**
- **Auth real / guard de propriedade** (EP-3, transversal — segue fora, como nas features
  001–009).

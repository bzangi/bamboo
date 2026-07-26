# Feature Specification: A prévia de rebalanceamento passa a enxergar o override de tipo-de-dia

**Feature Branch**: `014-rebalance-ciente-do-override` (executada na `main`, padrão 006–013)
**Date**: 2026-07-26
**Origem**: [KI-005](../../docs/known-issues.md) + [KI-002](../../docs/known-issues.md) Sintoma A ·
reabre [ADR-0001](../../docs/adr/0001-chave-de-pareamento-sob-override.md)
**Status**: Specify

## A decisão do dono, que destrava esta feature

O ADR-0001 condicionava reabertura a **duas** coisas: "decisão de produto sobre qual dos dois
lados está certo, **e com o teste de colisão escrito antes**".

- O **teste** está pronto desde 2026-07-26: `apps/api/test/colisao-position.e2e-spec.ts`, 8
  casos de caracterização, poder de detecção verificado por reversão.
- A **decisão** foi tomada em 2026-07-26: **opção (a)** — `POST option-choice` passa a aceitar
  o override de tipo-de-dia, como `POST /registro` já aceita.

A opção (b) — manter a resolução por weekday e parear o consumo por `position` — foi
**rejeitada**. Ela conserta o Sintoma A mas **não** mata o 404 do KI-005 (verificado por
reversão: com (b) aplicada, os casos do KI-005 seguem verdes), e obrigaria a inventar uma regra
de desempate para colisão de `position` que hoje não existe em lugar nenhum do motor.

## Por que existe

Duas coisas quebradas, com a mesma raiz: **assimetria de contrato** entre os dois endpoints que
o app chama da mesma tela.

`POST /patients/:id/registro` **aceita** `body.dayTypeId` e grava o snapshot do override.
`POST /patients/:id/rebalance/option-choice` **não aceita** tipo-de-dia nenhum — resolve sempre
pelo `day_schedule` do weekday, monta o roster com as refeições daquele tipo, e **rejeita com
404** um gatilho que não esteja nele.

E o app renderiza os chips de opção **sem consultar** se há override ativo — só o _desfazer do
registro_ é gateado. Consequências, ambas medidas:

1. **KI-005**: com o picker em outro tipo-de-dia, **toda** refeição exibida é do tipo do
   override, logo **todo** toque em chip cai no 404. A prévia de rebalanceamento — o
   diferencial do produto — está simplesmente **inalcançável** sob override.
2. **KI-002 Sintoma A**: uma refeição registrada sob override é **invisível** ao motor. Ela
   continua alavanca, com grama planejada, e seu consumo real não entra no total. O motor
   redistribui como se o paciente ainda fosse comer o que já comeu.

O (1) é mais grave que o (2): lá o número sai errado, aqui a função não roda.

## User Scenarios & Testing

### User Story 1 — A prévia funciona sob override (Priority: P0)

O paciente troca o tipo-de-dia no picker, toca numa opção diferente e **vê a prévia**.

**Por que P0**: é o bug que impede o diferencial do produto de funcionar. Sem isto, nada mais
importa nesta feature.

**Acceptance Scenarios**

1. **Given** o paciente com override ativo num tipo-de-dia B, **When** ele escolhe uma opção
   não-default de uma refeição de B, **Then** o sistema devolve a prévia (200), nunca 404.
2. **Given** o mesmo estado, **When** o cardápio de B tem desvio que sai da faixa, **Then** as
   alavancas recalculadas são **de B**, e o dia é comparado contra a **faixa-alvo de B** — o
   tipo que o paciente está vendo.
3. **Given** nenhum override, **When** o paciente escolhe uma opção, **Then** o comportamento é
   **exatamente** o de hoje: tipo do weekday, mesmas alavancas, mesmos números.

### User Story 2 — O motor enxerga o que foi registrado sob override (Priority: P0)

Uma refeição já registrada sob override sai das alavancas e entra no total pelo consumido.

**Por que P0**: é o Sintoma A do KI-002 — a grama que o paciente vê está errada hoje.

**Acceptance Scenarios**

1. **Given** o paciente registrou `pulei` na refeição de posição 1 do tipo B, sob override,
   **When** ele escolhe uma opção não-default noutra refeição **de B**, **Then** a refeição
   registrada **não** aparece nas alavancas, e o consumo real dela (zero, no caso do `pulei`)
   entra no total.
2. **Given** o mesmo registro, **When** a prévia é pedida, **Then** o resultado é **diferente**
   do resultado sem aquele registro — é o que prova que o motor passou a enxergá-lo.

### User Story 3 — O gatilho segue validado (Priority: P1)

Aceitar o override não pode virar uma porta para pedir prévia de coisa que não é do paciente.

**Acceptance Scenarios**

1. **Given** um `dayTypeId` que não pertence ao plano ativo do paciente, **When** a prévia é
   pedida, **Then** 404, com a mesma mensagem que o `POST /registro` já usa.
2. **Given** um `dayTypeId` válido, **When** o `triggerMealId` é de **outro** tipo-de-dia,
   **Then** 404 "refeição do gatilho não está no dia corrente" — a validação continua, só passou
   a ser relativa ao tipo resolvido.

### Edge Cases

- `dayTypeId` presente e **igual** ao do weekday: indistinguível de não enviar. Não é caso
  especial.
- Override para um tipo-de-dia **sem refeições**: mesmo 404 de hoje ("sem refeições para o dia
  corrente"), agora relativo ao tipo pedido.
- Registro numa `position` que **não existe** no tipo exibido: a refeição registrada
  simplesmente não está no roster; nada a excluir das alavancas. Não é erro.
- Cliente antigo (sem o campo): o campo é **opcional** — o comportamento é o de hoje.

## Requirements

### Functional Requirements

- **FR-001**: `POST /patients/:id/rebalance/option-choice` DEVE aceitar um `dayTypeId`
  **opcional** no corpo, com a mesma semântica que `POST /registro` já tem.
- **FR-002**: Quando presente, o `dayTypeId` DEVE ser validado como pertencente ao **plano
  ativo** do paciente; senão 404 com a mesma mensagem do `POST /registro`.
- **FR-003**: Quando ausente, a resolução DEVE ser a de hoje — `day_schedule` do weekday. O
  comportamento sem override não pode mudar em nada.
- **FR-004**: O roster de refeições (o dia que o motor considera) DEVE ser o do tipo-de-dia
  **resolvido**, seja override ou weekday.
- **FR-005**: A faixa-alvo do dia DEVE ser a do tipo-de-dia **resolvido** — o paciente é
  avaliado contra o cardápio que está vendo.
- **FR-006**: A validação do gatilho DEVE continuar existindo, relativa ao tipo resolvido.
- **FR-007**: O pareamento do consumo real com as refeições do dia CONTINUA por **`mealId`**.
  Não muda: com o roster correto, o `mealId` do evento casa naturalmente. É a consequência
  direta de escolher (a) em vez de (b).
- **FR-008**: A leitura do consumo real CONTINUA type-agnostic (paciente + plano + hoje) — não
  pode ser restringida ao tipo resolvido, senão a refeição comida noutro tipo desapareceria do
  total.
- **FR-009**: O app DEVE enviar o `dayTypeId` quando houver override ativo, e omiti-lo quando
  não houver.
- **FR-010**: A feature NÃO DEVE persistir nada de novo. O rebalanceamento segue **efêmero**
  (FR-026 da 002).
- **FR-011**: A feature NÃO DEVE alterar a matemática do motor (`packages/core`). É mudança de
  **que dia** o motor recebe, não de **como** ele calcula.
- **FR-012**: Sem migration.

## Success Criteria

- **SC-001**: Os 2 casos `KI-005` de `colisao-position.e2e-spec.ts` — que hoje asserem 404 —
  passam a asserir **200 + prévia**. É a única suíte cujas expectativas mudam, e mudam **de
  propósito**: eram caracterização de bug.
- **SC-002**: O caso `[BUG] registro na pos 1 do tipo B não muda NADA na prévia do tipo A`
  ganha um par novo, **com o gatilho em B**, que assere o oposto: o registro **muda** a prévia.
- **SC-003**: A baseline não-relacionada segue intacta: core 164 · db 20 · mobile 24, e as 11
  suítes e2e não tocadas com `git diff` vazio. `rebalance.e2e-spec.ts` — que exercita o caminho
  **sem** override — segue verde **sem uma expectativa alterada** (é a prova de FR-003).
- **SC-004**: Um `dayTypeId` de outro paciente/plano dá 404, não 200.
- **SC-005**: A prévia sob override não escreve nada: contagens de `meal_event` e
  `meal_event_item` idênticas antes e depois.
- **SC-006**: `packages/core` com `git diff` **vazio** (FR-011).
- **SC-007**: Nenhuma migration nova em `packages/db/drizzle/`.
- **SC-008**: `pnpm lint` + `pnpm format` limpos; `check-types` sem erro novo. OpenAPI
  regenerado.

## Assumptions

- **A1 — a faixa-alvo é a do tipo exibido.** Nenhum artefato (004, 009, 011) respondia "sob
  override, o dia é comparado contra qual alvo". A opção (a) **decide por construção**: o roster
  é do tipo resolvido, logo o alvo também. É coerente com a assinatura do produto — o paciente
  vê B, escolhe em B, é avaliado contra B.
- **A2 — RESÍDUO CONHECIDO, e é o preço de (a).** A opção (a) faz o motor seguir o **tipo
  exibido**. Então no caminho "registrei sob B → voltei para A pelo picker → escolho opção em
  A", o evento de B **continua invisível** ao motor, enquanto `/today?dayTypeId=A` mostra o badge
  na posição correspondente (009/FR-002, pareamento por posição). A divergência badge-vs-motor
  **sobrevive** nesse caminho. É coerente com FR-013a da 004 ("o tipo padrão nunca auto-ajusta")
  e com o `/today` sem override, que também ignora o evento de outro tipo — mas é resíduo, não
  solução, e fica registrado no KI-002 com o teste que o pina.
- **A3** — O app já sabe se há override: `HomeScreen` tem `dayTypeId` no estado e passa
  `overrideActive` adiante. Enviar o campo é propagação, não lógica nova.

## Fora (explicitamente)

- **Gatear os chips de opção no app.** Com o 404 morto, não há mais motivo para gatear — a
  prévia passa a funcionar. Remover gate que nunca existiu não é trabalho.
- **O resíduo do A2** — precisa de decisão sobre se o `/today` do tipo padrão deveria contar
  evento de outro tipo, o que contradiz FR-013a da 004. Fica em KI-002.
- **O descarte silencioso do relatório** sob colisão de `position` (KI-002 Sintoma B) — rota da
  nutri, outro caminho, ver [ADR-0002](../../docs/adr/0002-granularidade-divergente-nas-rotas-da-nutri.md).
- **Q3-B / fonte do fallback de plano** — ADR-0002.
- Qualquer mudança em `packages/core`.

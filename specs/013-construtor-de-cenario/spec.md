# Feature Specification: Construtor de cenário para as suítes e2e

**Feature Branch**: `013-construtor-de-cenario` (planejada e executada na `main`, padrão 006–012)
**Date**: 2026-07-26
**Origem**: candidato 04 da revisão de arquitetura de 2026-07-25 · [KI-004](../../docs/known-issues.md)
**Status**: implementada (2026-07-26)

## Por que existe

Não é feature de produto. É **infraestrutura de teste**, e o gatilho foi um incidente
concreto: em 2026-07-25 descobriu-se que a suíte e2e do `apps/api` **só passava de segunda a
sexta** — `126 passed | 6 skipped` num sábado — e ninguém sabia, porque o desenvolvimento
acontece em dia de semana ([KI-004](../../docs/known-issues.md)). A causa não foi azar: as
suítes dependem de detalhes do fixture de produção, e o calendário é um desses detalhes.

O padrão por trás do incidente, medido no repo:

- **6.420 linhas** de e2e em 13 arquivos, das quais uma fração grande é montagem de cenário.
  Os dois fixtures mais recentes, escritos à mão em 2026-07-25/26 — `escopo-plano` (558
  linhas) e `colisao-position` (506) — gastam **cerca de 250 linhas cada** só em
  `beforeAll` + `afterAll`, e são quase os mesmos 250.
- **10 pontos** resolvem o paciente com `select().from(patient).limit(1)` **sem `where` nem
  `order by`** — qualquer paciente-cenário sobrevivente de outra suíte pode ser sorteado.
- **5 arquivos** reimplementam a resolução do tipo-de-dia por `getDay()` — a mesma regra que
  o service sob teste implementa. O teste e o alvo compartilham o bug.
- Números do seed **hardcoded em asserção**: `rebalance.e2e-spec.ts:839` tem
  `const pisos = [20, 50, 42.5]`, que são 50% de gramaturas do seed. Mudar uma grama no seed
  quebra o teste, sem nenhuma referência entre os arquivos que explique por quê.
- A ordem reversa de FK no cleanup é reescrita a cada suíte nova. Errar a ordem não dá erro
  claro: dá violação de FK num `afterAll`, depois de o teste já ter passado.

O custo não é estético. É que **escrever o teste que faltava é caro**, e teste caro não é
escrito. Foi exatamente o que aconteceu com o eixo de dois tipos-de-dia: o
[ADR-0001](../../docs/adr/0001-chave-de-pareamento-sob-override.md) registrou em 2026-07-25
que a suíte era cega a ele, e o teste só existiu quando alguém pagou 250 linhas de fixture à
mão.

## User Scenarios & Testing

> O "usuário" aqui é quem escreve teste no repo — inclusive um agente. Os cenários são sobre
> a experiência de montar um cenário, não sobre o produto.

### User Story 1 — Declarar um cenário em vez de montá-lo (Priority: P0)

Quem escreve uma suíte nova declara o cenário que precisa e recebe os identificadores
resolvidos, sem escrever `insert` nenhum e sem saber a ordem de inserção.

**Por que P0**: é a razão de ser da feature. Sem isso, nada muda.

**Acceptance Scenarios**

1. **Given** uma suíte nova que precisa de um paciente com um plano de N refeições,
   **When** ela declara esse cenário, **Then** recebe os ids de tudo que foi criado, indexados
   de forma estável (por posição de refeição, por nome de tipo-de-dia), sem precisar
   correlacionar arrays de retorno na mão.
2. **Given** um cenário com dois tipos-de-dia cujas refeições ocupam a **mesma posição**,
   **When** a suíte o declara, **Then** ele é montado corretamente — é o cenário que a suíte
   nunca conseguiu montar barato, e o que o ADR-0001 exige.
3. **Given** um cenário declarado, **When** o teste termina — **inclusive falhando** —
   **Then** tudo que foi criado é removido, na ordem correta de FK, sem a suíte declarar essa
   ordem.

### User Story 2 — Cenário independente do calendário por construção (Priority: P0)

O cenário não pode passar ou falhar em função do dia da semana em que roda.

**Por que P0**: é o incidente que originou a feature. Se o construtor permitir a mesma
armadilha, ele não resolveu nada.

**Acceptance Scenarios**

1. **Given** um cenário que precisa de um tipo-de-dia programado "hoje", **When** ele é
   declarado, **Then** a programação cobre o dia corrente qualquer que ele seja, sem a suíte
   calcular `getDay()`.
2. **Given** a suíte roda num sábado e num quarta-feira, **When** o mesmo cenário é
   declarado, **Then** os identificadores e a forma do cenário são equivalentes.

### User Story 3 — O seed de produção deixa de ser um segundo dialeto (Priority: P1)

O `seed.ts` — que existe para provar a tese sem a UI da nutri — passa a ser **um chamador** do
construtor, não uma implementação paralela da mesma montagem.

**Por que P1**: é o que impede as duas montagens de divergirem de novo. Mas é entrega
separável: o construtor tem valor antes disso.

**Acceptance Scenarios**

1. **Given** o `seed.ts` reescrito sobre o construtor, **When** ele roda, **Then** o banco
   semeado é equivalente ao de antes para efeito das suítes que dependem dele — nenhuma
   expectativa existente muda.

### Edge Cases

- Cenário declarado com duas refeições na mesma posição **no mesmo tipo-de-dia**: é
  degenerado; o construtor deve permitir (é dado válido no schema) sem tratar como especial.
- Duas suítes rodando o mesmo cenário no mesmo banco: os identificadores criados devem ser
  distintos e o cleanup de uma não pode alcançar o da outra.
- Cleanup quando a montagem falhou **no meio**: o que já foi criado deve ser removido.
- Cenário que depende de `food` da base TACO: o construtor não pode assumir alimento por
  **nome** (foi a causa raiz do KI-004).

## Requirements

### Functional Requirements

- **FR-001**: O sistema DEVE oferecer uma forma de declarar um cenário de banco e recebê-lo
  materializado, com os identificadores criados acessíveis por chave estável.
- **FR-002**: O chamador NÃO DEVE precisar conhecer a ordem de inserção nem as dependências de
  chave estrangeira do schema.
- **FR-003**: O chamador NÃO DEVE precisar conhecer a ordem reversa de remoção. A remoção DEVE
  acontecer mesmo quando o teste falha.
- **FR-004**: A remoção DEVE alcançar **exatamente** o que aquele cenário criou, e nada mais —
  nunca o paciente do seed, nunca dado de outra suíte.
- **FR-005**: O sistema DEVE permitir declarar que um tipo-de-dia está programado no dia
  corrente **sem** o chamador resolver o dia da semana.
- **FR-006**: O sistema DEVE permitir declarar dois ou mais tipos-de-dia com refeições em
  posições coincidentes.
- **FR-007**: O sistema NÃO DEVE resolver alimentos por nome. A seleção de `food` DEVE ser por
  critério estrutural (existência, propriedade nutricional mínima) ou por identificador
  explícito.
- **FR-008**: O construtor DEVE viver em `packages/db` — faz I/O, logo não pode morar no
  núcleo puro (Princípio III).
- **FR-009**: A feature NÃO DEVE alterar nenhuma expectativa de teste existente, nem o
  comportamento de nenhum endpoint. É mudança de forma nas suítes, não de conteúdo.
- **FR-010**: O `seed.ts` DEVE poder ser expresso como chamador do construtor sem que o banco
  resultante mude de forma observável para as suítes que dependem dele.
- **FR-011**: O construtor NÃO DEVE ganhar capacidade que nenhum call site real pede
  (Princípio VI / YAGNI). Cada campo do que se pode declarar DEVE ter pelo menos um chamador
  hoje.

### Key Entities

Nenhuma entidade nova, nenhuma migration. O construtor só compõe as tabelas que já existem:
`nutritionist`, `patient`, `plan`, `day_type`, `day_schedule`, `meal`, `meal_option`,
`meal_item`, `cycle`, `cycle_plan_vigencia`, `meal_event`, `meal_event_item`.

## Success Criteria

- **SC-001**: A baseline segue verde e **intacta**: core 164 · `apps/api` 147 · mobile 24, sem
  uma única expectativa alterada. Qualquer expectativa que precise mudar é bug.
- **SC-002**: As duas suítes migradas perdem, somadas, pelo menos **300 linhas** de fixture, e
  seus casos de teste continuam idênticos.
- **SC-003**: Uma suíte migrada não contém nenhum `insert` direto de schema, nenhuma ordem de
  `delete`, e nenhuma chamada a `getDay()`.
- **SC-004**: Rodar a suíte migrada com a data do sistema num sábado e num dia de semana
  produz o mesmo resultado. (Verificável sem mexer no relógio: o cenário não lê o dia da
  semana em ponto nenhum — SC-003 já cobre.)
- **SC-005**: Existe teste do próprio construtor que falha se o cleanup deixar resíduo — a
  contagem de linhas das tabelas envolvidas volta ao valor de antes.
- **SC-006**: `git diff` vazio nos `*.e2e-spec.ts` **não** migrados.
- **SC-007**: Saldo de linhas negativo no conjunto `apps/api/test` + `packages/db`.
- **SC-008**: `pnpm lint` e `pnpm format` limpos; `check-types` sem erro novo.

## Assumptions

- **A1** — **Escopo de migração deliberadamente estreito.** Migrar as 13 suítes de uma vez é
  caro e arriscado: várias têm expectativas calibradas em detalhes do seed (o
  `pisos = [20, 50, 42.5]` do `rebalance.e2e-spec.ts:839` é o exemplo caro). Migram **agora**
  só as duas mais novas — `escopo-plano` e `colisao-position` — que foram escritas à mão, não
  dependem do seed e servem de **prova** do construtor. As outras migram oportunistamente,
  quando alguém já for mexer nelas. Isto é decisão de risco, não preguiça: a baseline de 147
  verdes é o ativo a preservar.
- **A2** — O `seed.ts` como chamador (US3) entra **se e somente se** couber sem mudar o banco
  de forma observável. Se mudar, sai desta feature e vira item próprio.
- **A3** — O construtor é para **teste e seed**, não para produção. Não vai ao runtime da API.

## Fora (explicitamente)

- **Migrar as 13 suítes pré-existentes** — ver A1.
- **Consertar os acoplamentos ao seed que sobram** (gramas hardcoded, nomes de alimento nas
  suítes não migradas). O construtor torna o conserto barato; o conserto em si é outro item.
- **KI-001** (flakiness do `pool.end()` compartilhado) — causa distinta, escopo separado.
- **KI-002 / KI-005** — dependem de decisão de produto, não de infraestrutura de teste.
- Qualquer coisa em `apps/mobile` ou `packages/core`.

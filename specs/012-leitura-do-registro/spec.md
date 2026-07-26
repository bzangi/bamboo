# Feature Specification: Leitura do registro — um leitor de `meal_event`

**Feature Branch**: `012-leitura-do-registro` (planejada e executada na `main` — padrão 006–011)

**Created**: 2026-07-25

**Status**: Draft — spec e plan derivados do grilling de arquitetura (2026-07-25); gate único no `tasks.md`.
Todas as referências `file:line` deste diretório foram verificadas contra o código por 3
verificadores independentes; as correções estão aplicadas.

**Input**: revisão de arquitetura (`/improve-codebase-architecture`) → candidato 01
"colapsar os leitores do consumo num module só" → grilling completo com 7 decisões
ratificadas pelo Bruno.

## Contexto

Não é feature de produto: é **deepening**. O comportamento observável não muda em nenhuma
rota — esse é o critério de sucesso, não um efeito colateral.

Hoje o mesmo conceito de domínio — **registro vigente numa janela** — tem **5**
implementations na casca: os 4 leitores dedicados (`registro-consumo.ts`,
`adesao/adesao-consumo.ts`, `relatorio/relatorio.loader.ts:84-146`,
`ciclo/ciclo.service.ts:359-413`) **mais a query inline de `plan/plan.service.ts:131-160`**,
que é a única sem `ORDER BY` e a única sem `INNER JOIN meal`. O **consumo real** que empilha
sobre ele tem 2 implementations, com **59 linhas byte-a-byte idênticas** entre elas.
Contando o caminho de escrita, a redução "eventos → vigente" está reescrita em **7** lugares,
com **duas convenções de `seq`** incompatíveis.

Consequência medida: ~2.700 linhas nos leitores e serviços de montagem, **nenhuma** com teste
unitário — a casca tem 13 casos unitários (`plan/today.mapper.unit.test.ts` 4,
`observability/http-error-mapping.unit.test.ts` 9) e nenhum deles toca os 5 leitores de
`meal_event`. Do outro lado, 1.489 linhas de núcleo puro têm 157 casos. O leverage foi
aplicado nas fórmulas — a parte fácil. A montagem, onde os bugs moram, ficou sem seam.

Esta feature dá **uma casa** para os dois conceitos, corrige um bug latente de ordenação, e
torna o **escopo de plano** — hoje uma divergência silenciosa entre rotas — explícito e
obrigatório em cada call site.

## Por que agora

O `GET /report` (011) fechou o EP-5 compondo peças prontas, e a composição expôs o custo:
ele lê o range de `meal_event` **três** vezes por ciclo (seis com comparativo), uma delas
integralmente descartada. A próxima fase (EP-6, web da nutri) vai adicionar consumidores dessa
leitura. Cada consumidor novo hoje custa uma cópia.

## Escopo

### Dentro

1. Um module de **registro vigente**: o único leitor de `meal_event` no caminho de leitura.
2. Um module de **consumo real** empilhado sobre ele, que **não** re-consulta `meal_event`.
3. `eventoVigente` no núcleo: a redução devolve a **linha** vencedora, não só o estado.
4. **Escopo de plano** como parâmetro obrigatório (union discriminada, sem default).
5. `janela` do ciclo sem `registros` — corta a leitura descartada do relatório.
6. Três testes que a suíte hoje não tem, e que tornam dois eixos cegos observáveis.

### Fora (explicitamente)

- **Q3-B / tipo-de-dia alvo** e a fonte do plano no fallback (`ativo hoje` vs `vigente no
dia`). São duas implementations divergentes hoje; unificá-las muda número que a nutri já
  viu. Fica para o candidato 05 da revisão.
- **`mealId` vs `position`** como chave de pareamento sob override — ver
  [ADR-0001](../../docs/adr/0001-chave-de-pareamento-sob-override.md) e KI-002.
- **`MAX_DIAS` e os códigos HTTP** divergentes (400 na adesão, 422 no relatório, nenhum no
  ciclo). Cada rota mantém o seu.
- **Grid de refeições esperadas / dia vazio** — pergunta diferente ("o que deveria ter
  acontecido"), continua no `relatorio.loader`.
- **Snapshot transacional da leitura** — pré-existente e inalterado (KI-003).
- **O determinismo do caminho de escrita** — `registro.service.ts:192` ordena por `created_at`
  sem `, id` e continua arbitrário no empate. FR-001 exclui o caminho de escrita.
- **Renomear `MealRow.estadoVigente`** — o campo homônimo do `today.mapper` fica como está.
- Qualquer mudança em `apps/mobile` ou no núcleo além de `eventoVigente`.

## User Scenarios & Testing _(mandatory)_

Consumidor desta feature é o **próprio código**. As histórias são escritas do ponto de vista
de quem mantém e de quem depende do comportamento.

### User Story 1 — Um leitor de `meal_event` (Priority: P1) 🎯

Como quem mantém a casca, quero que "quais refeições o paciente registrou nesta janela, e
qual o estado vigente de cada uma" tenha **um** endereço, para que corrigir a regra seja uma
edição e não sete.

**Independent Test**: os 5 consumidores passam a chamar o mesmo module; `registro-consumo.ts`
e `adesao-consumo.ts` deixam de existir; as suítes existentes seguem verdes sem alteração de
expectativa.

**Acceptance**

- Quando um consumidor precisa do registro vigente de uma janela, o sistema deve devolvê-lo
  por uma única interface, ordenado deterministicamente e preservando `mealId`.
- Quando o evento vencedor de uma `(dia, refeição)` é um tombstone, o sistema deve omitir
  aquela refeição do resultado.
- Quando dois eventos da mesma `(dia, refeição)` têm `created_at` idêntico, o sistema deve
  escolher um vencedor **determinístico** (o de maior `id`, dado `ORDER BY logged_date,
created_at, id`), e o estado e os metadados devem vir do **mesmo** evento.

### User Story 2 — O escopo de plano deixa de ser silencioso (Priority: P1)

Como nutri, quero que a regra de "eventos de qual plano contam" seja a mesma amanhã e depois
de qualquer refactor, para que o número que eu vi não mude sem alguém decidir que muda.

**Independent Test**: um paciente com plano aposentado e evento nele; a adesão ignora, as
rotas do ciclo contam — e existe teste afirmando isso **onde as duas convenções produzem
números diferentes**.

**Acceptance**

- Quando um consumidor lê uma janela, o sistema deve **exigir** que ele declare o escopo de
  plano; não deve existir comportamento por omissão.
- Quando o paciente tem um evento num plano aposentado dentro da janela,
  `GET /nutri/patients/:id/adesao` deve ignorá-lo e `GET /nutri/.../cycles/:id` deve contá-lo
  — preservando exatamente o comportamento de hoje.
- Quando o paciente consulta `/today?dayTypeId=` sob override, o consumo lido é type-agnostic
  e projetado por `position`: um evento de plano aposentado não deve aparecer como registro
  nem retirar a alavanca daquela posição.

> **Por que a asserção é na adesão e no `/today?dayTypeId=`, e não no `/today` simples.**
> `plan.service.ts:143` filtra `inArray(mealEvent.mealId, mealIds)` do plano ativo, e como
> `meal → day_type → plan` uma refeição nunca é compartilhada entre planos: o evento do plano
> aposentado é excluído pelo filtro de `mealId` **mesmo sem** o de `planId`. Idem no
> rebalanceamento, que lê o consumo por `porMeal.get(m.id)` (`rebalance.service.ts:294`).
> Os dois únicos lugares onde as convenções divergem observavelmente são
> `adesao-consumo.ts:69-76` (plan-scoped, **sem** filtro de `mealId`) e o caminho por
> `position` de `plan.service.ts:338-348`.

### User Story 3 — Consumo real empilhado (Priority: P2)

Como quem mantém, quero que o cálculo do consumo real (nutrientes de feito/troquei/pulei)
seja um module que **recebe** o registro vigente em vez de ir buscá-lo, para que a regra de
"o que conta como consumido" viva em um lugar e a leitura de `meal_event` em outro.

**Independent Test**: o module de consumo real não contém nenhuma query a `meal_event`
(`meal_event_item` é legítimo — é o snapshot do troquei); os 3 consumidores que precisam de
nutrientes recebem os mesmos valores de hoje.

**Acceptance**

- Quando uma refeição vigente é `pulei`, o sistema não deve atribuir nenhum item a ela — mas
  ela **deve continuar presente** no resultado, com lista de itens vazia.
- Quando é `feito`, deve contar os itens da opção cumprida.
- Quando é `troquei`, deve contar o snapshot de `meal_event_item`.
- Quando a opção cumprida não está gravada no evento, deve aplicar o fallback existente
  (a default; senão a primeira por ordem determinística de id) — sem mudança.

### Edge cases

- **Janela de um dia**: `from === to`. É o caso que hoje é uma função separada.
- **Janela vazia** (nenhum evento): resultado vazio. O caminho do paciente deve continuar
  distinguindo "vazio" de "não consultado" — ver FR-013.
- **Evento de ontem** no mesmo paciente e plano: não deve influenciar a leitura de hoje.
- **Colisão de `position`** entre tipos-de-dia no mesmo dia: preservada como está. A ordem de
  saída não deve mudar quem "ganha" a posição — ver FR-003 e ADR-0001.
- **Refeição registrada sob override**: preservada como está — ver ADR-0001.
- **Evento órfão de `meal`**: inalcançável. A FK é `ON DELETE no action`
  (`packages/db/migrations/0002_clear_cammi.sql:23`), então apagar um `meal` com eventos
  falha. O `INNER JOIN meal` dos leitores é redundante como guarda — existe para trazer
  `position` e `name`.

## Requirements _(mandatory)_

- **FR-001** O sistema DEVE ter exatamente um leitor de `meal_event` no caminho de leitura.
  O caminho de **escrita** (`registro.service`) mantém as suas próprias leituras, sua própria
  convenção de `seq` e seu próprio (não-)determinismo em empate.
- **FR-002** O leitor DEVE exigir escopo de plano como parâmetro; não DEVE haver default.
- **FR-003** O leitor DEVE devolver uma ordem total determinística e DEVE preservar `mealId`.
  A ordem de saída DEVE ser a de **primeira aparição** de cada `(dia, refeição)` na query
  ordenada — a mesma que o agrupamento produz hoje — e NÃO DEVE ordenar nem agrupar por
  `position`.
- **FR-004** A redução ao evento vigente DEVE viver no núcleo, ser pura, e devolver a linha
  vencedora — não apenas o estado.
- **FR-005** A ordem usada na redução DEVE ser total de verdade: NÃO DEVE depender de
  `Date.getTime()`, que trunca em milissegundo a resolução de microssegundo do Postgres.
- **FR-006** O module de consumo real NÃO DEVE consultar `meal_event`; DEVE receber o
  registro vigente já carregado. Consultar `meal_event_item` é permitido e necessário.
- **FR-007** O module de consumo real NÃO DEVE devolver o agregado nutricional do dia; a soma
  fica no call site que precisar dela (evita um campo que pode ser lido como "não comeu nada").
- **FR-008** Nenhuma resposta HTTP DEVE mudar: nem forma, nem valor, nem código de status.
- **FR-009** Nenhuma migration. Nenhuma escrita nova. Nenhuma mudança em `apps/mobile`.
- **FR-010** `estadoVigente` DEVE continuar existindo e DEVE manter comportamento
  bit-a-bit, servindo o caminho de escrita. O desempate DEVE continuar mantendo o **primeiro**
  elemento em empate (`>`, nunca `>=`).
- **FR-011** A leitura descartada do relatório DEVE ser eliminada: obter a janela de um ciclo
  NÃO DEVE exigir carregar os registros dele. A `janela` DEVE preservar os dois 404 que
  `detalhe` hoje produz (paciente inexistente; ciclo que não é do paciente).
- **FR-012** DEVEM existir testes que tornem observáveis os dois eixos hoje cegos: escopo de
  plano e empate de ordenação.
- **FR-013** O caminho do paciente DEVE preservar a distinção entre "sem registro hoje" e
  "registro vazio": `plan.service.ts:333` retorna `{}` quando não há consumo, e o mapper usa
  a **ausência** do mapa de posições para escolher o ramo por `mealId`
  (`today.mapper.ts:203-205`). Passar um mapa vazio no lugar de ausente apagaria todos os
  badges do dia.

## Success Criteria _(mandatory)_

- **SC-001** Zero mudança de comportamento: as 157 do core, as 132 do `apps/api`
  (119 e2e + 13 unit colocados) e as 24 do mobile seguem verdes **sem uma única expectativa
  alterada** — `git diff` nos `*.e2e-spec.ts` existentes deve ser vazio, inclusive nos
  comentários que citam os arquivos apagados. Qualquer expectativa que precise mudar é bug.
- **SC-002** `grep -rn 'schema\.mealEvent\b' apps/api/src` retorna apenas o leitor novo e
  `registro/registro.service.ts`. Ocorrências de `schema.mealEventItem` no module de consumo
  real são esperadas e legítimas (FR-006).
- **SC-003** `grep -rn 'estadoVigente(' apps/api/src` — a **chamada** ao núcleo — retorna
  apenas `registro/registro.service.ts` (`:197`, `:461`). O campo homônimo
  `MealRow.estadoVigente` (`plan/today.mapper.ts:73`, `:205`, `:252`, `plan.service.ts:243`,
  `plan/today.mapper.unit.test.ts:43`, `:50`) permanece — está fora de escopo.
- **SC-004** `registro-consumo.ts` e `adesao/adesao-consumo.ts` não existem mais.
- **SC-005** `GET /today?dayTypeId=` lê `meal_event` **uma** vez (hoje: duas).
- **SC-006** `GET /nutri/.../cycles/:id/report` passa de **três** para **duas** leituras de
  range de `meal_event` por ciclo consultado (seis para quatro com comparativo): morre a
  leitura descartada de `detalhe`. As duas que ficam **não** podem virar uma: os escopos de
  plano divergem por decisão (A2/D2).
- **SC-007** Existe teste que falha se alguém unificar o escopo de plano numa convenção só —
  e a asserção discriminante está num consumidor onde as duas convenções produzem números
  diferentes (ver a nota da US2).
- **SC-008** Existe teste que falha se o empate de ordenação voltar a ser não-determinístico,
  no caminho de **leitura**.
- **SC-009** Saldo de linhas negativo em `apps/api/src`, com no máximo +1 export no núcleo.
- **SC-010** `pnpm lint` e `pnpm format` limpos; `check-types` sem erro novo.

## Assumptions

- **A1** As quatro convenções atuais de chave de pareamento estão **corretas até prova em
  contrário** (ADR-0001). Esta feature as preserva, não as julga.
- **A2** As duas convenções de escopo de plano são **intencionais** e continuam divergentes.
  Esta feature as torna explícitas, não iguais.
- **A3** `created_at` vem de `DEFAULT now()` (`packages/db/migrations/0002_clear_cammi.sql:11`)
  e o INSERT não passa valor (`registro.service.ts:366-376`), então é
  `transaction_timestamp()` — **fixado no início da transação, antes** do
  `pg_advisory_xact_lock` (`:102-104`). O lock serializa o INSERT, **não** o timestamp: duas
  transações concorrentes podem ter o mesmo `now()`, e a que espera o lock pode inserir depois
  com `created_at` **anterior**. Logo empate é possível e inversão relativa à ordem de
  inserção também. O comportamento atual em empate é **arbitrário** (ordem que o Postgres
  devolve), portanto não caracterizável: o teste só pode afirmar o comportamento novo.

# CONTEXT — modelo de domínio do Bamboo

Vocabulário ubíquo do produto. Um termo aqui significa **uma** coisa no código, na spec e
na conversa. Se um nome novo aparece num módulo, ele entra aqui.

Convenção herdada: o domínio é falado em **português** (`adesao`, `ciclo`, `refeicao`,
`vigente`) porque é a linguagem da nutricionista; identificadores novos de infraestrutura
vão em inglês. A base da Fase 0/1 está em PT — dívida conhecida, não se propaga.

Termos de arquitetura (**module**, **interface**, **seam**, **deep/shallow**, **adapter**,
**leverage**, **locality**) são deliberadamente em inglês e vivem no skill
`codebase-design`, não aqui. Aqui é só domínio.

---

## Plano e cardápio

**Plano** — o conjunto que a nutri entrega ao paciente. Não é um cardápio fixo: é um
conjunto de **tipos-de-dia**. Pertence direto ao paciente no v0; o **ciclo** é que versiona
planos ao longo do tempo. `plan` em `packages/db/src/schema.ts`.

**Tipo-de-dia** — "treino pesado", "leve", "descanso". Um plano tem vários. Qual vale hoje
sai da **programação default** (`day_schedule`, por dia da semana), e o paciente pode
**sobrescrever** no app. `day_type`.

**Override de tipo-de-dia** — o paciente troca, na sessão, o tipo-de-dia que o app está
mostrando. Não materializa nada: o dia-calendário não guarda "qual tipo o paciente seguiu".
O único lugar onde o tipo escolhido persiste é o **snapshot** de um evento de registro.

**Refeição (slot)** — "Almoço", com `position` no dia. A `position` é o que pareia refeições
entre tipos-de-dia diferentes. `meal`.

**Opção** — os "3 almoços". Os itens penduram na **opção**, não na refeição — é o que
permite opções desiguais, e escolher uma é o que dispara **rebalanceamento**. Uma é a
**default**. `meal_option`.

**Item** — alimento + quantidade + marcação de flexibilidade dentro de uma opção.
`is_locked` = travado, não troca. Flexível troca dentro do **grupo de substituição** que ele
aponta. `meal_item`.

## Substituição

**Grupo de substituição** — o conjunto de alimentos intercambiáveis (sistema exchange).
`substitution_group`.

**Nutriente-base** (`equivalence_basis`) — o nutriente que a troca **preserva** dentro do
grupo: carbo por carbo, proteína por proteína. É o que faz a conta de substituição existir.

**Porção de referência** — a "1 troca" daquele alimento dentro do grupo
(`reference_portion_grams`). Trocar = reescalar a quantidade preservando o nutriente-base.

**Medida caseira** — a tradução de gramas para a linguagem do paciente ("2 colheres de
sopa"). `food_household_measure`.

**Combinação** — cumprir um item com dois alimentos do mesmo grupo, dividindo a base
(arroz + batata no lugar de só arroz).

## Registro

**Registro** — a marcação de uma refeição num dia: **feito**, **troquei** ou **pulei**.
Exatamente 3 estados. É **pendurado na consulta**, nunca formulário separado.

**Evento de registro** — a linha append-only. Toda transição (correção, desfazer) é um
INSERT; nada é mutado. `meal_event`.

**Tombstone** — evento com `state = NULL`: a anulação (o desfazer). Se for o evento
vencedor, a refeição volta a ser **não-registrada**.

**Registro vigente** — o estado que vale para um `(paciente, refeição, dia)`: o do evento
de maior ordem, com tombstone anulando. É **derivado**, nunca armazenado. A ordem é total e
explícita — `(logged_date, created_at, id)`; o `id` é o desempate, porque `created_at` pode
empatar (é o `transaction_timestamp()`, tomado antes do lock do INSERT).
Núcleo: `eventoVigente` (devolve a **linha** vencedora) e `estadoVigente` (só o estado,
expressa em cima dela) em `packages/core/src/registro.ts`.
Casca: **um leitor só** — `apps/api/src/registro-vigente.loader.ts`, o único lugar do
caminho de leitura que toca `meal_event`. O caminho de **escrita**
(`registro/registro.service.ts`) é separado de propósito e segue com ordem própria.

**Consumo real** — o que o paciente **efetivamente** comeu, com nutrientes: `pulei` não
contribui nada (mas **continua presente** no resultado, com zero itens — filtrar reintroduz
double-count), `feito` conta os itens da opção cumprida, `troquei` conta o **snapshot**
gravado em `meal_event_item`. Em `apps/api/src/consumo-real.loader.ts`, que **empilha** sobre
o registro vigente: recebe os vigentes e nunca consulta `meal_event`.

**Escopo de plano** — de qual plano os eventos contam ao ler uma janela. Duas convenções
legítimas e **divergentes** no produto: o caminho do paciente (`/today`, rebalanceamento) e
a adesão contam só do plano em questão; o relatório e o ciclo contam de qualquer plano.
A escolha é **explícita e obrigatória**: `EscopoPlano` (`{kind:'plano',planId}` |
`{kind:'qualquer-plano'}`) em `registro-vigente.loader.ts`, sem default — cada call site
declara qual quer, e o `tsc` cobra a declaração. Antes da 012 era implícita, hardcoded por
leitor, e nenhum teste cobria o eixo.

**Adequação** — o que transforma um `feito` em `troquei`: opção não-default, substituição ou
combinação. **Derivada no servidor** — o cliente nunca envia `troquei`.

**Snapshot do tipo-de-dia** — o `day_type_id` gravado no evento: qual tipo-de-dia estava em
vigor quando o paciente registrou. É a única memória de um override.

## Motor

**Rebalanceamento** — recalcular as refeições **restantes** do dia quando algo desequilibra
(opção desigual, troca de tipo-de-dia). Efêmero: nada persiste. Refeição já registrada sai
das **alavancas** e entra no total pelo que foi consumido.

**Alavanca** — item que o motor pode mexer: flexível, de refeição ainda não registrada.

**Faixa-alvo** — o alvo é uma **faixa**, não um teto. Comer de menos também é fora de
adesão. `avaliarFaixa` em `packages/core/src/nutrition.ts`.

**Piso** — o mínimo inviolável de um item. Estourar o piso faz o motor **recusar com
orientação** em vez de barrar.

**Gatilho** — o ato que dispara o rebalanceamento (escolher uma opção, trocar o tipo-de-dia).

**Recusa orientada** — o motor não conseguiu e devolve uma frase de porquê, não um erro.
Assinatura do produto: _nunca barra_.

## Acompanhamento (só a nutri)

**Adesão** — quanto o dia ficou dentro da faixa-alvo, contínuo e saturado na faixa de kcal,
com flags por macro. **Instrumento clínico da nutri; o paciente nunca vê.**
`packages/core/src/adesao.ts`.

**Cobertura** — quanto do dia tem dado para julgar. Cobertura zero ⇒ dia **sem-dado**, que
nunca dilui a média.

**Tipo-de-dia alvo** — contra qual tipo-de-dia a adesão de um dia é medida: o snapshot dos
registros se todos concordam; senão o `day_schedule` do weekday. Hoje a regra tem **duas
implementations** com fontes de plano diferentes (`adesao.service.ts` usa o plano ativo hoje;
`relatorio.loader.ts` usa o vigente naquele dia) — divergência conhecida, ver o candidato 05
da revisão de arquitetura.

**Ciclo** — o intervalo de acompanhamento entre consultas. Objeto de 1ª classe, no máximo 1
aberto por paciente (garantido por índice parcial). Invisível ao paciente. `cycle`.

**Vigência** — a linha do tempo de "qual plano vigia quando" **dentro** de um ciclo. O ciclo
**observa**, não manda: registra as ativações. `cycle_plan_vigencia`.

**Janela efetiva** — o intervalo real de um ciclo: `startedOn` até `closedOn ?? hoje`. Ciclo
aberto rende relatório **parcial válido**, não erro.

**Relatório de ciclo** — o retrato de como o plano sobreviveu à vida real. Composição de
peças prontas: adesão + padrão de registro + evolução semanal + comparativo.

## Transversais

**Gate de exposição** — quanto número o paciente vê (`hidden` / `percent` / `macros` /
`full_kcal`), controlado pela nutri. Política de produto, não de apresentação.

**O agora** — a refeição do momento na home: a primeira não-registrada por `position`. O
paciente não caça, não navega. `derivarOAgora` em `packages/core/src/registro.ts`.

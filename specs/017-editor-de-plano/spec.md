# Feature Specification: A nutri monta o plano alimentar pela tela

**Feature Branch**: `017-editor-de-plano` (planejada e executada na `main`, padrão 006–016)
**Date**: 2026-07-26
**Origem**: goal do dono — "avalie os endpoints existentes do lado do nutricionista; a tarefa só
termina quando o nutricionista conseguir em tela cadastrar seus pacientes e seu plano alimentar.
CRUD completo pra todas entidades."
**Status**: implementada e testada (2026-07-27), incluindo smoke ao vivo pela tela sem JavaScript

## Por que existe

A avaliação dos endpoints da nutri encontrou **10 rotas `/nutri/*` e nenhuma que crie um plano**.
O lado de leitura está completo (roster 015, adesão 006, ciclo 007, relatório 011); o de escrita
tem exatamente três atos: criar paciente (016), abrir/fechar ciclo (007) e **ativar um plano que
já precisa existir** (007).

Um plano só passa a existir rodando `packages/db/scripts/seed.ts` — script destrutivo, com o grafo
hard-coded. Consequência prática: **a nutri não é usuária do produto**, é uma linha no seed. E a
`016` deixou isso explícito ao criar pacientes que nascem e permanecem sem plano — um paciente sem
plano faz o app do paciente não ter o que mostrar.

Isto fecha a lacuna: as **7 tabelas do grafo do plano** ganham escrita, e a nutri monta o plano
inteiro pela tela.

### O que NÃO muda (e é o critério de não-regressão)

A tese central é sobre **adaptar** o plano, não sobre editá-lo — o editor é commodity
(`CLAUDE.md`, "Não competir na commodity"). Então este editor é deliberadamente **cru**: formulário
por nó, sem drag-and-drop, sem duplicar dia, sem biblioteca de templates. Ele existe para que o
diferencial (autonomia + rebalanceamento + ciclo) tenha em que rodar.

`packages/core` **não é tocado por esta feature**: nenhuma régua nova, nenhuma matemática nova.
Nenhum endpoint existente muda de forma, valor ou status. (A **019**, que veio depois, criou
`core/fuzzy.ts` e passou a ordenar o `GET /nutri/foods` daqui por relevância — ver FR-003.)

## User Scenarios & Testing

### User Story 1 — CRUD de paciente completo (Priority: P0)

A nutri corrige um nome digitado errado, completa a ficha (contato, peso, altura), ajusta o nível
de exposição de número e remove um paciente que nunca deveria ter sido criado.

**Teste de aceitação**

1. **Quando** a nutri altera o nome de um paciente, o sistema **deve** persistir e devolver o
   paciente na mesma forma do item da listagem.
2. **Quando** a nutri envia só um dos campos, o sistema **deve** alterar apenas aquele campo e
   preservar os outros (patch parcial, não substituição).
3. **Quando** a nutri envia `email`/`phone`/`heightCm`/`weightKg` como `null`, o sistema **deve**
   limpar o campo — apagar dado de saúde é um direito, não um erro (LGPD).
4. **Quando** `exposure` não é um dos quatro valores do enum, o sistema **deve** recusar com 400.
5. **Quando** `heightCm`/`weightKg` vêm negativos, zero ou não-numéricos, o sistema **deve**
   recusar com 400.
6. **Quando** a nutri exclui um paciente **sem** plano e **sem** registro, o sistema **deve**
   apagá-lo e tudo que pende dele.
7. **Quando** a nutri exclui um paciente **com** registro de refeição (`meal_event`), o sistema
   **deve** recusar com 409 e explicar — histórico de saúde não desaparece por clique.
8. **Quando** o `patientId` não existe, o sistema **deve** responder 404.

### User Story 2 — Criar e versionar o plano (Priority: P0)

A nutri cria "Plano de julho" para um paciente, e mais tarde cria "Plano de agosto" — o antigo
continua existindo, porque é ele que explica os registros já feitos.

**Teste de aceitação**

1. **Quando** a nutri cria um plano com nome válido, o sistema **deve** criar **apenas** a linha de
   `plan` — sem tipo-de-dia, sem refeição, sem programação de semana. Plano nasce **vazio**.
2. **Quando** o paciente ainda não tem plano nenhum, o primeiro plano criado **deve** nascer ativo.
3. **Quando** o paciente já tem plano ativo, um plano novo **deve** nascer inativo — trocar o ativo
   é o ato que o ciclo observa (007), e não pode acontecer como efeito colateral de um cadastro.
4. **Quando** a nutri lê o plano, o sistema **deve** devolver **o grafo inteiro** numa resposta:
   tipos-de-dia, programação da semana, refeições ordenadas por posição, opções de cada refeição e
   itens de cada opção com nome do alimento, gramas, trava e grupo.
5. **Quando** a nutri renomeia o plano, o sistema **deve** persistir o nome novo.
6. **Quando** a nutri exclui um plano **sem** registro e **sem** vigência de ciclo, o sistema
   **deve** apagar o plano e todo o grafo abaixo dele.
7. **Quando** a nutri exclui um plano que tem `meal_event` ou vigência em ciclo, o sistema **deve**
   recusar com 409.
8. **Quando** a nutri exclui o **único plano ativo** de um paciente que tem ciclo aberto, o sistema
   **deve** recusar com 409 — o ciclo aberto pressupõe plano vigente.

### User Story 3 — Montar o grafo do dia (Priority: P0)

A nutri cria os tipos-de-dia ("Treino", "Descanso"), diz que dia da semana é qual, e dentro de cada
tipo-de-dia cria as refeições, as opções de cada refeição e os itens de cada opção.

**Teste de aceitação**

1. **Quando** a nutri cria um tipo-de-dia num plano, o sistema **deve** criá-lo vazio.
2. **Quando** a nutri define a programação da semana, o sistema **deve** aceitar os 7 dias de uma
   vez e substituir a programação anterior — a semana é um objeto só, não 7 linhas independentes.
3. **Quando** a programação aponta para um tipo-de-dia de **outro** plano, o sistema **deve**
   recusar com 422.
4. **Quando** a programação não cobre os 7 dias, ou repete um dia, o sistema **deve** recusar
   com 400.
5. **Quando** a nutri cria uma refeição, o sistema **deve** exigir nome e posição, e aceitar
   horário opcional.
6. **Quando** a posição já existe naquele tipo-de-dia, o sistema **deve** recusar com 409 —
   posição é a chave de pareamento entre tipos-de-dia (009/012), duplicá-la corrompe a troca de
   tipo-de-dia.
7. **Quando** a nutri cria uma opção marcada como default, o sistema **deve** desmarcar as outras
   opções daquela refeição — exatamente uma default por refeição.
8. **Quando** a nutri exclui a **única** opção de uma refeição, o sistema **deve** recusar com
   409: refeição sem opção não tem o que mostrar no app.
9. **Quando** a nutri exclui a opção **default** havendo outras, o sistema **deve** promover outra
   a default no mesmo ato — nunca deixa a refeição sem default.
10. **Quando** a nutri adiciona um item, o sistema **deve** exigir alimento e gramas > 0, e aceitar
    a marcação de flexibilidade (travado, ou grupo de substituição).
11. **Quando** o item aponta para um grupo do qual o alimento **não** participa, o sistema **deve**
    recusar com 422 — sem `reference_portion_grams` a conta de substituição não existe.
12. **Quando** a nutri marca um item como travado **e** informa grupo, o sistema **deve** recusar
    com 400: travado não troca, as duas marcações juntas são contraditórias.
13. **Quando** a nutri exclui um tipo-de-dia ou uma refeição, o sistema **deve** apagar em cascata
    o que pende abaixo (opções, itens) — e **recusar com 409** se houver registro apontando para
    alguma refeição atingida.
14. **Quando** a nutri exclui um tipo-de-dia referenciado pela programação da semana, o sistema
    **deve** recusar com 409 — a semana ficaria com um dia sem tipo.

### User Story 4 — Escolher alimentos e grupos (Priority: P1)

Para pôr um item no plano a nutri precisa achar o alimento entre os ~580 da TACO. Precisa também
poder cadastrar um alimento que a TACO não tem e criar um grupo de substituição próprio.

**Teste de aceitação**

1. **Quando** a nutri busca alimento por trecho do nome, o sistema **deve** devolver os que casam,
   sem diferenciar maiúscula/minúscula nem acento, ordenados por nome, com limite.
2. **Quando** a busca vem vazia, o sistema **deve** devolver a primeira página, não erro.
3. **Quando** a nutri cadastra um alimento, o sistema **deve** exigir nome e os quatro nutrientes
   base (kcal, carbo, proteína, gordura) e marcar a origem como **não-TACO**, para a ingestão TACO
   (008) nunca o sobrescrever.
4. **Quando** a nutri exclui um alimento usado em algum plano ou registro, o sistema **deve**
   recusar com 409.
5. **Quando** a nutri cria um grupo de substituição, o sistema **deve** exigir nome e base de
   equivalência (carbo/proteína/gordura/kcal).
6. **Quando** a nutri vincula um alimento a um grupo, o sistema **deve** exigir a porção de
   referência em gramas e marcar o vínculo como **manual** — curadoria humana que a
   auto-classificação (008) nunca sobrescreve.
7. **Quando** a nutri exclui um grupo em uso por algum item de plano, o sistema **deve** recusar
   com 409.

### User Story 5 — Fazer tudo isso pela tela (Priority: P0)

A nutri abre o navegador, cadastra um paciente, cria o plano, monta os tipos-de-dia, a semana, as
refeições, as opções e os itens — e o app do paciente passa a mostrar aquele plano.

**Teste de aceitação**

1. **Quando** a nutri está na lista de pacientes, ela **deve** conseguir cadastrar, renomear e
   excluir paciente, e navegar para os planos dele.
2. **Quando** a nutri está na tela de um plano, ela **deve** ver o grafo inteiro e ter, em cada
   nó, os controles de criar, editar e excluir.
3. **Quando** uma escrita falha, a tela **deve** dizer o que aconteceu em uma frase, sem stack
   trace, e não perder o que a nutri já havia montado.
4. **Quando** a nutri termina de montar um plano e o ativa, `GET /patients/:id/today` **deve**
   responder com as refeições daquele plano — o critério de fim desta feature.
5. **Quando** a tela é servida, a credencial da nutri **não deve** aparecer no HTML nem no bundle
   do cliente (mesma garantia da 015/016: `NUTRI_API_KEY` sem `NEXT_PUBLIC_`).

## Requisitos funcionais

- **FR-001** — Todas as rotas novas ficam atrás do `NutriKeyGuard` (`x-nutri-key`), fail-closed.
- **FR-002** — Nenhum endpoint existente muda de forma, valor ou status.
- **FR-003** — `packages/core` não é modificado: zero régua nova.
  **Cumprido pela 017, e depois SUPERADO pela 019.** Nenhuma das mudanças desta feature toca o
  núcleo. Em seguida a **019 (busca de alimentos)** criou `packages/core/src/fuzzy.ts` e reescreveu
  `catalogo.service.buscarAlimentos` para delegar a ORDENAÇÃO por relevância a ela. O
  `GET /nutri/foods` da 017 continua sendo o mesmo endpoint com o mesmo contrato (ganhou `offset`,
  aditivo) — mudou quem ordena. Por isso **SC-001 não é mais verificável como escrito**: o `git
diff` de `packages/core` não está vazio, e o que o deixou sujo não foi esta feature.
- **FR-004** — Criar nó **nunca** cria nó irmão ou filho por conta própria (herança da 016: plano
  nasce vazio, tipo-de-dia nasce vazio). Exceção única e declarada: o **primeiro** plano de um
  paciente nasce ativo, porque `plan.is_active` não tem estado "nenhum".
- **FR-005** — Excluir é cascata **para baixo** e recusa **para os lados**: apaga o que só existe
  por causa do nó; recusa (409) quando outro agregado aponta para ele. Registro (`meal_event`)
  nunca é apagado em cascata.
- **FR-006** — Validação estrutural na borda com `typeof`/`trim`/faixa, no padrão que o repo já
  usa (`ciclo.controller.ts`, `patients.service.ts`). Não se introduz `class-validator`.
- **FR-007** — Validação que depende do banco (pertinência ao plano, vínculo alimento↔grupo, uso
  por registro) responde 422/409, não 500.
- **FR-008** — A leitura do plano é **uma** requisição para o grafo inteiro.
- **FR-009** — A web usa Tailwind + os componentes básicos do shadcn/ui como sistema de design.
- **FR-010** — Escrita na web é por Server Action: a credencial permanece no servidor.
- **FR-011** — Exatamente uma opção default por refeição, garantido em toda escrita que mexe nisso.
- **FR-012** — `(day_type, position)` de refeição é único.

## Sucesso

- **SC-001** — `git diff` vazio em `packages/core`. **Verdadeiro no fim da 017; invalidado pela
  019** — ver FR-003.
- **SC-002** — Suítes e2e pré-existentes verdes sem alteração de expectativa.
- **SC-003** — Paciente + plano completo criados **só pela tela**, e `GET /patients/:id/today`
  responde com esse plano (verificação ao vivo).
- **SC-004** — Excluir paciente/plano com registro é recusado com 409, provado por teste.
- **SC-005** — `grep` da `NUTRI_API_KEY` no HTML servido de todas as telas novas → 0.

## Fora de escopo (por decisão)

- **Escrita em `nutritionist`.** Sem auth real não existe dono de conta; e criar uma segunda
  nutricionista **quebra** `POST /nutri/patients`, que resolve a responsável com `limit(2)` e
  responde 422 quando há mais de uma (016). Entra com a auth real.
- **Import de plano por PDF/IA** — Fase 4, é a porta de entrada prevista no roadmap. Este editor
  é a porta manual, não a substitui.
- **Duplicar plano / duplicar tipo-de-dia / templates.** É a ergonomia que faz o editor virar
  produto; o editor aqui é commodity de suporte. Entra quando a nutri reclamar.
- **Drag-and-drop de ordenação.** Posição é campo numérico no formulário.
- **Undo/histórico de edição do plano.** O plano antigo continua existindo porque não se apaga —
  versionar de verdade é o ciclo (007).
- **Idempotência das escritas** (herdado da 016).
- **Escopo por nutri responsável.** A credencial stub é "nutri do sistema" — limite v0 já
  declarado na 006/015.

## Riscos

- **R1** — O editor mexe nas tabelas que a alça do paciente lê. Mitigação: FR-002/FR-003 +
  SC-002, e nenhuma leitura existente é reescrita.
- **R2** — Cascata de exclusão errada apaga registro de saúde. Mitigação: FR-005 explícito,
  SC-004 por teste, e a ordem de FK já provada pelo `buildScenario` (013).
- **R3** — Tailwind/shadcn entrando num app hoje 100% CSS-modules pode regredir a paleta
  categórica validada da 015. Mitigação: o CSS module dos gráficos **não** é migrado; só o
  cromo da página.

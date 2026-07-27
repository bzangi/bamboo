# Bamboo — SaaS para Nutricionistas

Monorepo pnpm + Turborepo. B2B2C: a nutri paga o SaaS; o paciente usa de graça. Web/desktop pra nutri, app mobile pra paciente. Status: **pré-MVP, RN-first** — **Fases 0–4 implementadas e testadas**: fundação + alça do paciente (`001`), rebalanceamento (`002`), registro feito/troquei/pulei (`003`) e motor lê o registro (`004`). Resto da Fase 3 entregue (ciclo `007`, adesão `006`, relatório `011`, **UI da nutri — leitura `015`, escrita `016`+`017`**); Fase 4 (import por IA/offline/notificações) não iniciada. **Desde a `017` a nutri monta o plano alimentar inteiro pela tela** (CRUD do grafo `plan → day_type → meal → meal_option → meal_item` + semana + catálogo), então o seed deixou de ser o único caminho para um plano existir. Em conflito com este header, o snapshot em `docs/estado-atual.md` vence.

## Fonte da verdade

Os planos e decisões de produto ficam em `docs/` (versionados no git, espelhados no Obsidian via symlink). Quando precisar de contexto que não está aqui, leia:

- `docs/estado-atual.md` — **snapshot do estado real** do repo (em conflito com este header, o snapshot vence).
- `specs/001-alca-do-paciente/` — primeira feature no Spec Kit (Fase 0/1), concluída; o modelo de spec → plan → tasks. Features `002`/`003`/`004` também concluídas (ver bloco SPECKIT no fim).
- `docs/decisoes-produto.md` — decisões de produto (o "porquê").
- `docs/plano-de-build.md` — companion técnico (arquitetura, roadmap por fases).
- `docs/plano-implementacao-fase0-fase1.md` — specs T0–T8 (histórico; fonte viva migrou pro Spec Kit).
- `docs/schema.ts` — schema Drizzle inicial (Fase 0; já migrado pra `packages/db/schema.ts`).

## Tese central (o que decide o produto)

O valor **não** é _ver_ o plano (commodity, todo concorrente faz). O valor é **adaptar** o plano à vida real. O paciente precisa **seguir + adequar**: os recursos de _adequar_ (substituição, rebalanceamento, autonomia) são o que faz o _seguir_ sobreviver ao mundo real. Plano rígido é abandonado; plano que dobra sem quebrar mantém ~80% de adesão.

Não competir na commodity (editor de plano, agenda, prontuário, base de alimentos). Diferenciar na **autonomia + rebalanceamento + ciclo de acompanhamento**.

## Assinatura do produto

> **"Mostra o certo por padrão, deixa trocar num toque, nunca barra."**

Vale pra toda decisão de UX. Home = "o agora" (a refeição do momento, sem caçar). Tipo-de-dia = default anunciado ("Hoje: dia de treino"), trocável num toque. Registro é **pendurado na consulta** (feito/troquei/pulei), nunca formulário separado. Faixa-alvo, não teto — comer de menos também é fora de adesão. Sem gamificação de restrição. Nada de "bucket de calorias em %" (vira culpa) — o rebalanceamento dá **ação**, não número.

## Stack

- **Backend:** Node.js + TypeScript + NestJS + PostgreSQL + Drizzle ORM
- **Mobile (paciente):** React Native + Expo
- **Web (nutri):** Next.js — fase posterior
- **Monorepo:** pnpm workspaces + Turborepo · Node 20+ · TypeScript strict
- **Testes:** Vitest
- **Versões:** sempre as estáveis atuais; não chumbar números.

## Estrutura do monorepo

```
apps/
  api/                 # NestJS
  mobile/              # Expo (app do paciente)
  (web/ da nutri vem numa fase posterior)
packages/
  db/                  # Drizzle: schema + migrations + client
  core/                # o CÉREBRO: rebalanceamento, substituição, cálculo nutricional
  types/               # contratos/DTOs compartilhados
  api-client/          # client tipado da API
```

## Decisões de arquitetura (não violar sem motivo)

- **Toda lógica de domínio vai em `packages/core`** — TS puro, agnóstico de plataforma, sem DB/HTTP. Motor de rebalanceamento, matemática de substituição/equivalência e cálculo nutricional. Roda no servidor **e** no app (offline). A UI do RN é um cliente fino. Testável com Vitest sem banco.
- **Seed-first:** pra provar a tese não precisa da UI da nutri — semeia o plano direto no banco e você faz o papel dela. A UI da nutri é fase posterior.
- **RN-first:** vai direto pro Expo, sem etapa de web responsivo. O app do paciente _é_ mobile (offline, notificação, presença na tela).
- **Boilerplate vem de gerador** (`create-turbo`, `nest new`, `create-expo-app`). O que é produto e **não** vem de gerador: o **schema** (`packages/db`) e o **core**.

## Arquitetura e paradigma funcional (backend)

> **Porquê (MVP-first):** disciplina funcional barata no miolo — funções puras + `Result` dão testabilidade e previsibilidade sem custo. Infra funcional pesada (sistema de efeitos completo) fica **deferida**, só quando o produto justificar. As regras abaixo são **obrigatórias**, não sugestões.

**Functional core / imperative shell**

- Regra de negócio = função **pura**: sem I/O, sem `throw`, sem mutação. Vive no núcleo.
- Service = **casca imperativa**: faz I/O (repositórios Drizzle, `db.transaction`, locks) e orquestra o núcleo puro. Só a casca lança `HttpException` (na borda) — **o núcleo nunca lança**.
- **Onde mora:** o núcleo puro (tipos de domínio, `Result`/`ok`/`err`, erros de domínio, funções de regra) vive em **`packages/core`** — TS puro, **sem dependência de Nest/Node**, reutilizável por backend e frontends (não duplica regra entre o lado da nutri e o do paciente). A casca fica em **`apps/api`**; DTOs/contratos compartilhados em **`packages/types`**. Import via alias do workspace sob o scope **`@bamboo/*`** (ex.: `@bamboo/core`).

**Erro como valor**

- O núcleo retorna `Result<T, E>` (`{ ok: true; value }` | `{ ok: false; error }`), **nunca lança**.
- Erros de domínio = **discriminated unions** tipados (`{ kind: '...' }`), casados com `ts-pattern` (`.exhaustive()` garante tratamento de todos os casos).

**Costura HTTP — Opção 1 (decisão atual)**

- O service converte o `Result` em `HttpException` na borda, **antes de retornar**. Controllers ficam finos/normais.
- Pode evoluir pra um interceptor depois — **por ora, opção 1**.

**Imutabilidade**

- `readonly`/`ReadonlyArray`, **spread em vez de mutação**, `map`/`filter`/`reduce` em vez de loop que muta.
- **Nunca mutar entidade carregada do banco** — trate o retorno do Drizzle como readonly.

**Sem estado mutável em service**

- Providers do Nest são singleton: **proibido** guardar estado mutável em propriedade de instância. Estado entra por parâmetro, sai no retorno.

**Validação em dois níveis**

- **Estrutural** (formato do payload, sem estado): no DTO com `class-validator` + `ValidationPipe`, na borda.
- **De negócio** (depende do banco/estado): no núcleo puro, via `Result`.

**Responses**

- **Nunca** serializar entidade do Drizzle/domínio direto na resposta — mapear pra um **DTO de response com função pura**.

**Drizzle**

- Transações explícitas (`db.transaction`) e **locks explícitos** em operações sensíveis a concorrência (cobrança, contagem de pacientes do pool).

**Bibliotecas (escopo do MVP)**

- **Recomendado:** `neverthrow` (ou `Result` na mão) · `ts-pattern` (match exaustivo).
- **Opcional:** `remeda` (utilitários) · `immer` (quando mutação for inevitável).
- **Deferido** (não usar agora — decisão consciente de não pagar a curva de um sistema de efeitos completo no MVP): `Effect` · `fp-ts`.

### Exemplos canônicos (referência ao gerar código)

`Result` + construtores:

```ts
// packages/core/src/result.ts
export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
```

Função pura de regra (sem I/O, sem `throw`, readonly, retorna `Result`):

```ts
// packages/core/src/substitution.ts
import { Result, ok, err } from "./result";

export type SubstitutionError =
  | { readonly kind: "fora-do-grupo" }
  | { readonly kind: "nutriente-base-zero" };

type Food = {
  readonly groupId: string;
  readonly basisPer100g: number; // nutriente-base do grupo, por 100g
};

export function substituir(
  origem: { readonly food: Food; readonly gramas: number },
  alvo: Food,
): Result<{ readonly gramas: number }, SubstitutionError> {
  if (alvo.groupId !== origem.food.groupId)
    return err({ kind: "fora-do-grupo" });
  if (alvo.basisPer100g <= 0) return err({ kind: "nutriente-base-zero" });
  const nutBase = (origem.food.basisPer100g / 100) * origem.gramas; // preserva o nutriente-base
  return ok({ gramas: nutBase / (alvo.basisPer100g / 100) });
}
```

Service (casca): `db.transaction`, chama o núcleo puro, converte erro em `HttpException` (opção 1):

```ts
// apps/api/src/substitution/substitution.service.ts
import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { match } from "ts-pattern";
import { substituir } from "@bamboo/core";

@Injectable()
export class SubstitutionService {
  constructor(private readonly db: Database) {}

  async substituir(
    itemId: string,
    alvoFoodId: string,
  ): Promise<SubstituicaoResponse> {
    return this.db.transaction(async (tx) => {
      const item = await loadMealItem(tx, itemId); // I/O: só na casca
      const alvo = await loadFood(tx, alvoFoodId);
      if (!item || !alvo) throw new NotFoundException();

      const resultado = substituir(
        // núcleo puro
        { food: item.food, gramas: item.gramas },
        alvo,
      );

      if (!resultado.ok) {
        // Result -> HttpException, na borda
        throw match(resultado.error)
          .with(
            { kind: "fora-do-grupo" },
            () => new UnprocessableEntityException("alimento fora do grupo"),
          )
          .with(
            { kind: "nutriente-base-zero" },
            () => new UnprocessableEntityException("alvo sem o nutriente-base"),
          )
          .exhaustive();
      }

      return toSubstituicaoResponse(alvo, resultado.value); // entidade -> DTO de response (função pura)
    });
  }
}
```

## Schema — decisões de modelagem embutidas

- Os itens penduram em **`meal_option`**, não na refeição direto → suporta os "3 almoços" desiguais; escolher uma opção é o que dispara o rebalanceamento.
- **`is_locked` + `substitution_group_id` no `meal_item`** = a marcação de flexibilidade inteira. Travado não troca; flexível troca dentro do grupo apontado.
- **`reference_portion_grams`** (vínculo alimento↔grupo) é o que faz a conta de substituição existir: trocar = reescalar a quantidade preservando o nutriente-base do grupo (carbo por carbo, etc., via `equivalence_basis`).
- Plano pertence **direto ao paciente** no v0; o _ciclo_ vira o wrapper que versiona planos numa fase posterior.
- Brasil: base **TACO** (gratuita) + **medidas caseiras** (gramas → colheres/conchas).

## Fluxo de Desenvolvimento (Spec-Driven Development)

Por padrão, TODA tarefa de desenvolvimento segue este pipeline, nesta ordem, sem pular etapas:

**Constitution → Specify → Plan → Tasks → Implement**

Nomenclatura do GitHub Spec Kit, instalado como skills `speckit-*` (`/speckit-constitution`, `/speckit-specify`, `/speckit-plan`, `/speckit-tasks`, `/speckit-implement`). Acima de tudo: **nada começa sem spec clara aprovada por mim**. SEMPRE que faltar clareza, PARE e me guie ativamente para gerá-la — não assuma comportamento, não invente regra de negócio, não preencha lacuna por conta própria. Faça perguntas direcionadas (uma de cada vez ou em lista curta) até a spec fechar.

### 1. Constitution — princípios governantes

- Regras não-negociáveis que toda fase seguinte herda; nenhuma spec, plan ou task pode violá-las.
- A constituição do Bamboo já vive neste CLAUDE.md + `docs/`: tese central, assinatura do produto, decisões de arquitetura, paradigma funcional (backend) e LGPD.
- Atualize só quando uma decisão estrutural muda — não a cada feature.

### 2. Specify — o QUE e o PORQUÊ

- Descreve comportamento e requisitos; **sem stack, sem COMO**.
- Critérios de aceitação verificáveis (EARS quando aplicável: "Quando <condição>, o sistema deve <comportamento>").
- Inclui casos de borda, estados de erro e o que está fora de escopo.
- Gate: só avance para o Plan após eu aprovar a spec explicitamente.

### 3. Plan — o COMO técnico

- Linguagem de engenharia: arquitetura, onde mora (núcleo puro em `packages/core` vs casca em `apps/api`), contratos/DTOs, modelo de dados, estratégia de testes, riscos e constraints.
- Respeite a Constitution; se algo só fechar violando-a, pare e me consulte.
- Gate: só avance para Tasks após eu aprovar o plano.

### 4. Tasks — quebra acionável

- Fatie o plano em tarefas pequenas, ordenadas e independentes, respeitando dependências ("Depende de").
- Cada task tem critério de aceitação próprio. **Test-first**: a task de teste vem antes da de implementação.

### 5. Implement — execução

- Execute task por task, na ordem, conforme Constitution + Spec + Plan.
- TDD: escreva o teste que falha, implemente até passar, cobrindo critérios de aceitação, casos de borda e estados de erro da spec.
- Se surgir ambiguidade ou requisito não coberto, volte à Specify ou ao Plan e me consulte antes de prosseguir.
- **Done de toda task — SEMPRE ao final:** rode lint (ESLint) e formatação (Prettier) e garanta que passam antes de dar a task por concluída — `pnpm lint` + `pnpm format` na raiz (via Turborepo), assim que o scaffold os configurar. Nenhuma task fecha com lint ou formatação quebrados.

## Roadmap

Trabalho atual = **Fase 0 (fundação) + Fase 1 (alça do paciente)**, quebrado nas specs T0–T8. Mandar uma tarefa por vez, na ordem (respeitar "Depende de"). Coração recomendado pra começar: **T4 — motor de substituição em `packages/core`** (função pura, testável).

- Fase 0 — monorepo, NestJS+Postgres+Drizzle, schema, ingestão TACO.
- Fase 1 — seed de um plano + home "o agora" + substituir alimento dentro do grupo com quantidade recalculada e medida caseira.
- Fase 2 — motor de rebalanceamento (recálculo multi-refeição por nutriente; gatilhos: combinação, opções desiguais, troca de tipo-de-dia; piso inviolável; prévia antes de confirmar).
- Fase 3 — registro pendurado na consulta, ciclo como objeto, métrica de adesão (só nutri), **relatório de ciclo** (a feature que vende), auto-classificação de alimentos em grupos, UI da nutri (web).
- Fase 4 — import de plano por IA (PDF→estruturado), offline robusto, notificações, comida fora da lista.
- Fase 5+ — billing, pagamentos, Pix/Stripe, deploy/infra.

## Fora de escopo agora (não construir antecipado)

Combinação (arroz+batata juntos) · rebalanceamento multi-refeição · override de tipo-de-dia + `day_selection` · logs (feito/troquei/pulei) · adesão/relatório · ~~UI da nutri~~ (**entregue**: leitura `015`, cadastro `016`, editor de plano `017`) · import por IA · offline · auth de verdade (v0 = auth stub, paciente fixo por env) · notificações · índices de performance.

Ainda fora de escopo **dentro** da UI da nutri, por decisão da `017`: escrita em `nutritionist` (sem auth real não há dono de conta, e uma segunda nutricionista quebra o `POST /nutri/patients`) · duplicar plano/tipo-de-dia e templates (ergonomia que faria o editor virar produto; a tese central é **adaptar** o plano, não editá-lo) · drag-and-drop de ordenação · undo do plano · idempotência das escritas.

## Constante — LGPD

Dado de saúde desde a Fase 0: controle de acesso, criptografia, consentimento. Não é fase, é transversal. Empurrar pro fim vira dívida cara.

<!-- SPECKIT START -->

Feature **021-combinar-busca-e-self** (busca + alimento de origem no modo de combinar):
**implementada e testada** (2026-07-27). Pedido do dono: "ao combinar 2 alimentos, quero poder
selecionar o alimento que já está no plano e também quero o mesmo search que foi implementado na
opção de troca". Grilling resolveu a ambiguidade antes de escrever a spec: não é combinação
cross-grupo — o `CombineSheet` já listava o grupo inteiro; o que faltava era especificamente o
**alimento de origem** (o que já está no item sendo combinado), que o mesmo endpoint
`GET /meal-items/:id/substitutions` compartilhado com a troca simples excluía via
`ne(foodId, item.foodId)` — correto para trocar um alimento por ele mesmo, errado para "metade do
que já como + metade de outro".
· **API** — `includeSelf` **aditivo** (padrão do `q`/`limit`/`offset` da 019): truthy inclui o food
de origem em `targets`; ausente ou falsy, resposta byte-a-byte a de sempre (suíte existente que já
afirma `alt.foodId !== flexFoodId` continua verde sem alteração). Helper novo `booleanDeQuery` em
`query-param.ts` (só `'true'`/`'1'` ligam — `Boolean(str)` trataria a STRING `'false'` como
truthy). **Zero mudança em `POST /meal-items/:id/combine`**: a query de `groupFoods` em
`combination.service.ts` nunca excluiu a origem — o achado, confirmado por e2e, é que o endpoint
já aceitava o alimento de origem como alvo; faltava só o cliente OFERECER essa opção na lista.
`packages/core` intocado (`combinar()`/`substituir()`) — o alimento de origem, quando vira alvo,
passa pela MESMA conta que qualquer outro do grupo (resultado trivial: mesmas macros ⇒ mesmas
gramas).
· **App** — a lógica de busca+paginação (debounce 250ms, guarda de geração, fim-de-lista) saiu de
dentro do `SubstitutionSheet` (019) para um hook compartilhado `useAlternativesSearch` — a 2ª
chamada real ao mesmo padrão (mesmo argumento já usado para `fuzzy.ts` como régua única: duas
cópias divergem no primeiro ajuste). `SubstitutionSheet` passou a consumi-lo sem mudança de
comportamento; `CombineSheet` trocou `ScrollView` por `FlatList` com o mesmo campo de busca
(limiar `MINIMO_PARA_BUSCAR`) e `onEndReached`, mantendo o checkbox multi-select (máx. 2) e o
stepper de proporção intactos.
**Fora de escopo por DECISÃO:** combinação com alimento de **outro** grupo de substituição — só o
alimento de origem (que já pertence ao grupo do item) ganhou a exceção; qualquer alvo fora do
grupo continua `422` (`combinar()` mantém `fora-do-grupo`).
**Correção pós-shipping (mesmo dia):** o dono testou e apontou que a troca simples
(`SubstitutionSheet`) TAMBÉM excluía o alimento de origem — a mesma exclusão que esta feature já
tinha corrigido só para o combinar. `SubstitutionSheet` passou a chamar `useAlternativesSearch`
com `includeSelf: true` também. **Zero mudança na API**: o parâmetro já existia (criado para o
combinar), o default do endpoint sem parâmetro segue excluindo a origem (suíte e2e inalterada) —
só o consumidor mobile passou a pedi-lo nos dois sheets.
**Pedido do mesmo feedback, adiado por decisão do dono:** registrar consumo que EXCEDE o
combinado/planejado (ex.: comeu mais batata do que os 105g da combinação) exige "comida fora da
lista" — item já listado no roadmap como Fase 4, não iniciada. Mantido lá; nenhuma mudança de
escopo agora.
**Achado colateral, fora do escopo desta feature:** `today-daytype`/`adesao`/`ciclo.e2e-spec.ts`
falham tanto na suíte completa quanto isoladamente — confirmado por reversão (`git stash`) que é
**pré-existente** (idêntico sem nenhuma mudança da 021), aparentemente estado/data do banco de dev
fora da janela que esses testes esperam. Não corrigido aqui; registrado para investigação
separada.
Sem migration, sem endpoint novo. Resultado: **core 181 · db 20 · mobile 54** verdes;
`substitutions.e2e-spec.ts` 21/21 e `combine.e2e-spec.ts` 7/7 verdes (os dois arquivos tocados);
lint 0 errors, Prettier e `check-types` limpos; OpenAPI regenerado (31 paths — só o parâmetro novo
no path existente). **Pendente:** quickstart manual no simulador (Bruno) — busca filtrando,
paginação por rolagem, e o alimento de origem selecionável de fato na tela.
Artefatos: `specs/021-combinar-busca-e-self/` (spec/plan/research D1–D4/data-model/contracts/
quickstart/tasks).

Feature **020-edicao-de-refeicao** (edição de refeição em lote): **implementada e testada**
(2026-07-27). Pedido do dono: "não vou comer nada do que está listado" exigia N fluxos de troca
item a item; agora há **um modo de edição por refeição** — troca vários itens de uma vez e vê
**UMA prévia de impacto** no submit, antes de aplicar. **Zero matemática nova, zero migration,
`packages/core` com diff vazio.**
· **API** — `POST /rebalance/option-choice` ganhou `items?` **aditivo** (padrão do `dayTypeId` da
014): o overlay da composição EDITADA da refeição-gatilho, na **MESMA forma** do `consumo.items`
do `POST /registro` (D2 — o que a prévia avalia é o que o registro grava; divergência
inexpressável). A casca aplica o overlay na montagem do `diaComEscolha` com ids sintéticos `ed-`
(mesmo padrão dos `reg-` das registradas): o gatilho sai das alavancas por `position`, então só
macros+gramas entram no total — **o que o paciente escolheu comer nunca é reescalado**. Entradas
repetidas do mesmo `itemId` **somam** (combinação). Validação: 400 forma / 404 item fora da opção
ou food inexistente / **422 item travado no overlay** (editar travado é instrução contraditória,
argumento da 017); o **grupo do food NÃO é re-validado** na prévia (`ponytail:` no service) — o
registro é o enforcement e o app só produz troca dentro do grupo com gramas do servidor. Sem
`items`, resposta **byte-a-byte** a de hoje (suíte pré-existente verde com diff vazio). e2e novo
`edicao-refeicao.e2e-spec.ts` (16 casos) **calibrado por foods reais da TACO** (arroz 128.26 /
frango 159.19 / macarrão 131 kcal/100g, régua pinada no paciente): sem-acao, rebalanceado
excluindo gatilho+registradas, **pulei contribui 0 e o ajuste compensa só o delta líquido**,
recusa sem-alavanca, 0 escritas. Achado no RED: `sem-acao` exige TODOS os nutrientes na faixa
(não só kcal) — teste redesenhado para discriminar pelo ajuste líquido, não pela ausência dele.
· **App** — reducer puro novo `edits.ts` (padrão `swaps.ts` da 005): render e consumo continuam
em `nameOverrides`/`consumoOverrides` (**fonte única** — uma 3ª estrutura de display recriaria o
bug que a 005 matou); `edits[mealId]` guarda só o **"antes"** de cada item + os ajustes da prévia,
e o desfazer (snackbar, atômico) repõe trocas E ajustes num ato, apagando a chave quando não havia
override. `MealEditSheet` novo reusa o `SubstitutionSheet` como **picker aninhado** (busca/
paginação da 019 de graça) e o `RebalancePreviewSheet` ganhou `consumoItems?`/`titulo?` + textos
de edição; travado aparece "fixo no plano"; **à vontade troca 1:1 só no display** (fora do payload
— D7). Falha de rede na prévia **preserva as pendências** (o sheet de edição fica atrás). Toast
unificado (`swap`/`edit`) no `UndoSwapToast`, que virou label-genérico. Registrar "Feito" depois
de confirmar → **"troquei" com a composição editada completa**, pelo caminho existente — nada
novo persiste.
· **Colateral (pré-existente, 018)**: trocar item à vontade gravava `consumoOverrides` com
`quantityGrams: 0` — o "Feito" seguinte levaria **400**; `montarConsumo` agora filtra ≤ 0 (RED
visto; troca só-de-exibição vira "feito", não "troquei" — nutricionalmente idêntico).
**Resíduo aceito (D6)**: a prévia não enxerga adaptações efêmeras de OUTRAS refeições da sessão —
exatamente como a troca de opção hoje; consertar é decisão de produto separada.
**Fora de escopo por DECISÃO:** comida fora da lista (Fase 4 — "livremente" = a refeição inteira
de uma vez, não "qualquer comida"; troca segue dentro do grupo, que é o que preserva o
nutriente-base) · gramas digitáveis à mão · combinação dentro do modo de edição · trocar de opção
dentro do modo (é o fluxo de chips) · registrar direto do confirmar (o "Feito" já deriva).
Resultado: **api 318** (302 + 16) · **mobile 54** (inclui 9 do reducer + 1 do colateral) · core/db
sem mudança; lint raiz 0 errors, `check-types` 9/9, Prettier limpo; OpenAPI regenerado (31 paths).
**Pendente:** smoke manual no simulador (Bruno) — inclui conferir o EMPILHAMENTO de modais no iOS
(edição → picker/prévia por cima; se o 2º modal não apresentar, o plano B é o picker inline na
folha). **Nota da árvore:** a fiação em `HomeScreen`/`RebalancePreviewSheet`/`UndoSwapToast` foi
feita por cima do redesign visual NÃO COMMITADO que avança em paralelo na mesma árvore — esses 3
arquivos ficaram fora do commit da 020 de propósito (commitá-los levaria junto o WIP alheio) e
descem com o commit do redesign. Artefatos: `specs/020-edicao-de-refeicao/`
(spec/plan/research D1–D9/data-model/contracts/quickstart/tasks).

Feature **019-busca-de-alimentos** (busca fuzzy + paginação do catálogo): **implementada e testada**
(2026-07-27). Dois sintomas do mesmo problema — **lista longa sem como filtrar**: a
auto-classificação (008) pôs ~506 alimentos em ~7 grupos, e o `SubstitutionSheet` despejava o grupo
inteiro num `ScrollView` **sem campo de busca** (achar "batata doce" entre 70 amidos é rolagem, o
oposto de "trocar num toque"); e `GET /nutri/foods` tinha `limit`/`total` mas **nenhuma forma de
pedir a 2ª página** — quem casava além do limite era inalcançável.
· **Núcleo** — `packages/core/src/fuzzy.ts` é a régua **ÚNICA**, usada pelo app e pela API: duas
cópias de uma ordenação divergem no primeiro ajuste e o mesmo termo passa a dar ordens diferentes
em telas diferentes. Fuzzy aqui é **subsequência pontuada** (semântica de fzf/VSCode), não distância
de edição: +1 por caractere, +3 em início de palavra, e **+4 / −min(salto,3)** pelos dois lados do
MESMO teste — casar em `cursor` **é** casar colado no anterior, então prêmio e punição não são duas
regras. Casamento **guloso pela esquerda**, que para _existência_ de subsequência é ótimo (só a
pontuação fica subótima, e pontuação subótima reordena — não esconde resultado). `buscarFuzzy` é
**estável**: empate preserva a ordem de entrada, então o desempate é do chamador e não há
`localeCompare` escondido no núcleo.
· **API** — o pré-filtro **continua no Postgres**: `LIKE '%a%r%r%o%z%'` **é** o teste de
subsequência, e a dobra de acento já existia (`translate(lower(...))`). O banco filtra, o núcleo só
**ordena** — e as duas metades nunca discordam porque a tabela de acentos do `translate` e a de
`normalizarBusca` são a mesma (está escrito nos dois lugares). A query de `count(*)` **sumiu**
(2 → 1 query): `total` é o tamanho do conjunto casado. `offset` é fatiado **em memória**, não no
SQL — a ordenação é por relevância, que o Postgres não conhece, então `OFFSET` pularia pela ordem
errada. `limit`/`offset` fora de forma caem no default em vez de 400 (é o que o `limit` já fazia; um
`?offset=abc` que derruba a tela seria pior). `%` e `_` seguem literais — o teste da 017 continua
válido sem alteração.
· **App** — campo a partir de **8 alternativas** (abaixo disso é ruído numa tela pequena), ou sempre
que houver termo digitado — senão o paciente não conseguiria apagar a busca que esvaziou a lista. O
termo é **zerado ao abrir**, e **durante o render** (padrão "You Might Not Need an Effect"), não num
`useEffect`: em efeito, a primeira consulta dispararia com o termo da troca anterior antes de o
reset chegar. "Nenhum alimento com X" é mensagem **distinta** de "sem alternativas neste grupo":
lista filtrada vazia e grupo vazio não são o mesmo estado. `@bamboo/core` virou dependência do
`apps/mobile` (o que a constituição sempre previu); provado com `expo export --platform ios` de
verdade — `normalizarBusca` e a tabela de acentos aparecem no bytecode Hermes.
· **Página na lista do paciente** (2ª leva, pedido do dono: "lazy loading de 10~20, o resto conforme
a rolagem") — `GET /meal-items/:id/substitutions` ganhou `q`/`limit`/`offset` **opcionais**, e **sem
os três a resposta é byte-a-byte a de hoje**: nenhum teste nem cliente existente mudou. **Sem campo
`total`** — o fim é "página menor que o `limit`"; uma requisição extra quando o grupo é múltiplo
exato de 20 é mais barata que um campo em toda resposta. Busca e página são aplicadas **DEPOIS** do
cálculo das alternativas, de propósito: `substituir` exclui o alvo de nutriente-base zero, então
fatiar antes faria uma página voltar curta e a rolagem **pararia no meio do grupo**. Com página, a
busca **teve de virar do servidor** (a 1ª leva filtrava em memória, o que só valia enquanto a
resposta trazia o grupo inteiro): filtrar o que já baixou dá resultado errado quando o alimento está
na página que não veio — custo, 250 ms de debounce. No app, `ScrollView` → **`FlatList`** com
`onEndReached`, **guarda de geração** por `useRef` (página atrasada de um termo antigo é descartada)
e falha de página que **não derruba** o que já está na tela — só para de crescer.
`inteiroDeQuery` saiu do `catalogo.service` para `apps/api/src/query-param.ts`: dois endpoints
paginados, uma regra de parse (tolerante — `?offset=abc` cai no default, não 400).
· **Colateral** — a query de alternativas do `substitution.service` **não tinha `ORDER BY`**: com
desempate estável isso viraria "relevância e depois arbitrário". Ganhou `(name, id)`.
**Fora de escopo por DECISÃO:** tolerância a **erro de digitação** ("arros" → "arroz") — pede
distância de edição e um **limiar** para calibrar, e afrouxar a subsequência só produz ruído; o
passo é `pg_trgm` quando houver reclamação · buscar **fora do grupo** no lado do paciente (a troca é
dentro do grupo por definição — é o que preserva o nutriente-base) · paginação por **cursor**
(`offset` sobre ~600 linhas é o custo de nada) · ordenar por histórico de trocas (ninguém guarda
esse dado ainda).
**Fora de escopo por DECISÃO** (além dos acima): consumir a paginação de `/nutri/foods` **na web** —
a tela do editor é da 017, em curso; o parâmetro está pronto e documentado para quando ela trocar o
`<select>` de 600 opções.
Sem migration, sem endpoint novo, forma da resposta inalterada. Resultado: **core 181** (166 + 15) ·
**api 302** (291 + 11) · **api-client 8** (4 + 4) · **db 20** verdes; mobile e web verdes (a
contagem está se movendo: a 017 avança em paralelo na mesma árvore); lint 0 errors, Prettier e
`check-types` limpos; OpenAPI regenerado (31 paths). Duas provas **por reversão**: zerar o prêmio de
contiguidade derruba o teste que o isola; tirar o `slice` da página derruba 3 dos casos novos.
Artefatos: `specs/019-busca-de-alimentos/` (spec/plan/tasks).

Feature **018-item-a-vontade** (item sem quantidade prescrita): **implementada e testada**
(2026-07-27). Aprovada pelo dono ao ler o GAP-1 da transcrição do plano real. O plano do paciente 0
prescreve **alface e brócolis sem quantidade em 12 das 30 opções** ("salada, verduras e vegetais são
SEMPRE à vontade", repetido em toda página), e os 5 vegetais que ela oferece como troca também. Isso
não era expressável: `meal_item.quantity_grams` é `NOT NULL`, e a única saída seria **inventar
gramatura que a nutri não escreveu**.
· **Schema** — migration `0005`: `meal_item.ad_libitum boolean not null default false`.
`quantity_grams` **continua NOT NULL** e vale `0` nesses itens. Tornar a coluna nullable obrigaria
todo leitor (nutrição, motor, adesão, consumo real, snapshot do troquei, mappers) a tratar `null`;
com `0` o comportamento certo — contribuir zero para o alvo — cai de graça, e **a flag é o que
distingue "0 porque à vontade" de "0 porque bug"**. Bônus: a validação `gramas > 0` do editor (017)
segue válida para item normal.
· **Núcleo** — `ItemDia.adLibitum` **obrigatório** (disciplina do `isRegistered` da 004: opcional
deixa o adaptador esquecer, e esquecer aqui significa **reescalar salada**) e a cláusula entrou em
**`ehAlavanca`**, que já é a definição única de "item flexível" — filtrar na casca criaria a segunda
definição. RED visto antes: a prévia trazia `[ant, salada, seg]` em vez de `[ant, seg]`.
· **Casca** — `adLibitum` aditivo em `MealItemDto` e `SubstitutionAlternativeDto`/`CurrentItemDto`
(padrão do `rebalanceado` da 009). Substituição de origem à vontade **não passa pelo núcleo**: não
existe conta a fazer (salada por salada é 1:1), e `substituir` com 0 g devolveria `ok({gramas: 0})`
que a tela mostraria como "0 g de tomate". O `/today` também **deixou de emitir nutrição** nesses
itens — "0 kcal" numa salada é a tela mentindo com número certo.
· **App** — `formatQuantidadeItem` curto-circuita em "à vontade" antes de gramas, medida caseira e
quantidade trocada.
· **Teste** — `ItemSpec.aVontade` no `buildScenario` (013), com validação nos dois sentidos (item
sem `grams` que não é à vontade lança; item à vontade que declara `grams` também). e2e novo com o
cenário do plano real (arroz flexível + salada), `exposure: full_kcal` de propósito — é o nível em
que o "0 kcal" apareceria.
**Achado colateral que a 016 causou:** criar paciente pela tela (sem plano, como é o cadastro)
**derrubou 4 suítes e2e**. 14 pontos em 8 suítes faziam `select().from(patient).limit(1)` **sem
`where`** — o risco que a 013 catalogou como I-3, que dava certo por sorte enquanto só existia o
paciente do seed. Agora existe `pacienteSemeado()` em `test/helpers.ts`: junta `plan` com
`is_active`, `ORDER BY` explícito, e lança dizendo "rode o seed" quando não há nenhum.
Resultado: **core 166** (164 + 2) · **api 291** (inclui a 017, em curso) · **mobile 27** (24 + 3) ·
**db 20** · **web 29** verdes; lint 0 errors, Prettier e `check-types` limpos; OpenAPI regenerado.
Artefatos: `specs/018-item-a-vontade/` (spec/plan/tasks).

Feature **017-editor-de-plano** (a nutri monta o plano alimentar pela tela; **CRUD completo do
grafo**): **implementada e testada** (2026-07-27). Gatilho: avaliação pedida pelo dono dos
endpoints do lado da nutri. O achado: **10 rotas `/nutri/*` e nenhuma que criasse um plano.** O
lado de leitura estava completo (roster 015, adesão 006, ciclo 007, relatório 011); o de escrita
tinha três atos — criar paciente (016), abrir/fechar ciclo (007) e **ativar um plano que já
precisava existir**. Plano só existia rodando `packages/db/scripts/seed.ts`, com o grafo
hard-coded: **a nutri não era usuária do produto, era uma linha no seed**. E a 016 tornou isso
visível ao criar pacientes que nasciam e permaneciam sem plano — paciente sem plano faz o app do
paciente não ter o que mostrar.
· **API** — módulo novo `apps/api/src/plano-editor/` (+ `PATCH`/`DELETE`/`GET` de paciente no
`nutri` da 015/016): **17 → 31 paths** no OpenAPI. **Forma das rotas (D1):** criar é aninhado
(`POST <pai>/<filhos>`), editar/excluir é **plano** (`/nutri/<coleção>/:id`) — o caminho aninhado
até um item teria 7 níveis de `@Param` e não acrescentaria informação, porque o grafo é caminhável
**para cima** e a existência do nó já dá o 404. **A semana é UM objeto** (`PUT .../schedule` com
os 7 pares, D2): `day_schedule` são 7 linhas que só fazem sentido juntas, e semana com 6 dias
programados é um estado que nenhuma tela deveria poder produzir. **Leitura do grafo em UMA
requisição** (`GET /nutri/plans/:planId`, D3): 4 `select` + montagem pura em memória — o grafo tem
profundidade FIXA (4) e um plano real tem dezenas de nós, então CTE recursiva seria maquinário para
um problema inexistente; ordenação toda no SQL e **sempre com desempate por `id`** (lição do `, id`
da 012).
**A REGRA de exclusão, em uma frase: cascata para baixo, 409 para os lados** (`cascata.ts`, D4).
Apaga o que só existe por causa do nó; recusa quando outro agregado aponta para ele.
`meal_event`/`meal_event_item` **NUNCA** entram numa cascata — registro é dado de saúde do
paciente, não detalhe do plano: o plano pode ser reescrito, o que aconteceu no dia não. Provado ao
vivo: 4 pacientes do smoke apagados pela via da nutri levaram 4 planos, 7 tipos-de-dia e 14 linhas
de semana, com `meal_event` **intocado**.
**Duas invariantes que a casca garante porque o schema não tem constraint:** `(day_type, position)`
único — position é a chave que pareia refeições entre tipos-de-dia (009/012), e duplicá-la
corromperia a troca de tipo-de-dia **em silêncio**; e **exatamente UMA opção padrão por refeição** —
a primeira opção nasce padrão sem pedir, marcar outra desmarca as irmãs, excluir a padrão promove
outra no mesmo ato, e desmarcar a única padrão é **409** (marque outra em vez de desmarcar esta).
`ponytail:` as duas na aplicação, não no banco; se aparecer escrita concorrente, o lugar é um
`uniqueIndex` parcial, na forma do `cycle_one_active_per_patient`.
**`isLocked` e `substitutionGroupId` são mutuamente exclusivos** (400): travado não troca, então
apontar grupo para ele é instrução contraditória — recusada, não "resolvida" por precedência. E no
PATCH a marcação é avaliada **em conjunto com o que já está gravado**, senão mandar só
`isLocked: true` num item que tem grupo passaria pela brecha. Item flexível exige que o alimento
**participe** do grupo (422): é o vínculo que carrega `reference_portion_grams`, sem a qual a troca
não sabe reescalar.
**Catálogo (US4):** a base TACO estava semeada desde a Fase 0 e **inalcançável por HTTP** — sem
busca, a nutri não achava o alimento entre ~580 para pôr num item. Alimento criado à mão nasce
**sem `taco_id`** e com `source != 'taco'` ⇒ a ingestão da 008 (upsert por `taco_id`) nunca o
alcança; vínculo criado à mão nasce **`origin: 'manual'`** ⇒ a auto-classificação nunca o
sobrescreve. **Validação estrutural na borda** com helpers puros (`validar.ts`, 20 testes) no padrão
que o repo já pratica: **não** entrou `class-validator`/`ValidationPipe`.
· **Web** — Tailwind v4 + **shadcn/ui** (pedido do dono) e 3 telas novas
(`/patients/[id]/ficha`, `/plans`, `/plans/[planId]` = o editor). **Os tokens do shadcn são
MAPEADOS na paleta validada da 015** (`@theme inline` sobre as variáveis existentes), não a paleta
neutra padrão dele: o design system novo herda a cor que já passou por banda de luminosidade,
croma, ΔE de daltonismo e contraste. **A visualização de dados do relatório NÃO foi migrada** (D11)
— `nutri.module.css` continua intacto; aquela tela só ganhou 3 links de navegação, e a ficha do
paciente virou **rota própria** justamente para o diff não encostar nas 424 linhas dela.
**Só componentes shadcn que não precisam de client:** `button`/`input`/`label`/`card`/`table`/
`badge`, com `<select>` e `<details>` **nativos** no lugar de `Select`/`Dialog` do Radix — o
`<select>` nativo dá type-ahead do navegador de graça sobre ~590 alimentos, funciona sem JS e
dispensa ~6 dependências. **Zero diretiva `"use client"`** em todo o app; toda escrita é Server
Action, então a credencial nunca sai do servidor.
**VERIFICADO AO VIVO como browser SEM JavaScript** (POST multipart no `$ACTION_ID`, 10 passos): um
paciente e um plano **inteiro** — 2 tipos-de-dia, semana programada, refeição, opção, 2 itens (um
flexível num grupo, um travado) — montados **100% pela tela**, e no fim
**`GET /patients/:id/today` respondendo com esse plano**. É o critério do objetivo, e é a primeira
vez no repo que o caminho nutri→paciente fecha sem o seed. `grep` da `NUTRI_API_KEY` no HTML
servido das 6 telas → **0** em todas.
**Três defeitos que o smoke pegou e nenhum teste pegava:** (1) o código de falha precisava da
**OPERAÇÃO**, não só da entidade — criar e excluir refeição respondem os dois **409** por causas
opostas (posição ocupada vs. tem registro), e a tela mostrava a frase errada, mandando a nutri
procurar o erro no lugar errado; virou o par `refeicao-posicao`/`refeicao`. (2) **`cod in FRASES`
andava pela cadeia de protótipos** — `?erro=constructor` devolvia `Object.prototype.constructor`,
uma função onde a tela espera texto; é a MESMA armadilha que o `presente()` da API já evitava com
`hasOwnProperty` e que eu não apliquei na web (corrigido com `Object.hasOwn`). (3) a asserção óbvia
do escape de curinga estava errada: buscar `%` **não** devolve zero, porque a TACO tem 8 alimentos
com `%` literal no nome (`Margarina … (65% de lipídeos)`).
**A falha de escrita volta pela URL como CÓDIGO de conjunto FECHADO, nunca como texto** — um
parâmetro de texto refletido deixaria qualquer um montar uma URL que exibe a frase que quisesse
dentro da tela da nutri (phishing, não XSS: o React escapa). O código sai de **(status, entidade)**
sem inspecionar a mensagem da API, porque casar por substring quebraria calado no dia em que ela
reescrevesse uma frase. `ponytail:` a frase de 409 lista as causas possíveis em vez da exata; se a
precisão doer, o passo é uma ilha client com `useActionState`, não relaxar isto.
**Fora de escopo por DECISÃO:** escrita em `nutritionist` (sem auth real não há dono de conta — e
criar uma segunda **quebra** `POST /nutri/patients`, que resolve a responsável com `limit(2)` e
responde 422 com mais de uma) · import de plano por PDF/IA (Fase 4, é a porta prevista no roadmap;
este editor é a porta manual, não a substitui) · duplicar plano/tipo-de-dia e templates (ergonomia
que faria o editor virar produto; ele é commodity de suporte — a tese central é **adaptar**, não
editar) · drag-and-drop de ordenação · undo do plano · idempotência · escopo por nutri responsável
(limite v0 da 006/015).
**Sem migration.** `packages/core` não foi tocado por esta feature — e **logo depois** a **019**
criou `core/fuzzy.ts` e reescreveu `buscarAlimentos` para delegar a ordenação por relevância a ela,
mantendo o contrato do `GET /nutri/foods` (ganhou `offset`, aditivo). Por isso o SC-001 desta spec
("`git diff` vazio em `packages/core`") era verdadeiro no fim da 017 e **não é mais verificável** —
e o que o invalidou não foi esta feature.
Resultado: **core 181 · db 20 · api 296 · web 38 (29 + 9) · api-client 4 · mobile 39** verdes —
**126 testes em 6 arquivos** são desta feature (4 e2e self-contained via `buildScenario` + 2 unit);
`tsc` limpo em api e web, lint 0 errors (api) e 0 warnings (web, `--max-warnings 0`), Prettier
limpo; OpenAPI regenerado. Artefatos: `specs/017-editor-de-plano/` (spec/plan com as correções
C1–C6/tasks).

Feature **016-cadastro-de-paciente** (cadastrar paciente): **implementada e testada**
(2026-07-26). Lacuna apontada pelo dono logo depois da 015: a nutri tinha tela que **lê**
pacientes, mas um paciente só existia rodando `packages/db/scripts/seed.ts` — que **apaga** a
nutricionista e os pacientes antes de recriar. Não havia como acrescentar um.
· **API** — `POST /nutri/patients` no módulo `nutri` da 015. Corpo `{ name }` **e só**:
e-mail/telefone/peso/altura existem no schema e continuam nulos porque nada os consome (coleta
mínima, LGPD). **201 na mesma forma do item da listagem** (`cicloAtual: null`) — o cliente insere
na lista sem 2ª chamada e não nasce um segundo formato de "paciente". **Escreve UMA tabela**, e o
e2e trava isso comparando as contagens de `plan`/`cycle`/`day_schedule` antes e depois: cadastro
que inventa grafo cria plano fantasma. A nutricionista responsável é resolvida com **`limit(2)`**,
que distingue os três casos numa query — nenhuma → 422 orientado; **mais de uma → 422** dizendo
que a credencial stub não sabe qual é a responsável. `limit(1)` silencioso penduraria dado de
saúde na nutricionista errada. Validação **estrutural na borda** com `typeof`/`trim`, no padrão que
o repo já usa (`ciclo.controller.ts`): **não** existe `class-validator`/`ValidationPipe` aqui, e
não se traz dependência para validar uma string. Homônimo é aceito (não há chave natural).
· **Web** — `<details>` **nativo** guarda o formulário (a tela continua sendo a lista) e uma
**Server Action** faz a escrita, então a credencial segue no servidor. **Verificado ao vivo como
browser SEM JavaScript** (POST multipart no `$ACTION_ID`): nome válido → 303 + paciente na lista;
nome em branco → 303 para `/?erro=nome-invalido` e nada criado. A falha volta pela URL como
**código**, nunca como texto — a página traduz para uma frase fixa, então nada de fora é
refletido e dispensa `useActionState` (que exigiria componente client). **`redirect()` fica FORA
do `try`**: ele funciona lançando exceção interna do Next, e o `catch` o engoliria.
**Custo assumido:** o roster passa a carregar o runtime de Server Actions e deixa de ser 100%
zero-JS; a garantia que importa (credencial só no servidor) não muda.
**Fora de escopo por DECISÃO:** criar **plano** (o grafo `plan → day_type → meal → meal_option →
meal_item` + `day_schedule`; escrever esse payload à mão é pior que rodar o seed, e o
`buildScenario` já expressa o grafo declarativamente — o endpoint nasce com o **import de PDF por
IA da Fase 4**, que é o que o roadmap prevê como porta de entrada do plano) · editar/excluir
paciente · cadastrar nutricionista (sem auth real não há dono da conta) · idempotência.
**Limite conhecido, documentado e NÃO corrigido:** paciente cadastrado por esta via **não
sobrevive** ao próximo `seed` — é o que o seed sempre fez, mas só agora fica visível.
Sem migration, core intocado. **api 158 → 165** · web 29 · core 164 · db 20 · mobile 24 verdes;
lint 0 errors, `check-types`/Prettier limpos; OpenAPI regenerado.
Artefatos: `specs/016-cadastro-de-paciente/` (spec/plan/tasks).

Feature **015-visao-da-nutri** (a visão da nutri — parte de leitura; **começa o EP-6**):
**implementada e testada** (2026-07-26). O EP-5 estava concluído e **invisível**: 4 vias
`/nutri/*` prontas (adesão 006, ciclo 007, relatório 011) e **zero consumidores** — a única
forma de a nutri ver "a feature que vende" era `curl` com `x-nutri-key`, e o `apps/web` seguia
no boilerplate do `create-turbo`. Entregue **um** endpoint + **duas telas**.
· **API** — `GET /nutri/patients` (`apps/api/src/nutri/`, módulo novo ao lado do guard que já
morava lá): a **porta de entrada**, porque toda rota da nutri é `/nutri/patients/:patientId/...`
e sem listagem não se chega a um paciente sem já saber o UUID. Devolve `name` + **`cicloAtual`**
= o ciclo aberto; se não houver, o **fechado mais recente** (D2) — resolvido pela **ordem da
query** (o 1º registro de cada paciente já é o vencedor) com `closed_on DESC NULLS FIRST`
**explícito**: depender do default do Postgres é como se perde determinismo (lição do `, id` da
012 / I-2 da 013). **Minimização LGPD** (FR-004): sem e-mail/telefone/peso/altura — travado por
teste nas **chaves** da resposta. Nenhuma métrica é calculada aqui.
· **Web** — `/` (roster) e `/patients/[id]` (adesão média dominante · evolução semana a semana ·
padrão de registro total e por refeição · comparativo). **Server Components puros, ZERO JS no
cliente**: é o que garante FR-006 (env sem `NEXT_PUBLIC_`, nenhum `"use client"` no app),
**verificado ao vivo** com `grep` da chave no HTML servido das 2 telas → **0**.
**Nenhuma régua nova** (FR-007): `packages/core` **intocado**, nenhum endpoint existente mudou,
nada persiste. O que a web deriva é **apresentação**, e é o que tem teste
(`apps/web/lib/format.ts`, 24 testes, **Vitest novo no app**) — porque o DTO do relatório
**mistura escalas** (adesão `0–100`; cobertura e `taxa*` `0–1`), então são **duas** funções
(`pct100`/`pct01`) em vez de uma com flag, e `dataCurta`/`contarDias` **não** passam por
`new Date(iso)`, que é meia-noite **UTC** e renderiza o dia anterior a oeste de Greenwich.
**Visualização em CSS, sem lib** (D7): a evolução semanal é um **colmo** cuja **largura** por
semana é o número de dias dela — a semana parcial é mais curta **porque é mais curta**, e a
semana sem registro aparece **hachurada**, não zerada; o padrão de registro é uma barra
empilhada. Paleta categórica **validada** (banda de luminosidade, croma, ΔE de daltonismo,
contraste) nos dois modos; `feito`=verde do produto e `troquei`=azul são as **mesmas semânticas
do mobile** (a nutri lê as duas telas); "sem registro" é **hachura**, não a 4ª cor de série —
ausência de dado não compete com dado. **Decisão de produto embutida na cor:** o delta de
`troquei` é **neutro**, nunca vermelho — trocar é adaptação, não falha (tese central).
**Fora de escopo por DECISÃO:** abrir/fechar ciclo e trocar plano ativo **pela tela** (são
**atos** da consulta; os `POST` já existem na API) · seletor de ciclo antigo · adesão na roster
(custaria N relatórios por render) · `GET /nutri/patients/:id` (a tela do paciente **relê a
roster** — a regra de "qual ciclo mostrar" fica num lugar só; teto anotado com `ponytail:` no
código) · auth real (a credencial stub dá o papel "nutri do sistema", então a roster não é
escopada por nutri responsável — limite v0 já declarado na 006).
**Bug encontrado DEPOIS de dar por concluído — a tela de falha dava 500** (corrigido no mesmo
dia): a página do paciente passava a instância de `Error` como **prop de componente**
(`<Falha e={e}/>`), e a serialização do **React Flight** explode nisso com
`TypeError: chunk.reason.enqueueModel is not a function` — digest, zero stack de aplicação, 500
**no caminho que existe para não haver 500**. O roster nunca quebrou porque lá o erro já virava
**string** antes do JSX: era a única diferença entre as duas páginas. Fix: `Falha` recebe
`titulo`/`detalhe` (o tipo barra a reincidência) e `explicarFalha` roda no chamador. Provado por
**reversão** (500 → 200 com essa mudança só). Segundo erro no mesmo caminho: a mensagem mandava
rodar `pnpm --filter api dev` citando a porta **3000**, mas esse script sobe na **3333** — seguir
a instrução não resolvia. Lição registrada: a verificação da 015 cobriu o caminho feliz e os
estados vazios **com a API sempre no ar**; o ramo de falha só ganhou teste
(`apps/web/lib/nutri.test.ts`, 5 casos) depois de quebrar na mão do dono.
Sem migration. Boilerplate do `create-turbo` apagado (`page.module.css` + 7 svgs); web sobe na
**3001**; `API_URL`/`NUTRI_API_KEY` documentados no `.env.example` (apontando **3333**, a porta
do `api dev`) e declarados no `turbo.json`. Resultado: **api 158** (151 + 7) · **core 164** · **db 20** · **mobile 24** ·
**web 29 (novos — 24 de apresentação + 5 do ramo de falha)** verdes; `check-types`/lint (0 errors)/Prettier limpos; OpenAPI regenerado
(14 paths). Verificação visual: as 2 telas renderizadas com cenário de demonstração via
`buildScenario` (013) e conferidas nos modos claro e escuro; o cenário foi **destruído** ao fim
(banco de dev volta ao estado anterior). Artefatos: `specs/015-visao-da-nutri/`
(spec/plan/tasks).

Feature **014-rebalance-ciente-do-override** (a prévia de rebalanceamento passa a enxergar o
override de tipo-de-dia): **implementada e testada** (2026-07-26). Destravada pela **decisão do
dono: opção (a)**, que cumpriu a 2ª condição do **ADR-0001** (a 1ª — teste de colisão escrito
ANTES — já estava cumprida). **ADR-0003** registra a decisão e **supersede o ADR-0001**.
**A raiz era assimetria de contrato, não matemática:** `POST /registro` aceitava
`body.dayTypeId`; `POST .../rebalance/option-choice` **não aceitava tipo-de-dia nenhum** —
resolvia sempre pelo weekday, montava o roster daquele tipo e rejeitava com **404** um gatilho
fora dele. E o app manda o `triggerMealId` do cardápio **EXIBIDO**, sem gatear por override.
**MORREU:** (1) **KI-005** — sob override a prévia era 404 para **qualquer** refeição, com ou
sem registro: o diferencial do produto estava **inalcançável**; (2) **KI-002 Sintoma A** no
caminho do override — com o roster certo o `mealId` do evento **casa sozinho**, a refeição
registrada sai das alavancas e seu consumo real entra no total. **Nenhuma troca de chave de
pareamento foi necessária** — a pergunta do ADR-0001 ("`mealId` ou `position`?") era a **errada**:
o defeito estava em **qual dia o motor recebia**. A opção (b) (parear por `position`) foi
rejeitada **por medição**: verificado por reversão que ela NÃO mata o KI-005, e obrigaria a
inventar regra de desempate para colisão que o motor não tem.
Entregue: `OptionChoiceRequest` ganha `dayTypeId?: string` (**aditivo** — cliente antigo não
quebra); `rebalance.service` bloco 4 resolve o override (validado pertencer ao plano ativo, 404
com a MESMA mensagem do `/registro`) ou o weekday, e o roster usa o tipo resolvido — copiando a
**forma** do `registro.service.ts`, não uma variação (três formas diferentes foi a causa raiz);
`RebalancePreviewSheet` + `HomeScreen` propagam o override, com `dayTypeId` **nas deps do
`useEffect`** (senão trocar de tipo com a sheet aberta manda o corpo velho).
**Corolário que isto DECIDE** e que nenhum artefato respondia: sob override o dia é avaliado
contra a faixa-alvo do tipo **EXIBIDO** (o roster é do tipo resolvido, logo o alvo também).
**RESÍDUO ACEITO, não escondido** (spec A2): (a) faz o motor seguir o tipo exibido, então no
caminho "registrei sob B → voltei para o tipo padrão A → escolho em A" o evento de B segue
invisível ao motor, enquanto `/today?dayTypeId=A` mostra o badge por **posição** (009/FR-002).
A divergência badge-vs-motor **sobrevive ali** — coerente com FR-013a da 004, mas resíduo.
Fechá-la exigiria decidir se o `/today` do tipo padrão deveria contar evento de outro tipo, o
que **contradiz** aquele FR: decisão separada. O caso que a pinava deixou de ser `[BUG]` e virou
`014/A2`, com o porquê no teste.
**NÃO mudou, cada um com prova:** caminho SEM override (`rebalance.e2e-spec.ts` verde com
`git diff` **vazio**, 15 casos calibrados no seed — a prova de FR-003) · `packages/core` com
`git diff` vazio (a matemática não mudou, só o dia que ela recebe) · pareamento por `mealId` e
leitura do consumo type-agnostic, ambos intactos (restringir a leitura ao tipo resolvido
ressuscitaria o bug que a 004 corrigiu) · nada persiste (0 escritas no service) · sem migration.
TDD: 5 casos vistos vermelhos antes. **Correção do próprio plano durante a execução:** a task
mandava "documentar o corpo no Swagger espelhando o `/registro`", mas **nenhum dos 6 POSTs da
API documenta `requestBody`** — não havia padrão a espelhar, e criar um modelo só para este
endpoint seria inconsistente; foi para a descrição do `@ApiOperation`. OpenAPI regenerado.
Resultado: **core 164 · db 20 · api 151 (147 + 4) · mobile 24** verdes; lint 0 errors,
check-types e Prettier limpos. **Pendente e explícito:** smoke manual no simulador (o chip de
opção sob override abre a prévia em vez de erro) — requer julgamento manual, designado ao Bruno.
Artefatos: `specs/014-rebalance-ciente-do-override/` (spec/plan/tasks) + `docs/adr/0003-*.md`.

Feature **013-construtor-de-cenario** (construtor de cenário para as suítes e2e —
candidato 04 da revisão de arquitetura): **implementada e testada** (2026-07-26).
Infraestrutura de teste, **nenhum endpoint muda, nenhuma expectativa muda**. Gatilho: o
**KI-004** — a suíte e2e só passava **de segunda a sexta** e ninguém sabia, porque as suítes
se apoiavam em detalhes do fixture de produção, inclusive o calendário. Medido no
levantamento: **330** linhas de fixture em `escopo-plano`, **234** em `colisao-position`,
**460** em `relatorio`; `isoDaysAgo` duplicado **byte-a-byte em 5 arquivos**; **6** assinaturas
diferentes de inserir `meal_event`; a ordem reversa de FK reescrita a cada suíte nova. Teste
caro não é escrito — foi o que aconteceu com o eixo de dois tipos-de-dia.
Entregue **`packages/db/src/testing/scenario.ts`** no subpath **`@bamboo/db/testing`**
(deliberadamente FORA do barril `src/index.ts`, para não virar dependência alcançável do
runtime da API): 3 funções (`buildScenario`, `localDate`, `everyWeekday`) + handle de 4 membros
(`ids`, `addEvents`, `clearEvents`, `destroy`) compram 11 tabelas, ordem de FK nos dois
sentidos, atomicidade e resolução determinística de pré-requisitos. `packages/db` ganhou
`vitest.config.ts` + script `test` (não tinha) e passou a excluir `*.test.ts` do build.
**Desenho por design-it-twice:** 3 interfaces desenhadas em paralelo — declarativo, builder
fluente, presets nomeados — julgadas por profundidade, localidade e risco. Venceu o
**declarativo** por motivo empírico: `escopo-plano` já tinha extraído à mão um
`criarTipoDia({planId, nome, positions, foodId, gramas})` e o `seed.ts` tem
`insertMeal`/`insertOption`/`insertItem` — a árvore imperativa do **mesmo valor**. O
discriminante real foi o **endereçamento**: `{dayType, position}` faz `planId`, `dayTypeId` e
`patientId` do evento serem **DERIVADOS** do grafo, então o par incoerente que o KI-002
investiga é **inexpressável**. Presets perderam por crescerem por chamador (definição de
_shallow_) e por esconderem calibração _load-bearing_ (`1.6×` codifica tolerância 10% + piso
50%; fora da janela os testes de comparação de corpo passam por **vacuidade**).
**Invariantes I-1..I-9 são parte da INTERFACE**, no topo do arquivo — antes viviam em
comentário replicado por suíte. As duas que vieram do design-it-twice e eu não tinha: **I-1**
resolver pré-requisitos **antes** do primeiro insert (spec irresolvível lança sem escrever
nada ⇒ nenhum paciente órfão para os 12 `from(patient).limit(1)` **sem `where`** sortearem) e
**I-2** resolução determinística (`ORDER BY` explícito, food nunca com 0 kcal, apelidos
distintos ⇒ foods distintos). **I-4** lança em vez de devolver `Result` — desvio deliberado:
`Result` é disciplina do núcleo puro; num construtor de fixture obrigaria um `if (!r.ok) throw`
por linha de `beforeAll` e deixaria a interface mais RASA.
**Migradas como prova:** `colisao-position` (506→348) e `escopo-plano` (558→355) — **−361
linhas**, zero `insert(`/`delete(`/`getDay()` nas duas. **Equivalência provada por REVERSÃO, em
duas etapas nesta ordem:** (1) migração com um shim que mantinha os `it` **byte-idênticos** e
ainda asseria que o `dayTypeId`/opção passados à mão eram exatamente os derivados do grafo —
reversão confirmando os mesmos casos vermelhos; (2) só então o shim (48 linhas) saiu. Os
oráculos do KI-002 e os SC-007/SC-008 da 012 derrubam **exatamente os mesmos casos** antes e
depois. **YAGNI (FR-011):** saíram do desenho vencedor os campos sem chamador hoje
(`MealSpec.time`, `heightCm/weightKg`, `CycleSpec.time`, `EventSpec.items`,
`ScenarioSpec.nutritionist`).
**NÃO migram, por decisão:** `relatorio.e2e` (a resolução determinística **muda** os
denominadores nutricionais dela — re-derivar é indistinguível de regressão),
`adesao.e2e`/`ciclo.e2e` (o `beforeAll` de 315 linhas da adesão é **leitor** do plano semeado,
não montagem; os ciclos da `ciclo.e2e` são o comportamento **sob teste**) e as **8 suítes que
resolvem o seed** em vez de montar — o seam que falta ali é um **leitor**, interface diferente,
e absorvê-lo aqui deixaria este module raso. O **`seed.ts` não foi tocado**: a exigência era
que ele _pudesse_ ser chamador, provado pelo seam `executor` + um teste de rollback.
Resultado: **core 164 · db 20 (novos) · api 147 · mobile 24** verdes; `git diff` vazio nos 11
e2e não migrados; lint 0 errors, `check-types` e Prettier limpos. Artefatos:
`specs/013-construtor-de-cenario/` (spec/plan/tasks).

Feature **012-leitura-do-registro** (deepening: um leitor de `meal_event`): **implementada e
testada** (2026-07-25; gate único no `tasks.md`, aprovado após grilling de 7 decisões).
**NÃO é feature de produto — o critério de sucesso é a AUSÊNCIA de mudança**: nenhuma resposta
HTTP muda em forma, valor ou status. Existiam **5 implementations** de "qual é o registro
vigente nesta janela", cada uma com sua ordenação, seu desempate e seu escopo de plano
implícito: `registro-consumo.ts`, `adesao/adesao-consumo.ts`,
`ciclo.service.registrosDaJanela`, `relatorio.loader.ts` §1-2 e uma query inline no
`plan.service.ts` (esta **sem `ORDER BY` nenhum**). Viraram **2 modules empilhados** + 1
função de núcleo:
· **Núcleo** — `packages/core/src/registro.ts` ganhou **`eventoVigente`**: a mesma redução
last-write-wins + tombstone de `estadoVigente`, devolvendo a **linha** vencedora, com o tipo
de retorno **narrowed** (`(T & {state: EstadoRegistro}) | null`) pra nenhum chamador precisar
de cast — o cast é o atalho que apagaria o descarte do tombstone. `estadoVigente` virou
`eventoVigente(e)?.state ?? null` (equivalência bit-a-bit travada por teste sobre 10
entradas). Desempate `>`, nunca `>=`.
· **Casca (leitura)** — `apps/api/src/registro-vigente.loader.ts`, o **único** leitor de
`meal_event` no caminho de leitura: 1 query `meal_event ⋈ meal`,
`ORDER BY (logged_date, created_at, id)`, `seq = índice`, `escopo` de plano **obrigatório e
sem default** (`{kind:'plano',planId}` | `{kind:'qualquer-plano'}`).
· **Casca (nutrientes)** — `apps/api/src/consumo-real.loader.ts` **empilha**: RECEBE os
vigentes, não consulta `meal_event` (consulta `meal_event_item`, que é o snapshot do troquei),
e **não** devolve agregado do dia (`somaNutrientes` fica no call site).
**Único ganho de comportamento:** o `, id` no `ORDER BY`. `created_at` é `DEFAULT now()`
(= `transaction_timestamp()`, tomado **antes** do advisory lock do INSERT), logo empate — e
até inversão relativa à ordem de inserção — é possível, e os 4 leitores antigos resolviam pelo
primeiro que o heap devolvesse. **Ganho medido** (logger SQL do Drizzle ligado num servidor
real, contagem por request, antes vs. depois): `GET /today?dayTypeId=` **2 → 1** leitura;
`GET .../cycles/:id/report` com comparativo **6 → 4**.
**Os testes que faltavam vieram ANTES da extração** (pré-requisito não-negociável: a suíte era
cega aos dois eixos, porque todo fixture usava um plano e um tipo-de-dia) —
`apps/api/test/escopo-plano.e2e-spec.ts`, self-contained, fixture de **2 planos + 2
tipos-de-dia**: **T-A** escopo de plano e **T-D** janela do dia (caracterização, passaram
verdes de primeira) + **T-C** desempate (TDD, escrito e **visto falhar 3×** antes do leitor
novo). **Achado que salvou o teste:** as asserções óbvias de escopo são CEGAS — `/today` sem
override filtra `inArray(mealEvent.mealId, mealIds)` e, como `meal → day_type → plan`, uma
refeição nunca é compartilhada entre planos, então o evento do plano aposentado sai pelo filtro
de `mealId` **mesmo sem** o de `planId` (idem rebalance, que lê `porMeal.get(m.id)`). Os
únicos consumidores onde as duas convenções produzem números diferentes são a **adesão**
(plan-scoped e sem filtro de `mealId`) e o **caminho por `position`** do `/today?dayTypeId=`.
**Fora de escopo por DECISÃO, não esquecimento:** Q3-B e a fonte do fallback de plano
(candidato 05 — unificar muda número que a nutri já viu) · `mealId`-vs-`position` sob override
(**ADR-0001** + KI-002, precisa de decisão de produto com o teste de colisão escrito antes) ·
snapshot transacional da leitura (KI-003, pré-existente) · determinismo do caminho de
**escrita** (`registro.service.ts` ordena sem `, id` e segue arbitrário no empate — FR-001 o
exclui; o service ficou com `git diff` vazio). **Sem migration, sem endpoint novo, zero mudança
no mobile.** Saldo em `apps/api/src`: **−210 linhas** (465 apagadas nos 2 helpers mortos).
Resultado: **core 164 (157 + 7) + api 139 (132 + 7) + mobile 24** verdes, `git diff` **vazio**
nos `*.e2e-spec.ts` pré-existentes (SC-001); `tsc`/lint (0 errors)/Prettier limpos. SC-007 e
SC-008 verificados por **reversão**: unificar o escopo derruba T-A, tirar o `, id` derruba T-C.
**Descoberta colateral (KI-004):** a suíte e2e do `apps/api` só passava **de segunda a sexta**
— `rebalance.e2e-spec.ts` resolvia um alimento por nome e o seed programa sáb/dom para outro
tipo-de-dia; consertado como T000 antes de tudo (`126 passed + 6 skipped` → 132).
Artefatos novos: **`CONTEXT.md`** na raiz (glossário de domínio — não existia),
**`docs/adr/`** (primeiro ADR), KI-002/003/004 em `docs/known-issues.md`,
`specs/012-leitura-do-registro/` (spec/plan/research D1–D7/tasks).

Feature **011-relatorio-de-ciclo** (relatório de ciclo — a feature que vende, fecha o
**EP-5**): **implementada e testada, EP-5 concluído** (gates Specify→Plan e Plan→Tasks
aprovados 2026-07-20, incluindo A1 semanas relativas ao início, A2 ciclo aberto ⇒ relatório
parcial válido, A3 ciclo anterior = `closedOn` mais recente ≤ `startedOn` — desempate da 007).
`GET /nutri/patients/:patientId/cycles/:cycleId/report` atrás do `NutriKeyGuard` —
**composição de peças prontas, nenhuma régua nova**: `AdesaoService.serie()` (006, régua
única, INTOCADA — e2e de consistência trava SC-002), `CicloService.detalhe/linhaDoTempo`
(007). Núcleo novo `packages/core/src/relatorio.ts` (`fatiarSemanas`/`agregarAdesao`/
`agregarEstados`/`encontrarCicloAnterior`/`compararCiclos` — puro, reusa `mediaAdesao` da
006). Casca nova `apps/api/src/relatorio/` (module/controller/service/mapper +
`relatorio.loader.ts` — refeições esperadas por dia). **Achado/decisão do D6 no build**:
o loader NÃO estende `carregarTipoAlvo` do `adesao.service.ts` (extração cresceria demais) —
duplica a resolução Q3-B deliberadamente ("Plano B" já previsto no research), com uma
diferença consciente: fallback **vigência-aware** (plano vigente no dia via
`cycle_plan_vigencia`, não só o ativo hoje) — `adesao.service.ts` fica intocado, zero risco
à 006. DTOs em `packages/types/src/relatorio.ts` (decisão deliberada de sair da convenção
local-ao-mapper da 006/007 — consumidor futuro é a web da nutri, EP-6).
`AdesaoModule`/`CicloModule` ganharam `exports: [...]` (wiring puro) pro `RelatorioModule`
reusar os services. **Sem migration; nada persiste** (verificado ao vivo: contagens de
`meal_event`/`cycle`/`cyclePlanVigencia` idênticas antes/depois do GET). e2e novo
**self-contained** com paciente-cenário PRÓPRIO + cleanup total no `afterAll` (lição
a2894f3/KI-001 — nunca o paciente do seed, evitaria colidir com `ciclo.e2e`). Resultado:
**core 157 (138 + 19) + api e2e 132 (119 + 13)** verdes; lint/build/OpenAPI limpos;
quickstart validado manualmente ao vivo (docker+seed+curl, os 6 invariantes conferidos).
Board Notion: BAM-23 ("Adesão + relatório de ciclo") e BAM-5 (EP-5 · Acompanhamento)
fechados como Concluído, com comentário-justificativa referenciando esta feature.
Artefatos: `specs/011-relatorio-de-ciclo/` (spec/plan/tasks/research D1–D9/data-model/
contracts/quickstart).

Feature **010-fechamento-fase-1** (nutrição da alternativa na substituição +
reconciliação dos pendentes obsoletos da Fase 1): **implementada e testada, Fase 1 encerrada**
(gates aprovados 2026-07-20 — D1 = sim, sob gate; TDD estrito, commits por checkpoint na
`main`). **US1:** `GET /meal-items/:id/substitutions` devolve `nutrition` opcional por
alternativa (kcal/macros/proporções), calculada sobre as mesmas gramas equivalentes exibidas,
sob o mesmo gate de exposição do `/today` (join novo `meal_item→meal_option→meal→day_type→
plan→patient`; reuso de `nutritionFor`/`nutrientesDaPorcao` — zero matemática nova). `NutritionDto`
migrou pra `packages/types/src/nutrition.ts` (módulo neutro, evita ciclo `today ⇄ substitution`).
**US2 (hardening, sem mudança de comportamento):** `montarConsumo()` extraído de
`HomeScreen.handleRegistrar` (`apps/mobile/src/consumo.ts`, padrão 005/`swaps.ts`) — a montagem
do consumo efetivo (substituir/combinar → itens no registro) ganhou teste (`consumo.test.ts`);
e2e novo cobre "grupo sem outras alternativas → 200 + `alternatives: []`" (self-contained, sem
efeito colateral). **US3 (reconciliação):** board Notion (Backlog & Roadmap) reconciliado —
status novo **Cancelado** criado no schema do board; BAM-38/55/56/57/40 fechados como Cancelado
com justificativa (persistência de troca é via registro "troquei", 003/D3b; app já consome os 5
endpoints reais); BAM-39 → Concluído, refletindo esta feature. Docs (`docs/estado-atual.md` +
este bloco) atualizados. **Pendência explícita (FR-009):** smoke manual da 005 (roteiro de 7
passos no `quickstart.md`) não executado — a sessão de implementação tinha simulador iOS
disponível mas **sem automação de toque/gesto**; passos exigem julgamento manual (timing de
snackbar, sequência de toques). Designado ao Bruno. **Sem migration; core intocado; sem
endpoint novo.** Resultado: **core 138 + api e2e 119 (113 baseline + 6 novos) + mobile 24
(19 + 5 novos)** verdes; lint/build/tsc limpos; OpenAPI regenerado. Artefatos:
`specs/010-fechamento-fase-1/` (spec/plan/research D1–D9/data-model/contracts/quickstart).

Feature **009-sinal-rebalanceamento** (coerência da troca de tipo-de-dia após consumo):
**implementada e testada** (plan aprovado, gate Plan→Tasks 2026-06-10; desenvolvida no worktree
`009-sinal-rebalanceamento`, test-first). Duas peças, **core intocado**: (1) badge de registro
**pareado por posição** sob override — a refeição comida aparece registrada no novo tipo-de-dia
(reusa o campo `registro` existente: lógica na casca, não muda contrato; `calcularTrocaTipoDia`
devolve `{ajuste, registroPorPosition}` de uma leitura só do consumo, e o registro pareado vai
mesmo sem ajuste/`sem-acao`); (2) sinal "ajustado" **por refeição** via campo **aditivo**
`MealDto.rebalanceado: boolean` no `/today` (troca de tipo-de-dia) + seletor puro `deveSinalizar`
no app que também cobre a troca de opção (deriva do `swaps` da 005). Render: badge **display-only
sob override** (D3 — evento vive no mealId de origem) + frase de porquê (sem número, persistente).
**Sem migration; sem mudança no motor.** Resultado: **core 120 + api e2e 11 (today-daytype) +
mapper unit 4 + mobile 14 verdes**, `tsc`/lint 0 erros, OpenAPI regenerado. **Achado:** a suíte
e2e completa do `apps/api` tem **flakiness PRÉ-EXISTENTE** (independente da 009 — reproduz com a
suíte 009 excluída): `registro.e2e`/`rebalance.e2e` não limpam os `meal_event` do dia do paciente
semeado no `beforeAll`, então vazam estado entre suítes (ordem não-determinística do vitest). Cada
suíte passa **isolada**. Fica como dívida de isolamento de teste, fora do escopo da 009.
Artefatos: `specs/009-sinal-rebalanceamento/` (spec/plan/research D1–D7/data-model/contracts/quickstart/tasks).

Feature ativa mais recente: **006-metrica-adesao** (métrica de adesão a partir do registro,
só nutri): **implementada e testada** (plan aprovado "planos aprovados", Sessão 2026-06-10).
Entregue: núcleo novo `packages/core/src/adesao.ts` (`adesaoDoDia` — valor contínuo **saturado
na faixa de kcal** via `avaliarFaixa` da Fase 2, classificação dentro/fora, **flags por macro**,
cobertura — e `mediaAdesao`; 19 testes novos); casca nova `apps/api/src/adesao/` (loader batch
por período sem N+1; tipo-de-dia do alvo = snapshot dos registros com fallback no
`day_schedule` — Q3-B; pareamento por position; régua corrente; só leitura — nada persiste);
via da nutri `GET /nutri/patients/:id/adesao?from&to` atrás do `NutriKeyGuard` (`x-nutri-key`
= env `NUTRI_API_KEY`, **fail-closed**) — requisição com identidade de paciente é negada
(SC-008) e nenhuma resposta do paciente carrega adesão (SC-005/007). **Sem migration; zero
mudança no mobile.** Resultado: **core 109 + e2e 78 verdes**, lint/build/OpenAPI limpos;
commits na main (Foundational → US1 → US2–US4 → polish). Artefatos:
`specs/006-metrica-adesao/` (spec/plan/tasks/research D1–D8/data-model/contracts/quickstart).

Também concluída na mesma leva: **007-ciclo-de-acompanhamento** (ciclo como objeto):
**implementada e testada** (plan aprovado "manda ver"). Entregue: **migration 0003** —
`cycle` (1 ativo/paciente garantido por **índice único parcial**) + `cycle_plan_vigencia`
(linha do tempo 1:N de "qual plano vigia quando"); núcleo novo `packages/core/src/ciclo.ts`
(`atribuirCiclo` com desempate de fronteira fechou-e-reabriu → o aberto mais recente;
`decidirAbertura` A+C — abrir fecha o anterior, duração obrigatória; `decidirFechamento`
orientado — prazo NÃO fecha sozinho; 11 testes novos); casca nova `apps/api/src/ciclo/` na via
`/nutri` (guard compartilhado extraído pra `apps/api/src/nutri/`): abrir/fechar/linha do
tempo/detalhe (janela + vigências + registros por estado vigente)/atribuição + **`POST
/nutri/.../active-plan`** — o ato observado: flipa `is_active` E grava a vigência no ciclo
aberto, transacional (sem ciclo aberto, troca sem vigência). **Zero mudança no app do
paciente** (snapshot do `/today` idêntico — SC-003). Resultado: **core 120 + e2e 95 verdes**.
Artefatos: `specs/007-ciclo-de-acompanhamento/` (spec/plan/tasks/research D1–D8/data-model/
contracts/quickstart). Com 006+007 prontas, o **relatório de ciclo** (a feature que vende)
está destravado.

Também concluída: **008-auto-classificacao** (auto-classificação de alimentos em grupos):
**implementada e testada** (plan aprovado "manda ver" + opção 3 do gate de granularidade).
Achado que moldou o design: o dataset TACO traz a **categoria** de cada alimento (597 itens) —
sinal primário da classificação; a heurística por perfil vira guarda + fallback. Grupos por
**macro-base separando amido/fruta/vegetal** (~7: Amidos e cereais/Frutas/Vegetais/Proteínas/
Laticínios/Gorduras e oleaginosas/Açúcares) — não as 13 categorias TACO (narrariam a
substituição; arroz↔batata↔feijão seguem trocáveis). Entregue: **migration 0004**
(`food.taco_id` unique + `food.taco_category` + `fsg.origin` manual/auto); núcleo novo
`packages/core/src/classificacao.ts` (`classificarAlimento` categoria→grupo + split de Verduras
por `carbMin` + guardas basis≥1/porção[10–600] + fallback por base; `validarGabarito`; 18 testes);
`packages/db/src/groups.ts` (taxonomia canônica compartilhada); **ingest-taco ampliado** (base
completa, 582 foods, por taco*id + categoria); **seed não-destrutivo** (para de deletar grupos/
vínculos, deleta cycle antes de patient, upsert dos ~7 grupos por rename, vínculos curados
`origin='manual'`); `classify-foods.ts` (lote, relatório de cobertura, `--dry-run`,
`--validar-gabarito` exit≠0 se <90% — gatilho de reversão SC-002). Resultado: **cobertura 89,4%**
(506/566), **gabarito 16/16 = 100%**, idempotente; **core 138 + e2e 96 verdes**; mecânica de
substituição intacta (≤2%). `@bamboo/core` virou dep de `@bamboo/db` (acíclico). Artefatos:
`specs/008-auto-classificacao/`. \_Nota: 1 falha não-reproduzível observada no rebalance SC-004
durante a execução (passou em 4 runs limpos subsequentes + isolado; rebalance não foi tocado pela 008) — vigiar se reaparecer.*

Feature **005-desfazer-vs-rebalanceamento** (mobile-only): **implementada; reducer testado;
mergeada na main (`5826d1d`); smoke manual da UI pendente**. Bug: o "↺ desfazer" por-item aparecia em itens rebalanceados de
OUTRAS refeições (consequência de uma troca de opção) e, ao ser tocado, revertia só aquele item sem
recalcular — deixava o dia inconsistente (gap). Fix: consolidou a troca em `swaps[mealId] =
{chosenOptionId, previousOptionId, adjustments}` (reducer puro novo `apps/mobile/src/swaps.ts` —
estado de apresentação, fora do core); os ajustes derivados moram DENTRO da troca, então (a) o
desfazer por-item passou a depender só de `nameOverride` (mudança direta: substituir/combinar) —
FR-001/002; (b) desfazer a troca é atômico — opção + ajustes juntos (FR-003); (c) re-troca substitui
(FR-006). Caminhos de desfazer da troca: snackbar temporário ~5s (`UndoSwapToast`, FR-004) + chip da
opção default durável (FR-005). **Sem API/core/migration; tudo efêmero** (FR-007/008). Só a troca de
opção rebalanceia (FR-009). Setup: Vitest adicionado ao `apps/mobile` (não existia). Resultado:
**10 testes do reducer verdes + `tsc --noEmit` 0 + lint 0 erros**; desenvolvida no worktree
`005-desfazer-vs-rebalanceamento` e **mergeada na main** (`5826d1d`). Pendente: smoke manual da UI
(snackbar/timing — requer simulador + API/DB).
Artefatos: `specs/005-desfazer-vs-rebalanceamento/` (spec/plan/tasks/research D1–D7/data-model/quickstart).

Última concluída: **004-motor-le-registro**
(Fase 4 — o motor de rebalanceamento lê o registro): **implementada e testada**. Corrigiu os 2
bugs: trocar opção recalculava refeições já feitas; trocar tipo-de-dia não recalculava pelo
consumido. **Sem migration** (lê `meal_event`/`meal_event_item` da Fase 3). A matemática da engine
NÃO mudou (`rebalancearPorKcal`/`previewTrocaTipoDia` já tratavam os 2 sentidos — D1).
Entregue: núcleo ganhou `isRegistered` (obrigatório) em `RefeicaoDia` + `previewTrocaOpcao` exclui
registradas das alavancas; casca nova `apps/api/src/registro-consumo.ts` (consumo real type-agnostic
por paciente+plano+`localToday`); `rebalance.service` lê o registro na troca de opção (registradas
saem das alavancas + consumo real no total); `getToday` recalcula pelo consumido quando há
`?dayTypeId` override ativo (pareando slots por position, sem double-count; tipo padrão nunca
auto-ajusta — Q1); `registro.service` grava o snapshot COMPLETO do troquei em `meal_event_item`
(D3b — lógica de carga nova, sem mudança no mobile). Rebalanceamento segue efêmero.
**Achado documentado:** recusa `estoura-piso` só ocorre no EXCESSO; um déficit ou cabe (aumenta, sem
teto) ou vira `sem-alavanca` — a mensagem "hoje ficou abaixo" do D10 é inalcançável no v0 (coerente
com FR-009/FR-010). Resultado: **core 90 + e2e 61 verdes**, lint/build limpos; commits na main
(Foundational → US1 → US2 → US3 → polish).
Artefatos: `specs/004-motor-le-registro/` (spec/plan/tasks/research D1–D11/data-model/contracts/quickstart).
Concluídas: `001-alca-do-paciente` (Fase 0/1), `002-rebalanceamento` (Fase 2),
`003-registro-consulta` (Fase 3 — registro feito/troquei/pulei), `004-motor-le-registro`
(Fase 4 — motor lê o registro; 90 core + 61 e2e).

<!-- SPECKIT END -->

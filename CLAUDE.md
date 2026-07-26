# Bamboo — SaaS para Nutricionistas

Monorepo pnpm + Turborepo. B2B2C: a nutri paga o SaaS; o paciente usa de graça. Web/desktop pra nutri, app mobile pra paciente. Status: **pré-MVP, RN-first** — **Fases 0–4 implementadas e testadas**: fundação + alça do paciente (`001`), rebalanceamento (`002`), registro feito/troquei/pulei (`003`) e motor lê o registro (`004`). Resto da Fase 3 (ciclo/adesão/relatório/UI da nutri) e da Fase 4 (import por IA/offline/notificações) não iniciado. Em conflito com este header, o snapshot em `docs/estado-atual.md` vence.

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

Combinação (arroz+batata juntos) · rebalanceamento multi-refeição · override de tipo-de-dia + `day_selection` · logs (feito/troquei/pulei) · adesão/relatório · UI da nutri · import por IA · offline · auth de verdade (v0 = auth stub, paciente fixo por env) · notificações · índices de performance.

## Constante — LGPD

Dado de saúde desde a Fase 0: controle de acesso, criptografia, consentimento. Não é fase, é transversal. Empurrar pro fim vira dívida cara.

<!-- SPECKIT START -->

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

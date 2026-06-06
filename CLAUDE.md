# Bamboo — SaaS para Nutricionistas

Monorepo pnpm + Turborepo. B2B2C: a nutri paga o SaaS; o paciente usa de graça. Web/desktop pra nutri, app mobile pra paciente. Status: **pré-MVP, RN-first** — **Fase 0** (fundação) e **Fase 1** (alça do paciente: ver "o agora" + substituir) já implementadas e testadas (feature `specs/001-alca-do-paciente`).

## Fonte da verdade

Os planos e decisões de produto ficam em `docs/` (versionados no git, espelhados no Obsidian via symlink). Quando precisar de contexto que não está aqui, leia:

- `docs/estado-atual.md` — **snapshot do estado real** do repo (em conflito com este header, o snapshot vence).
- `specs/001-alca-do-paciente/` — feature ativa no Spec Kit (spec → plan → tasks); fonte viva da Fase 0/1.
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

Nenhuma feature ativa (aguardando a próxima). Última concluída: **004-motor-le-registro**
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

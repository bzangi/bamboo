# Implementation Plan: Leitura do registro — um leitor de `meal_event`

**Branch**: `012-leitura-do-registro` (planejada e executada na `main`, padrão 006–011) | **Date**: 2026-07-25 | **Spec**: [spec.md](./spec.md)

**Input**: [spec.md](./spec.md) + [research.md](./research.md) (D1–D7 do grilling, ratificadas)

> **Gate único** (D7): spec, plan e research derivados do grilling de 2026-07-25 sem
> re-perguntar nada. O gate a aprovar é o [tasks.md](./tasks.md).

## Summary

Deepening, não feature. **Dois modules empilhados** substituem **5** implementations do mesmo
conceito (os 4 leitores dedicados + a query inline de `plan.service.ts:131-160`):

- **`apps/api/src/registro-vigente.loader.ts`** — o único leitor de `meal_event` no caminho
  de leitura. Uma query, ordem determinística, `escopo` obrigatório, devolve lista plana
  preservando `mealId`.
- **`apps/api/src/consumo-real.loader.ts`** — empilha: **recebe** o registro vigente e só
  resolve nutrientes (`pulei` presente com zero itens / `feito` itens da opção / `troquei`
  snapshot). Não toca `meal_event` (mas lê `meal_event_item` — é o snapshot).
- **`packages/core/src/registro.ts`** ganha `eventoVigente` — a redução devolve a **linha**,
  não só o estado. Único export novo no núcleo.

Morrem `registro-consumo.ts` (240) e `adesao/adesao-consumo.ts` (225).
`ciclo.service.registrosDaJanela` (55) é absorvido. `relatorio.loader.ts` perde ~63 das 233.

**Critério de sucesso é a ausência de mudança**: nenhuma resposta HTTP muda em forma, valor
ou status (FR-008/SC-001). Sem migration, sem escrita nova, sem `apps/mobile`.

## Technical Context

**Language/Version**: TypeScript 5.9 strict (Node 20+), monorepo pnpm + Turborepo

**Primary Dependencies**: NestJS 11 + Drizzle (`apps/api`) · `@bamboo/core` (workspace) · Vitest

**Storage**: PostgreSQL 17 — **somente leitura**; nenhuma tabela nova, nenhuma migration (FR-009)

**Testing**: Vitest — unit no núcleo (`eventoVigente`, TDD) + e2e da API. Baseline do `apps/api` = **132** = 119 e2e (`test/*.e2e-spec.ts`) + 13 unit colocados (`src/**/*.unit.test.ts`), ambos no `vitest run` (`apps/api/vitest.config.ts:16`). Suíte nova limpa tudo que cria, **mesmo em falha** (lição a2894f3/KI-001)

**Target Platform**: API Node local

**Project Type**: web-service (zero mudança no mobile — FR-009)

**Performance Goals**: estritamente melhor. `/today?dayTypeId=` passa de 2 para 1 leitura de `meal_event` (SC-005); `GET .../report` de **3** range-scans por ciclo (6 com comparativo) para **2** (4 com comparativo) — o piso é 2, não 1, porque os escopos de plano divergem por decisão (A2/D2)

**Constraints**: nenhuma expectativa de teste existente pode ser alterada, nem comentário de `*.e2e-spec.ts` (SC-001)

## Contratos

### Núcleo — `packages/core/src/registro.ts`

```ts
/**
 * Evento vigente por last-write-wins + tombstone. Pura, total, robusta a array
 * fora de ordem. Devolve a LINHA vencedora (não só o estado), porque quem precisa
 * dos metadados do vencedor não deve re-derivar o máximo.
 *
 * null quando: lista vazia OU o vencedor é tombstone (state === null).
 * O tipo de retorno NARROWS `state`, para que o chamador não precise de cast —
 * o cast é o atalho que apagaria o descarte do tombstone.
 *
 * Desempate: `>` (nunca `>=`) — mantém o PRIMEIRO em empate, preservando o
 * comportamento de `estadoVigente` bit-a-bit (FR-010).
 *
 * O contrato de `seq` é ordem total ESTRITAMENTE crescente. Use índice de query
 * ordenada — NÃO `Date.getTime()`, que trunca em ms a resolução de µs do Postgres.
 */
export function eventoVigente<
  T extends { readonly seq: number; readonly state: EstadoRegistro | null },
>(eventos: ReadonlyArray<T>): (T & { readonly state: EstadoRegistro }) | null;
```

`estadoVigente` é re-expressa como `eventoVigente(eventos)?.state ?? null` — comportamento
bit-a-bit idêntico (FR-010), e segue servindo os 2 sites do caminho de escrita.
**Nada a fazer no barrel**: `packages/core/src/index.ts:11` já é
`export * from "./registro.js"`.

### Casca — `apps/api/src/registro-vigente.loader.ts`

```ts
export type EscopoPlano =
  | { readonly kind: "plano"; readonly planId: string }
  | { readonly kind: "qualquer-plano" };

export type RegistroVigente = {
  readonly eventoId: string;
  readonly date: string; // logged_date (YYYY-MM-DD)
  readonly mealId: string;
  readonly position: number; // meal.position DO EVENTO
  readonly nome: string; // meal.name DO EVENTO — ver aviso abaixo
  readonly dayTypeId: string; // snapshot do evento vigente (fonte do Q3-B)
  readonly planId: string;
  readonly state: EstadoRegistro; // nunca null — tombstone já descartado
  readonly chosenMealOptionId: string | null;
};

/**
 * O ÚNICO leitor de meal_event no caminho de leitura.
 * 1 query (meal_event ⋈ meal) com ORDER BY (logged_date, created_at, id);
 * agrupa por (date, mealId); seq = índice; eventoVigente; descarta tombstone.
 *
 * ORDEM DE SAÍDA: primeira aparição de cada (date, mealId) na query ordenada —
 * exatamente o que o agrupamento por Map produz hoje. NÃO é a ordem do created_at
 * do evento VENCEDOR: trocar isso mudaria quem ganha uma colisão de position em
 * `relatorio.loader.ts:225-229` e a ordem do array de `registros` do ciclo,
 * que está pinada em `ciclo.e2e-spec.ts:487-506`. NUNCA ordenar por position
 * (FR-003/ADR-0001).
 *
 * from === to ⇒ janela de um dia.
 */
export function carregarRegistroVigente(
  db: Db,
  args: {
    readonly patientId: string;
    readonly from: string;
    readonly to: string;
    readonly escopo: EscopoPlano; // obrigatório, sem default (D2)
  },
): Promise<ReadonlyArray<RegistroVigente>>;
```

> **`nome` não tem consumidor.** O relatório pega o nome das refeições do tipo **alvo**
> (`relatorio.loader.ts:203-215`), não do evento. O campo existe porque o join já o traz;
> **não** trocar a fonte do nome do roster por ele — mudaria as refeições esperadas.

### Casca — `apps/api/src/consumo-real.loader.ts`

```ts
import type { ItemNutricional } from "@bamboo/core"; // packages/core/src/nutrition.ts:49

export type RefeicaoConsumida = {
  readonly mealId: string;
  readonly position: number;
  readonly state: EstadoRegistro;
  readonly itens: ReadonlyArray<ItemNutricional>; // [] em `pulei` — presente, vazio
};

/**
 * Empilha sobre o registro vigente. NÃO consulta meal_event (FR-006); consulta
 * meal_event_item, que é o snapshot do troquei.
 * 3 queries batch: opção cumprida (fallback D9) + itens planejados + snapshot.
 * NÃO devolve agregado do dia (FR-007) — somaNutrientes fica no call site que precisar.
 */
export function carregarConsumoReal(
  db: Db,
  vigentes: ReadonlyArray<RegistroVigente>,
): Promise<
  ReadonlyMap<
    string /* date */,
    ReadonlyMap<string /* mealId */, RefeicaoConsumida>
  >
>;
```

> **`dayTypeId` não entra em `RefeicaoConsumida`.** A adesão precisa dele para o Q3-B
> (`adesao.service.ts:184` faz `new Set(registradas.map(r => r.dayTypeId))`), e ele passa a
> vir dos **vigentes** (`RegistroVigente.dayTypeId`), pareados por `(date, mealId)` com o
> consumo. O trecho `:183-190` muda de **fonte**, não de regra — a decisão Q3-B em si é
> intocada (D5).

### Casca — `apps/api/src/ciclo/ciclo.service.ts`

`janela(patientId, cycleId)` extraída de `detalhe` (`:262-294`), **sem** `registros` (FR-011).
Ela DEVE conter os dois guards que `detalhe` hoje tem: `exigirPaciente` (`:266`) e o 404 de
"ciclo não encontrado no paciente" (`:282`) — `relatorio.service.ts:87` documenta que herda o
404 de lá. `detalhe` passa a compor `{...janela, registros}` sem repetir os guards;
`CicloDetalheResponse` e o contrato HTTP intocados.

## Migração por consumidor

| #   | Consumidor                   | Hoje                                                                                                       | Depois                                                                                                                                                                                                              |
| --- | ---------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `plan.service.ts:131-160`    | query própria de `meal_event` (`inArray(mealId, mealIds)`, **sem `ORDER BY`**) + redução própria em `:159` | `carregarRegistroVigente({from:hoje,to:hoje,escopo:{kind:'plano',planId}})` — **type-agnostic, sem filtro de `mealId` na query**; o filtro por `mealIds` vira `.filter()` em memória só para montar `estadoPorMeal` |
| 2   | `plan.service.ts:329`        | `carregarConsumoDoDia` (2ª leitura de `meal_event`)                                                        | reusa os **mesmos** vigentes de (1) + `carregarConsumoReal` + `somaNutrientes` no call site                                                                                                                         |
| 3   | `rebalance.service.ts:266`   | `carregarConsumoDoDia`, destrutura só `porMeal`                                                            | `carregarRegistroVigente` + `carregarConsumoReal`; **sem** `somaNutrientes` (não usa agregado); precisa importar `localToday` de `../local-date`                                                                    |
| 4   | `adesao.service.ts:148`      | `carregarConsumoPorPeriodo`                                                                                | `carregarRegistroVigente({from,to,escopo:{kind:'plano',planId}})` + `carregarConsumoReal`; `dayTypeId` do Q3-B passa a vir dos vigentes                                                                             |
| 5   | `relatorio.loader.ts:84-146` | query própria + redução                                                                                    | `carregarRegistroVigente({escopo:{kind:'qualquer-plano'}})`; o resto do loader (Q3-B, roster) **fica**                                                                                                              |
| 6   | `ciclo.service.ts:359-413`   | `registrosDaJanela` privada                                                                                | `carregarRegistroVigente({escopo:{kind:'qualquer-plano'}})`; o `sort` por `(date, position)` (`:410-412`) fica no ciclo                                                                                             |

**Ganho de (1)+(2):** hoje o `/today?dayTypeId=` faz duas leituras de `meal_event` com
predicados sobrepostos; depois faz uma (SC-005). E o único site sem `ORDER BY` deixa de
existir.

### A troca de shape, campo a campo (é aqui que mora o erro silencioso)

Hoje `carregarConsumoDoDia` devolve `{porMeal, consumido}` (`registro-consumo.ts:37-40`) e os
call sites desestruturam direto. O novo devolve `Map<date, Map<mealId, …>>` **sem** agregado.
Cada call site precisa indexar por data:

```ts
const vigentes = await carregarRegistroVigente(db, {
  patientId,
  from: hoje,
  to: hoje,
  escopo,
});
if (vigentes.length === 0) return {}; // ← PRESERVA plan.service.ts:333 (FR-013)
const porDia = await carregarConsumoReal(db, vigentes);
const doDia = porDia.get(hoje) ?? new Map(); // seguro SÓ depois do early-return acima
const consumido = somaNutrientes(
  [...doDia.values()].flatMap((r) => [...r.itens]),
);
```

**A ordem importa.** O early-return tem de vir do `vigentes.length === 0`, **antes** do
`?? new Map()`. Passar um `Map` vazio adiante em vez de não chamar faz
`today.mapper.ts:203-205` escolher o ramo por `position`
(`registroPorPosition ? get(position) ?? null : meal.estadoVigente`) e **apagar todos os
badges do dia**. É mudança de resposta, e `today-daytype.e2e` pode não cobrir a combinação
exata.

## Estratégia de teste

**Test-first** (Princípio IV). Ordem: os testes que faltam **antes** de qualquer extração —
foi o pré-requisito não-negociável de 2 dos 3 críticos (research.md).

| Teste                   | Tipo       | Deve passar HOJE?            | Prova                                |
| ----------------------- | ---------- | ---------------------------- | ------------------------------------ |
| **T-A** escopo de plano | e2e        | **sim** — caracterização     | as duas convenções, pinadas (SC-007) |
| **T-D** janela do dia   | e2e        | **sim** — caracterização     | evento de ontem não influencia hoje  |
| **T-C** empate de `seq` | unit + e2e | **não** — comportamento novo | determinismo (SC-008); A3 da spec    |

T-A e T-D são rede de segurança: escritos contra o código atual, precisam passar antes e
depois. T-C é o único que muda comportamento, e o comportamento antigo é arbitrário, logo não
caracterizável — o e2e dele tem de ser escrito e **visto falhar** antes do leitor novo, e
precisa asserir **qual** linha deve ganhar (não só "é sempre a mesma"), senão passa por sorte.

**T-B não entra** — é pré-requisito do candidato 05, não desta feature (D5).

## Riscos

Tabela completa em [research.md](./research.md#riscos-e-como-cada-um-é-detectado). Os dois que
governam a ordem das tasks:

1. **Os dois eixos semânticos são invisíveis para a suíte.** Fixtures usam um plano e um
   `dayType`. Por isso T-A vem antes de tudo — e por isso a asserção discriminante dele tem de
   estar na adesão ou no `/today?dayTypeId=`, não no `/today` simples (ver a nota da US2 na
   spec).
2. **A assimetria de falha decide o recorte.** Errar dentro do escopo escolhido falha
   ruidosamente (`tsc`, ou e2e de `today-daytype`/`rebalance`). Errar nos eixos deixados
   fora falharia **silenciosamente**, em número que a nutri vê. Daí D4 e D5.

## Fora de escopo

Ver [spec.md](./spec.md#fora-explicitamente). Resumo: Q3-B e fonte do fallback (candidato 05) · `mealId`-vs-`position` (ADR-0001, KI-002) · `MAX_DIAS` e 400-vs-422 · grid de refeições
esperadas · snapshot transacional (KI-003) · determinismo do caminho de escrita · renomear
`MealRow.estadoVigente` · qualquer coisa no mobile.

## Artefatos que saem junto

- `CONTEXT.md` (**novo** — não existia): termos **registro vigente**, **consumo real**,
  **escopo de plano** + o glossário de domínio que estava espalhado no `CLAUDE.md`.
- `docs/adr/0001-chave-de-pareamento-sob-override.md` (**novo diretório**).
- `docs/known-issues.md`: KI-002 (pareamento sob override, com repro) e KI-003 (leitura sem
  snapshot, pré-existente).

# Implementation Plan: Construtor de cenário para as suítes e2e

**Branch**: `013-construtor-de-cenario` (executada na `main`) | **Date**: 2026-07-26
**Input**: [spec.md](./spec.md) · design-it-twice (3 interfaces independentes + síntese)

## Summary

Um **module deep** novo em `packages/db/src/testing/scenario.ts`, exportado pelo subpath
`@bamboo/db/testing` (nunca pelo barril `src/index.ts`): **3 funções + 1 handle de 4 membros**
compram 11 tabelas, ordem de FK nos dois sentidos, atomicidade, data-calendário local,
resolução determinística de pré-requisitos e a condição de alavanca do motor.

**Escolha de interface (design-it-twice).** Três ângulos foram desenhados em paralelo —
declarativo, builder fluente, presets nomeados — e julgados por profundidade, localidade e
risco. Venceu o **declarativo**, por um motivo empírico: `escopo-plano.e2e-spec.ts:118-163` já
extraiu à mão um `criarTipoDia({planId, nome, positions, foodId, gramas})` que devolve
`position → {mealId, optionId}`, e `packages/db/scripts/seed.ts:340+` tem
`insertMeal`/`insertOption`/`insertItem` — a árvore imperativa do **mesmo valor**. A forma do
spec não é invenção: é a forma para a qual os dois call sites reais já convergiram, escrita uma
vez.

Os presets nomeados perderam por serem engenharia-reversa de dois arquivos: um terceiro cenário
exigiria batizar um quarto preset, e o module cresceria linearmente com os chamadores — a
definição de **shallow**. E o preset `heavierAlternativeAt: 1.6×` escondia calibração de que o
chamador **depende** (fora da janela, os testes de comparação de corpo passam por vacuidade).
O builder fluente perdeu o endereçamento por `{dayType, position}`, que é o que torna
inexpressável a incoerência `mealId`/`dayTypeId` do KI-002.

**Critério de sucesso é a ausência de mudança** de comportamento: nenhuma expectativa de teste
muda, nenhum endpoint muda. Sem migration.

## Technical Context

**Language/Version**: TypeScript 5.9 strict · **Dependencies**: Drizzle (`packages/db`), Vitest
**Storage**: PostgreSQL 17 — escreve **só** dado de cenário; nunca `food`/grupos/medidas
**Testing**: unit do próprio construtor (`packages/db`) + as 2 suítes e2e migradas
**Project Type**: infraestrutura de teste — **não vai ao runtime da API** (FR/A3)
**Constraints**: baseline core 164 · `apps/api` 147 · mobile 24, intacta (SC-001)

## Onde mora

`packages/db`, não `packages/core`: faz I/O, e o núcleo é TS puro sem I/O (Princípio III).
Fica do mesmo lado de `scripts/seed.ts`, que por isso **pode** virar chamador (FR-010).

Subpath `@bamboo/db/testing`, fora do barril: `apps/api` é `nodenext`/CJS e resolve a variante
`require` do `drizzle-orm` (documentado em `packages/db/src/query.ts`). Por isso o tipo do
executor deriva de `typeof db` **exportado pelo próprio `@bamboo/db`**, nunca de tipos
importados direto do `drizzle-orm`.

## Contratos

### O seam do executor — dois adapters REAIS

```ts
type DrizzleTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type Executor = typeof db | DrizzleTx;
```

Dois adapters de verdade, não um hipotético: `db` (as suítes e2e) e a transação de
`db.transaction` (o `seed.ts` já roda tudo dentro de uma, `seed.ts:218`). Regra da
implementation: abre transação **própria** só quando o executor é `db`; recebendo uma tx, usa-a
como está.

### O valor — spec do cenário

```ts
export type FoodQuery = {
  readonly name?: string; // nome exato — o idioma do seed (FR-010)
  readonly minKcalPer100g?: number; // "um qualquer, não degenerado" — o idioma e2e
};

export type ItemSpec = {
  readonly food: string; // apelido declarado em ScenarioSpec.foods
  readonly grams: number;
  readonly locked?: boolean; // default false
  readonly group?: string | null; // nome canônico (GRUPOS_CANONICOS); default null
};

export type OptionSpec = {
  readonly label: string; // rótulo no banco E chave de lookup
  readonly isDefault?: boolean; // default: a primeira opção da refeição
  readonly items: ReadonlyArray<ItemSpec>;
};

export type MealSpec = {
  readonly position: number; // chave de lookup dentro do tipo-de-dia
  readonly name?: string; // default `${label do tipo} pos${position}`
  readonly options: ReadonlyArray<OptionSpec>;
};

export type DayTypeSpec<D extends string = string> = {
  readonly label: D; // único no cenário INTEIRO
  readonly name?: string; // default: label
  readonly meals: ReadonlyArray<MealSpec>;
};

export type PlanSpec<D extends string = string> = {
  readonly label: string; // único no cenário inteiro
  readonly name?: string;
  readonly active?: boolean; // default true
  readonly dayTypes: ReadonlyArray<DayTypeSpec<D>>;
  readonly schedule?: Readonly<Record<number, D>>; // weekday 0-6 → label
};

export type PlanWindowSpec = {
  // cycle_plan_vigencia
  readonly plan: string;
  readonly fromDaysAgo: number;
  readonly toDaysAgo?: number | null; // omitido/null = vigência corrente
};

export type CycleSpec = {
  readonly label: string;
  readonly startedDaysAgo: number;
  readonly closedDaysAgo?: number | null; // omitido/null = ABERTO
  readonly expectedDurationDays: number;
  readonly planWindows?: ReadonlyArray<PlanWindowSpec>;
};

export type PatientSpec<D extends string = string> = {
  readonly label?: string; // default 'principal'
  readonly name?: string;
  readonly exposure?: "hidden" | "percent" | "macros" | "full_kcal";
  // Pina a RÉGUA no paciente. Sem isso, a calibração de `colisao-position`
  // depende dos defaults 10/50 semeados na nutricionista (seed.ts:260-261) —
  // acoplamento silencioso que a migração deve matar, não herdar.
  readonly bandTolerancePct?: number | null;
  readonly floorPct?: number | null;
  readonly plans?: ReadonlyArray<PlanSpec<D>>;
  readonly cycles?: ReadonlyArray<CycleSpec>;
};

/** Refeição endereçada por (label do tipo-de-dia, position). Plano e paciente
 *  são DERIVADOS — labels são únicos no cenário. Não é path string. */
export type MealRef<D extends string = string> = {
  readonly dayType: D;
  readonly position: number;
};

export type EventSpec<D extends string = string> = {
  readonly meal: MealRef<D>;
  readonly state: "feito" | "troquei" | "pulei" | null; // null = anulação
  readonly daysAgo: number; // 0 = hoje, data-calendário LOCAL
  readonly time?: string; // created_at; default '12:00:00'
  readonly option?: string; // label; default = a padrão. Forçado a null em pulei/anulação
  readonly id?: string; // uuid explícito (desempate determinístico)
};

export type ScenarioSpec<D extends string = string> = {
  readonly label: string; // prefixo dos nomes gerados (rastreabilidade)
  readonly foods?: Readonly<Record<string, FoodQuery>>;
  readonly patients: ReadonlyArray<PatientSpec<D>>;
  readonly events?: ReadonlyArray<EventSpec<D>>;
};
```

`D` é o **único** type-param: o union dos labels de tipo-de-dia, inferido do spec. Converte
"typo em `dayType: 'A'` só quebra em runtime" em erro de `tsc` no caminho quente (`MealRef`,
`EventSpec`, `schedule`). Planos, ciclos e apelidos de food seguem `string` com erro de runtime
que **lista os labels existentes** — o custo de tipo não se paga ali.

### O handle

```ts
export type MealIds = {
  readonly mealId: string;
  readonly defaultOptionId: string;
  option(label: string): string; // LANÇA listando os labels — nunca `map.get(x)!`
};

export type ScenarioIds<D extends string = string> = {
  readonly nutritionistId: string;
  patient(label?: string): string; // omitido = 'principal'
  plan(label: string): string;
  dayType(label: D): string;
  meal(ref: MealRef<D>): MealIds;
  cycle(label: string): string;
  food(alias: string): string;
};

export type Scenario<D extends string = string> = {
  readonly ids: ScenarioIds<D>;
  addEvents(
    events: ReadonlyArray<EventSpec<D>>,
  ): Promise<ReadonlyArray<string>>;
  clearEvents(): Promise<void>; // por patientId — pega o que a casca escreveu via POST
  destroy(): Promise<void>; // ordem reversa de FK, idempotente
};
```

### A interface — 3 funções

```ts
export function buildScenario<D extends string>(
  spec: ScenarioSpec<D>,
  opts?: { readonly executor?: Executor },
): Promise<Scenario<D>>;

export function localDate(daysAgo?: number): string; // 'YYYY-MM-DD' LOCAL, nunca UTC
export function everyWeekday<D extends string>(
  l: D,
): Readonly<Record<number, D>>;
```

### Invariantes — parte da interface, não da implementation

Hoje estes fatos vivem em comentário replicado por suíte. Escritos uma vez, viram locality de
contrato.

- **I-1 ORDEM** — resolve nutricionista + foods + grupos **antes** do primeiro insert. Spec
  irresolvível lança **sem ter escrito nada**. É o que impede paciente órfão de ser sorteado
  pelos 12 `from(patient).limit(1)` sem `where`.
- **I-2 DETERMINISMO** — nutricionista e foods resolvidos com `ORDER BY` explícito; food sempre
  `kcal_per_100g > 0`; apelidos distintos ⇒ foods distintos, ou lança. (Hoje são 5
  `limit(1|2)` sem `order by`, e `relatorio.e2e:103-106` sem nem a guarda de kcal.)
- **I-3 PACIENTE SEMPRE PRÓPRIO** — nunca o do seed (lição a2894f3/KI-001). O module **não**
  resolve paciente semeado: é outro seam.
- **I-4 LANÇA, não devolve `Result`** — desvio deliberado e adjacente ao Princípio III: a
  disciplina do `Result` é do **núcleo puro**; num construtor de fixture obrigaria um
  `if (!r.ok) throw` por linha de `beforeAll` e deixaria a interface mais **rasa**. A mensagem
  lista os labels/apelidos existentes.
- **I-5 VALIDA antes de inserir** — dois ciclos abertos no mesmo paciente (índice único parcial
  `cycle_one_active_per_patient`, 007), label duplicado, `position` duplicada num tipo, opção
  default ausente. Erro com mensagem, não erro cru do Postgres.
- **I-6 NÃO sobe Nest, NÃO fala HTTP, NÃO chama `pool.end()`** — seam diferente.
- **I-7 NÃO cria** `food` / `substitution_group` / `food_substitution_group` /
  `food_household_measure` — são pré-requisito com semântica de upsert-com-história, não
  cenário.
- **I-8 Tudo `readonly`**; o handle é fechado sobre os próprios ids (dois cenários no mesmo
  arquivo não interferem).
- **I-9 Obrigação do chamador** — `await s.destroy()` no `afterAll`.

## YAGNI aplicado (FR-011)

Campos que o desenho vencedor propunha e que **saíram**, por não terem chamador hoje:
`MealSpec.time` (`meal.horario`), `PatientSpec.heightCm/weightKg`, `CycleSpec.time`,
`EventSpec.items` (snapshot de `troquei` — nenhuma das 2 suítes migradas cria um),
`ScenarioSpec.nutritionist` (as 5 suítes **resolvem** a existente; criar uma não tem chamador —
e resolver simplifica `destroy()`, que passa a nunca apagar nutricionista).

Ficaram, com chamador nomeado: `FoodQuery.name` (idioma do `seed.ts`, exigido por FR-010 para o
seam ser real), `state: null` (é o tipo da coluna — omiti-lo faria o tipo mentir).

## Migração por suíte

| Suíte                                                                                                 | Fixture hoje | Depois | Decisão                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------- | ------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `colisao-position.e2e-spec.ts`                                                                        | **234**      | ~35    | **Migra 1º** — menor, e a pré-condição "o cenário produz `rebalanceado`" é oráculo embutido contra o pior risco (calibração 160g/100g sair da janela)                                                                                            |
| `escopo-plano.e2e-spec.ts`                                                                            | **330**      | ~60    | **Migra 2º** — cobre 2 planos, 3 tipos, evento no plano aposentado, os 4 uuids do desempate. Apaga o `criarTipoDia` local                                                                                                                        |
| `relatorio.e2e-spec.ts`                                                                               | 460          | —      | **Dirigida, depois de 2 chamadores.** Os denominadores `4/8` e `14/34` (`:785-787`) derivam dos 2 foods arbitrários que o Postgres devolveu; a resolução determinística (I-2) **muda** esses números, e re-derivar é indistinguível de regressão |
| `adesao.e2e`, `ciclo.e2e`                                                                             | parcial      | —      | O `beforeAll` da adesão é **leitor** do plano semeado (alimenta `adesaoDoDia` para não hardcodar expectativa) — não é montagem. Os ciclos da `ciclo.e2e` são o comportamento **sob teste**                                                       |
| `today`, `today-options`, `today-daytype`, `combine`, `substitutions`, `rebalance`, `registro`, `app` | —            | —      | **O construtor não as ajuda, hoje nem depois.** Fazem zero insert de plano: **resolvem** o seed. A dor delas é um leitor — outro module, outro seam, outra interface                                                                             |
| `scripts/seed.ts`                                                                                     | —            | —      | **Não migra** (A2). A exigência é que **possa**; prova-se pelo seam `executor` + cobertura de forma, sem tocar o arquivo                                                                                                                         |

**Também fora deste seam** (duplicação real, mas de HTTP/Nest): bootstrap do Nest (17×),
`NUTRI_KEY` (5×), `nutriGet` (4×), `app?.close()`/`pool.end()` (18×). Um `bootstrapE2e()` em
`apps/api/test/` resolve; engrossar **esta** interface com isso a deixaria rasa.

## Bugs latentes que a migração corrige de graça

Achados no levantamento, não procurados:

1. **`relatorio.e2e-spec.ts:457-461` deleta `mealEvent` sem apagar `mealEventItem` antes** — a
   FK não tem cascade (`schema.ts:262`). Passa **por sorte**: a suíte não cria nenhum
   `meal_event_item`. Qualquer teste de `troquei` com snapshot ali quebraria o teardown.
2. **`relatorio.e2e-spec.ts:103-106` faz `from(food).limit(2)` sem `where`** — pode devolver
   alimento de 0 kcal e degenerar o alvo silenciosamente.

Ambos ficam impossíveis por construção (I-2, e `destroy()` na ordem certa). Não são consertados
nesta feature (a `relatorio.e2e` não migra agora) — ficam registrados aqui.

## Riscos

| #   | Risco                                                                                             | Detecção                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | A migração muda uma expectativa sem ninguém notar                                                 | SC-001 + `git diff` nos casos de teste: só o `beforeAll`/`afterAll` pode mudar; os `it` ficam byte-idênticos                                |
| R2  | A calibração 160g/100g sai da janela e os 4 casos de comparação de corpo passam por **vacuidade** | A pré-condição `expect(outcome.kind).toBe('rebalanceado')` já existe na suíte e falha alto. Reforçada por pinar tolerância/piso no paciente |
| R3  | `destroy()` deixa resíduo e contamina os 12 `from(patient).limit(1)`                              | Teste do construtor (SC-005): contagens das tabelas voltam ao valor de antes                                                                |
| R4  | O subpath `@bamboo/db/testing` não resolve no `nodenext`/CJS do `apps/api`                        | `tsc --noEmit` no `apps/api` + a suíte migrada rodando                                                                                      |
| R5  | A transação própria conflita com o `fileParallelism: false` / pool singleton                      | I-6 (nunca `pool.end()`) + suíte completa verde                                                                                             |

## Fora de escopo

Ver [spec.md](./spec.md#fora-explicitamente).

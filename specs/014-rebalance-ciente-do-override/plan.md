# Implementation Plan: A prévia de rebalanceamento passa a enxergar o override

**Branch**: `014-rebalance-ciente-do-override` (executada na `main`) | **Date**: 2026-07-26
**Input**: [spec.md](./spec.md)

## Summary

A mudança é **pequena e localizada**, e é isso que faz (a) ser a escolha certa: o bug não estava
na matemática nem no pareamento, estava em **qual dia o motor recebe**. Um campo opcional no
contrato + a mesma resolução de tipo-de-dia que `/registro` já tem, e os dois defeitos morrem.

Três arquivos de produção mais o app:

| Onde                                                     | O que                                                                      |
| -------------------------------------------------------- | -------------------------------------------------------------------------- |
| `packages/types/src/rebalance.ts`                        | `OptionChoiceRequest` ganha `dayTypeId?: string` (aditivo)                 |
| `apps/api/src/rebalance/rebalance.service.ts`            | resolve o tipo-de-dia do override quando presente; senão weekday (bloco 4) |
| `apps/api/src/rebalance/rebalance.controller.ts`         | só docs Swagger do campo novo                                              |
| `apps/mobile/src/{HomeScreen,RebalancePreviewSheet}.tsx` | propaga o `dayTypeId` do override                                          |

**`packages/core` fica com `git diff` vazio.** Sem migration. Nada persiste.

## Technical Context

**Dependencies**: NestJS 11 + Drizzle · `@bamboo/types` · Expo/RN
**Storage**: PostgreSQL — **somente leitura** neste caminho
**Testing**: e2e da API (`colisao-position` muda de propósito; `rebalance.e2e` não pode mudar)
**Constraints**: core 164 · db 20 · mobile 24 intactas; `rebalance.e2e` **sem uma expectativa
alterada** — é a prova de FR-003

## Contratos

### `packages/types/src/rebalance.ts` — aditivo

```ts
export interface OptionChoiceRequest {
  readonly triggerMealId: string;
  readonly chosenOptionId: string;
  /**
   * Override de tipo-de-dia da SESSÃO (opcional), espelhando
   * `RegistroRequest.dayTypeId`. Presente ⇒ o dia que o motor considera é o desse
   * tipo: roster, alavancas e faixa-alvo saem dele. Ausente ⇒ `day_schedule` do
   * weekday, o comportamento de sempre.
   *
   * Existe porque sem ele a prévia era INALCANÇÁVEL sob override: o roster vinha
   * do weekday e o gatilho do tipo exibido caía num 404 (KI-005).
   */
  readonly dayTypeId?: string;
}
```

O campo é **opcional**, então cliente antigo não quebra (SC/edge case).

### `apps/api/src/rebalance/rebalance.service.ts` — o bloco 4

Hoje:

```ts
// 4. day_type do dia corrente (weekday do servidor; mesma resolução do /today).
const weekday = new Date().getDay();
const [sched] = await this.db.select(...).from(schema.daySchedule)...
if (!sched) throw new NotFoundException('sem programação para o dia corrente');
```

Depois — **exatamente** a forma do `registro.service.ts:120-140`, não uma variação:

```ts
// 4. day_type em vigor: override do corpo (validado pertencer ao plano ativo) OU
//    o default do weekday. MESMA resolução do /today e do POST /registro — a
//    assimetria entre os três é justamente o que criava o KI-005.
let dayTypeId: string;
if (body.dayTypeId) {
  const [dt] = await this.db
    .select({ id: schema.dayType.id })
    .from(schema.dayType)
    .where(and(eq(schema.dayType.id, body.dayTypeId), eq(schema.dayType.planId, pln.id)))
    .limit(1);
  if (!dt) throw new NotFoundException('tipo-de-dia não encontrado no plano do paciente');
  dayTypeId = dt.id;
} else {
  const weekday = new Date().getDay();
  const [sched] = await this.db.select({ dayTypeId: schema.dayType.id })...;
  if (!sched) throw new NotFoundException('sem programação para o dia corrente');
  dayTypeId = sched.dayTypeId;
}
```

E o roster (`:177`) passa a filtrar por `dayTypeId` em vez de `sched.dayTypeId`. **Nada mais
muda no service.**

### O que NÃO muda, e por que cada um importa

- **O pareamento segue por `mealId`** (`:285-286`, `porMeal.get(m.id)`). Com o roster correto o
  `mealId` do evento casa sozinho — é a consequência direta de (a), e o motivo pelo qual (b)
  (parear por `position`) ficou desnecessária. Não "consistentificar" nada aqui.
- **A leitura do consumo segue type-agnostic** (`escopo: {kind:'plano', planId}`, sem filtro de
  tipo-de-dia). Restringi-la ao tipo resolvido faria a refeição comida noutro tipo desaparecer
  do total — o bug que a 004 corrigiu, ressuscitado.
- **`packages/core` intocado.** `previewTrocaOpcao` recebe o dia; quem monta o dia é a casca.
- **A validação do gatilho** (`:243-247`) fica onde está. Ela passa a ser relativa ao tipo
  resolvido, o que é exatamente o desejado: pedir prévia de refeição de **outro** tipo segue 404.

### `apps/mobile` — propagação

`RebalancePreviewSheet` ganha uma prop `dayTypeId?: string` e a repassa no corpo.
`HomeScreen` já tem o estado do override (`dayTypeId`, o mesmo que alimenta
`overrideActive={dayTypeId !== undefined}`) — passa adiante.

⚠️ O `useEffect` da sheet tem `[meal, option]` como deps. Com o campo novo, `dayTypeId` **entra
nas deps** — senão trocar de tipo-de-dia com a sheet aberta mandaria o corpo velho.

## Estratégia de teste

**Test-first**, e aqui há uma sutileza que decide a ordem: os 2 casos `KI-005` de
`colisao-position.e2e-spec.ts` hoje **asserem o 404**. Eles são caracterização de bug — a spec
diz explicitamente que devem ser invertidos quando a correção vier (está escrito no cabeçalho do
arquivo: _"as asserções marcadas `[BUG]` devem ser invertidas de propósito — falhar aqui é o
sinal de que a correção pegou"_).

Então a ordem é:

1. **Inverter** os 2 casos do `KI-005` para asserir 200 + prévia, e **ver falhar** (ainda 404).
2. **Adicionar** o par novo da US2: mesmo registro sob B, gatilho **em B** → a prévia **muda**.
   Ver falhar (hoje daria 404).
3. Implementar até os dois passarem.
4. Conferir que o caso `[BUG]` original (gatilho em **A**, registro em B → prévia idêntica)
   **continua verde** — é o resíduo A2, e ele tem de ser pinado, não apagado. Reescrever o
   comentário dele: deixou de ser "bug" e passou a ser "consequência decidida de (a)".

| Teste                                                | Deve passar hoje?                       |
| ---------------------------------------------------- | --------------------------------------- |
| KI-005 invertido (200 sob override)                  | **não** — 404                           |
| US2: gatilho em B, registro em B muda a prévia       | **não** — 404                           |
| US3: `dayTypeId` de outro plano → 404                | não existe ainda                        |
| A2 (resíduo): gatilho em A, registro em B → idêntico | **sim**, e continua                     |
| `rebalance.e2e` inteiro (sem override)               | **sim**, e continua sem mudar uma linha |

## Riscos

| #   | Risco                                                                      | Detecção                                                                                  |
| --- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| R1  | Mudar o caminho **sem** override sem perceber                              | `rebalance.e2e-spec.ts` verde com `git diff` vazio (SC-003) — 15 casos calibrados no seed |
| R2  | Restringir a leitura do consumo ao tipo resolvido "por simetria"           | O caso do resíduo A2 e o total do dia mudariam; o teste da US2 pega                       |
| R3  | A sheet do app mandar `dayTypeId` velho                                    | `dayTypeId` nas deps do `useEffect`                                                       |
| R4  | O 404 do gatilho desaparecer junto (virar 200 para refeição de outro tipo) | Teste da US3 caso 2                                                                       |
| R5  | OpenAPI desatualizado                                                      | Regenerar no done-gate                                                                    |

## Fora de escopo

Ver [spec.md](./spec.md#fora-explicitamente). O resíduo A2 fica em KI-002.

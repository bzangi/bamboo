# Contrato — Núcleo puro (`packages/core/src/registro.ts`)

Funções puras: sem I/O, sem `throw`, sem mutação; entradas `readonly`/`ReadonlyArray`; erro como `Result`. **A casca alimenta o core com valores já resolvidos do banco** (grupos de equivalência, `is_default` da opção, `seq`) — o core nunca recebe nem confia em ids de grupo vindos do cliente.

## Tipos de domínio

```ts
export type EstadoRegistro = "feito" | "troquei" | "pulei";

// Item efetivamente consumido. groupIdEsperado e groupId são RESOLVIDOS NO BANCO
// pela casca (meal_item.substitutionGroupId e food_substitution_group), NUNCA do payload.
export type ItemConsumido = {
  readonly groupIdEsperado: string; // grupo do item do plano substituído (DB)
  readonly groupId: string;         // grupo do alimento consumido (DB)
  readonly gramas: number;
};

// Adequação no momento do "feito" (deriva troquei, FR-003). A casca MONTA esta DU:
//  - resolve is_default da chosenOptionId → se não-default emite "opcao-nao-default";
//  - resolve grupos dos itens no banco → emite "substituicao-combinacao" (itens não-vazio);
//  - sem opção não-default e sem itens → passa adequacao = null (→ feito).
export type Adequacao =
  | { readonly kind: "substituicao-combinacao"; readonly itens: ReadonlyArray<ItemConsumido> }
  | { readonly kind: "opcao-nao-default"; readonly mealOptionId: string };

export type ClassificacaoError =
  | { readonly kind: "consumo-fora-do-grupo" }
  | { readonly kind: "consumo-invalido" };

// Evento append-only já materializado pela casca. `seq` = ordem total estritamente
// crescente por (paciente, refeição, dia). state null = anulação (desfazer).
export type EventoRegistro = {
  readonly seq: number;
  readonly state: EstadoRegistro | null;
};

export type AlvoRegistro =
  | { readonly kind: "marcar"; readonly estado: EstadoRegistro }
  | { readonly kind: "desfazer" };

export type DecisaoRegistro =
  | { readonly kind: "inserir"; readonly state: EstadoRegistro | null } // null = anulação
  | { readonly kind: "no-op" };

export type OAgora =
  | { readonly kind: "refeicao"; readonly mealId: string }
  | { readonly kind: "dia-concluido" };
```

> **`seq` — origem e desempate**: a casca materializa `seq` a partir de `created_at` (precisão de microssegundo via `now()`). O **advisory lock por (paciente, refeição, dia)** (ver http-registro) serializa os INSERTs do mesmo escopo → `created_at` é **estritamente crescente** por escopo, sem empate. O core usa `seq` (não a ordem do array) e é robusto a arrays embaralhados.

## Funções

### `classificarEstado` — deriva feito/troquei/pulei (FR-002, FR-003, FR-004)

```ts
classificarEstado(input: {
  readonly marcacao: "consumiu" | "nao-consumiu";
  readonly adequacao: Adequacao | null;
}): Result<EstadoRegistro, ClassificacaoError>
```

- `marcacao = "nao-consumiu"` → `ok("pulei")` (adequação ignorada).
- `marcacao = "consumiu"`, `adequacao = null` → `ok("feito")`.
- `marcacao = "consumiu"`, `adequacao.kind = "opcao-nao-default"` → `ok("troquei")`.
- `marcacao = "consumiu"`, `adequacao.kind = "substituicao-combinacao"`:
  - **itens vazio** (`itens.length === 0`) → `err({ kind: "consumo-invalido" })` (troquei por substituição exige ≥1 item; a casca nunca monta este variante sem itens).
  - para cada item, **grupo antes de gramas**: `groupId !== groupIdEsperado` → `err({ kind: "consumo-fora-do-grupo" })`; senão `gramas <= 0` → `err({ kind: "consumo-invalido" })`.
  - todos válidos → `ok("troquei")`.

Edge "troca desfeita antes de marcar" (US2 cen.3): a casca passa `adequacao = null` → `feito`.

### `estadoVigente` — last-wins + tombstone (FR-010, FR-011)

```ts
estadoVigente(eventos: ReadonlyArray<EventoRegistro>): EstadoRegistro | null
```

- Lista vazia → `null`.
- Senão, o `state` do evento de **maior `seq`**. Se esse `state` é `null` (anulação) → `null` (não-registrada).
- Total (nunca falha). Robusto a array fora de ordem.

### `decidirRegistro` — idempotência alvo-vs-vigente (FR-012)

```ts
decidirRegistro(input: {
  readonly vigente: EstadoRegistro | null;
  readonly alvo: AlvoRegistro;
}): DecisaoRegistro
```

- `alvo = { kind:"marcar", estado:E }`: se `vigente === E` → `{ kind:"no-op" }`; senão `{ kind:"inserir", state:E }`.
- `alvo = { kind:"desfazer" }`: se `vigente === null` → `{ kind:"no-op" }`; senão `{ kind:"inserir", state:null }`.

> **Limitação v0 consciente (correção de conteúdo do troquei)**: a idempotência é por **rótulo de estado**. Alterar o *conteúdo* de um troquei já vigente (outra opção não-default, outros alimentos/gramas) **não** é feito re-tocando "feito" — pela UX a refeição registrada exibe o estado, não a UI de troca. Para mudar o consumo, o paciente **desfaz** (→ vigente `null`) e **re-registra** com o novo consumo (que então insere, pois vigente é `null`). Logo a comparação por rótulo é suficiente e não há perda silenciosa: o caminho de UX para corrigir um troquei passa por `desfazer`. Correção direta troquei→troquei-distinto **sem desfazer** está fora de escopo no v0.

### `derivarOAgora` — invariante "o agora" (FR-006, FR-007, FR-008, FR-013)

```ts
derivarOAgora(input: {
  readonly refeicoes: ReadonlyArray<{ readonly mealId: string; readonly ordem: number }>;
  readonly vigentes: ReadonlyArray<{ readonly mealId: string; readonly estado: EstadoRegistro | null }>;
}): OAgora
```

- Ordena `refeicoes` por `ordem`; retorna a 1ª cujo estado vigente é `null` (não-registrada) → `{ kind:"refeicao", mealId }`.
- **Ausência em `vigentes`** (refeição sem nenhum evento — não retornada pela query) é **equivalente a estado `null`** (não-registrada). A função normaliza `estado ?? null`; nunca compara `=== null` sobre um lookup que pode ser `undefined`.
- Todas com estado → `{ kind:"dia-concluido" }`. Lista de refeições vazia → `{ kind:"dia-concluido" }` (sem erro).
- Edge "refeição anterior esquecida": uma não-registrada antiga é escolhida (não pula).

## Erros → HTTP (na casca, opção 1)

| Erro do núcleo | HTTP |
|----------------|------|
| `consumo-fora-do-grupo` | 422 Unprocessable Entity |
| `consumo-invalido` | 422 Unprocessable Entity |

`match(error).with(...).exhaustive()`.

> **FR-009 "nunca barra" vs 422/400**: 400 (corpo malformado) e 422 (consumo fora-do-grupo/zerado) são erros de **integridade de payload client-side** — a UX nunca permite o paciente montar um consumo fora do grupo (os alimentos vêm do próprio grupo no app). "Nunca barra" refere-se às ações de produto (feito/pulei/desfazer/correção entre estados), que **sempre** sucedem.

## Cobertura de teste (test-first, Vitest) — `registro.test.ts`

- `classificarEstado`: pulei; feito (sem adequação); troquei por opção; troquei por substituição válida; **itens vazio → consumo-invalido**; `consumo-fora-do-grupo`; `consumo-invalido` (gramas ≤ 0); **ordem de guarda** (grupo antes de gramas); troca-desfeita→feito.
- `estadoVigente`: vazio→null; maior seq vence; array fora de ordem; tombstone→null; feito→pulei→feito→desfazer→null.
- `decidirRegistro`: marcar==vigente→no-op; marcar≠vigente→inserir; desfazer com vigente→inserir(null); desfazer sem vigente→no-op; troquei→feito (estados distintos)→inserir.
- `derivarOAgora`: 1ª não-registrada; **refeição ausente do map de vigentes = não-registrada → vira o agora**; refeição anterior esquecida permanece o agora; todas registradas→dia-concluido; lista vazia→dia-concluido.

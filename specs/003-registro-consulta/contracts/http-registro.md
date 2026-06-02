# Contrato — HTTP (`apps/api`)

Casca: valida na borda, **resolve no banco tudo que classifica/autoriza** (grupos, `is_default`, pertencimento), orquestra o núcleo puro, converte `Result`→`HttpException` (opção 1). Sem serializar entidade Drizzle crua (mapper puro).

## `POST /patients/:patientId/registro`

Registrar / corrigir / desfazer o estado de **uma refeição num dia**. `@HttpCode(200)` (upsert idempotente; às vezes no-op/anulação; "nunca barra").

### Request

`patientId` (path): UUID (`ParseUUIDPipe`).

```jsonc
{
  "mealId": "uuid",                 // obrigatório
  "intent": "feito" | "pulei" | "desfazer",  // obrigatório — NUNCA "troquei" (derivado)
  "dayTypeId": "uuid",              // opcional — override de tipo-de-dia da sessão; senão o servidor resolve o default
  "consumo": {                      // OPCIONAL mesmo em intent="feito"; ausente em pulei/desfazer
    "chosenOptionId": "uuid",       // a opção cumprida; se ausente, o servidor assume a opção default da refeição
    "items": [                      // opcional — presente só quando houve substituição/combinação
      { "itemId": "uuid", "foodId": "uuid", "quantityGrams": 120 }
    ]
  }
}
```

**Derivação de "troquei"** (FR-003): o servidor nunca recebe `troquei`. Com `intent="feito"`, o servidor **resolve no banco** e monta a `Adequacao` para o core:

- `consumo` ausente, OU `chosenOptionId` = opção default da refeição e sem `items` → `adequacao = null` → **feito**.
- `chosenOptionId` resolve para opção **não-default** (lookup `meal_option.is_default = false`) → `adequacao = { kind:"opcao-nao-default", mealOptionId }` → **troquei**.
- `items` presente (não-vazio) → `adequacao = { kind:"substituicao-combinacao", itens }` → **troquei**.

> **`consumo` opcional preserva o 1 toque (FR-001/FR-009)**: o app pode marcar "feito" sem carregar `chosenOptionId` — o servidor assume a opção default. O `chosenOptionId` só é necessário quando o paciente cumpriu uma opção diferente (caso em que o app já o tem do `/today`).

### Validação (ordem: borda → pertencimento → resolução DB → core)

1. **Estrutural (borda)**: `patientId`/`mealId`/`dayTypeId`/`chosenOptionId`/`itemId`/`foodId` são UUID; `intent` ∈ {feito,pulei,desfazer}; `quantityGrams` número **> 0** → senão `400 Bad Request`. (Padrão do repo: `UUID_RE` + `BadRequestException`, sem class-validator.)
2. **Pertencimento (casca, LGPD FR-017)**: `mealId` pertence ao **plano ativo** do `patientId` (cadeia meal→day_type→plan(isActive)→patient); `chosenOptionId`/`itemId` pertencem a essa refeição → senão `404 Not Found`.
3. **Resolução de grupos no banco (casca)**: para cada `consumo.items[i]`, carregar do banco `groupIdEsperado` = `meal_item.substitutionGroupId` do `itemId`, e `groupId` = grupo do `foodId` via `food_substitution_group` (reusa os joins de `substitution.service.ts`). Montar cada `ItemConsumido` **a partir desses valores do banco, nunca do payload**. `itemId`/`foodId` que não resolvem para grupo → `404` (pertencimento). Resolver `is_default` da `chosenOptionId` aqui também.
4. **Negócio (core)**: `classificarEstado(adequacao)` → `422` em `consumo-fora-do-grupo` (food fora do grupo do item) / `consumo-invalido` (itens vazio ou gramas ≤ 0).

> O servidor **não recompõe** a combinação/substituição: o cliente envia os itens consumidos já materializados (`foodId` + `quantityGrams`); o servidor valida **só** o pertencimento ao grupo (resolvido no banco) e `gramas > 0`. Reconciliação de quantidades contra o plano é fora de escopo no v0.

### Fluxo (service, dentro de `db.transaction` + `pg_advisory_xact_lock(hash(patientId, mealId, loggedDate))`)

1. Resolver plano ativo + `dayTypeId` em vigor (override do corpo, senão default do dia) + `loggedDate` (data local).
2. Pertencimento + resolução de grupos/`is_default` (passos 2-3).
3. Carregar histórico de `meal_event` da (paciente, refeição, dia) → `estadoVigente` (core).
4. Montar o alvo: `intent="desfazer"` → `{kind:"desfazer"}`; senão `classificarEstado(...)` → `EstadoRegistro` → `{kind:"marcar"}`.
5. `decidirRegistro({vigente, alvo})`: `no-op` → não insere; `inserir` → INSERT `meal_event` (+ `meal_event_item` por item, se troquei por substituição; grava `chosen_meal_option_id` quando feito/troquei).
6. Re-derivar "o agora" (`derivarOAgora`) sobre as refeições do dia + estados vigentes atualizados.
7. Mapear → `RegistroResponse` (mapper puro).

### Response 200

```jsonc
{
  "mealId": "uuid",
  "loggedDate": "2026-06-02",
  "vigente": { "state": "feito" }, // ou troquei | pulei | null (após desfazer)
  "currentMealId": "uuid", // 1ª refeição não-registrada após a operação; null se dia concluído
  "diaConcluido": false,
}
```

Nunca devolve número de adesão/percentual (FR-016).

### Erros

| Status | Quando                                                                                       |
| ------ | -------------------------------------------------------------------------------------------- |
| 400    | corpo estruturalmente inválido (UUID/enum/gramas ≤ 0 ou não-número)                          |
| 404    | paciente sem plano ativo; refeição/opção/item não pertence ao plano do paciente              |
| 422    | food consumido fora do grupo do item (DB-resolvido); itens vazio em troquei-por-substituição |

## `GET /patients/:patientId/today` (estendido)

Sem mudança de assinatura. Passa a:

- Derivar `currentMealId` = **1ª refeição não-registrada** na ordem do plano (antes: 1ª por `position`, estática). `null` quando todas registradas.
- Adicionar `diaConcluido: boolean` no topo do `TodayResponse`.
- Por `MealDto`: `registro: { state: "feito"|"troquei"|"pulei" } | null` (estado vigente; `null` = não-registrada) e `isCurrent: boolean`.

**Carregamento** (casca): `selectDistinctOn([mealEvent.mealId], ...).orderBy(asc(mealId), desc(createdAt))` filtrando por (paciente, plano, `logged_date` de hoje, `mealId IN ids`); OU — fallback igualmente idiomático no repo — carregar todos os eventos do dia (`inArray`) e reduzir com `estadoVigente` do core (padrão `measureRows`→`measuresByFood`). Decidir na task; o core é robusto a ordem.

**Breaking**: `currentMealId` passa a `string | null`. Consumidores (mobile, `today*.e2e-spec.ts`, swagger model, api-client) tratam `null`/`diaConcluido`. Sem eventos no dia, "o agora" = 1ª refeição (retrocompat).

## Tipos compartilhados (`packages/types/src/registro.ts`)

```ts
export type RegistroIntent = "feito" | "pulei" | "desfazer";
export type RegistroConsumo = {
  readonly chosenOptionId?: string; // opcional: ausente → servidor assume a opção default
  readonly items?: ReadonlyArray<{
    readonly itemId: string;
    readonly foodId: string;
    readonly quantityGrams: number;
  }>;
};
export type RegistroRequest = {
  readonly mealId: string;
  readonly intent: RegistroIntent;
  readonly dayTypeId?: string;
  readonly consumo?: RegistroConsumo;
};
export type RegistroResponse = {
  readonly mealId: string;
  readonly loggedDate: string;
  readonly vigente: { readonly state: "feito" | "troquei" | "pulei" } | null;
  readonly currentMealId: string | null;
  readonly diaConcluido: boolean;
};
```

## Cobertura e2e (test-first, Vitest) — `registro.e2e-spec.ts`

- **US1**: POST feito (sem consumo → assume default) na 1ª refeição → 200, `currentMealId` avança; GET /today reflete `registro.state="feito"` e `isCurrent` na próxima; POST pulei avança igual.
- **US2**: POST feito com `items` (substituição within-group, grupos DB-resolvidos) → `troquei`; POST feito com `chosenOptionId` não-default → `troquei`.
- **US3**: pulei→feito (correção) → vigente feito; reenvio idêntico → 0 duplicata observável (vigente igual); desfazer → vigente null e "o agora" volta; **desfazer + re-registrar com troca diferente** → novo troquei gravado.
- **Dia concluído**: registrar a última → `currentMealId=null`, `diaConcluido=true`, 200.
- **LGPD/IDOR**: POST com `mealId` de plano de OUTRO paciente sob `:patientId` de A → 404 e nada gravado.
- **Bordas**: 400 (gramas ≤ 0 / UUID inválido); 422 (`foodId` fora do grupo do item, DB-resolvido); `consumo.items: []` (lista vazia) = **sem substituição** → `feito` (200), não 422 — a casca só monta `substituicao-combinacao` com itens não-vazio; a guarda "itens vazio → consumo-invalido" do core é invariante defensiva, exercida no unit de `packages/core`, não por este payload.

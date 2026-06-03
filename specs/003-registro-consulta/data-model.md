# Data Model — Registro pendurado na consulta

Tabelas novas em `packages/db/src/schema.ts`. Append-only. Convenções do arquivo: PK `uuid().primaryKey().defaultRandom()`, FK `.references(() => x.id).notNull()`, `createdAt timestamp().defaultNow().notNull()`, `pgEnum` com valores de domínio.

## Enum `meal_event_state`

```
pgEnum("meal_event_state", ["feito", "troquei", "pulei"])
```

Exatamente 3 valores (FR-002). **Não** existe valor para "não registrada" nem "desfeito": ausência de estado vigente = nenhum evento OU evento mais recente com `state = NULL` (ver `meal_event.state`).

## Tabela `meal_event` (evento de registro, append-only)

| Coluna                  | Tipo                  | Null     | Descrição                                                                                                                                                                                                                                                                                    |
| ----------------------- | --------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                    | uuid PK defaultRandom | —        | Identidade do evento                                                                                                                                                                                                                                                                         |
| `patient_id`            | uuid → patient        | NOT NULL | Âncora paciente (FR-005); base do pertencimento LGPD (FR-017)                                                                                                                                                                                                                                |
| `plan_id`               | uuid → plan           | NOT NULL | Ancora direto no plano, v0 sem ciclo (FR-015)                                                                                                                                                                                                                                                |
| `meal_id`               | uuid → meal           | NOT NULL | Refeição registrada; granularidade-base (FR-005)                                                                                                                                                                                                                                             |
| `day_type_id`           | uuid → day_type       | NOT NULL | Tipo-de-dia **em vigor no momento** (default ou override de sessão), snapshot — sem materializar `day_selection` (FR-014)                                                                                                                                                                    |
| `logged_date`           | date                  | NOT NULL | Dia-calendário do registro; parte da chave (paciente, refeição, dia)                                                                                                                                                                                                                         |
| `state`                 | meal_event_state      | **NULL** | `feito`/`troquei`/`pulei` numa marcação; **NULL = evento de anulação (desfazer)** (FR-002, FR-010)                                                                                                                                                                                           |
| `chosen_meal_option_id` | uuid → meal_option    | NULL     | Opção efetivamente cumprida; gravada em **`feito` E `troquei`** (a opção cumprida, default ou não — snapshot auto-contido); NULL em `pulei`/`desfazer`                                                                                                                                       |
| `created_at`            | timestamp defaultNow  | NOT NULL | Carimbo de ordenação; **estado vigente = evento de maior `created_at`** por (paciente, refeição, dia). O advisory lock por escopo (ver http-registro) serializa os INSERTs → `created_at` é estritamente crescente por (paciente, refeição, dia), sem empate; é o `seq` que o núcleo consome |

**Estado vigente** (derivado, não persistido): para cada (`patient_id`, `meal_id`, `logged_date`), o evento de maior `created_at`. Se seu `state` ∈ {feito,troquei,pulei} → esse é o vigente; se `state` NULL (anulação) ou não há evento → **não-registrada**.

Query de leitura (casca): `SELECT DISTINCT ON (meal_id) meal_id, state FROM meal_event WHERE patient_id = $p AND plan_id = $pl AND logged_date = $d AND meal_id = ANY($ids) ORDER BY meal_id, created_at DESC`.

> **Ordenação (last-wins)**: o `seq` que `estadoVigente` consome é materializado a partir de `created_at` (microssegundo via `now()`). Como o **advisory lock por (paciente, refeição, dia)** serializa os INSERTs do escopo, dois eventos do mesmo escopo nunca compartilham `created_at` — a ordenação é determinística sem coluna extra. Se algum dia o lock sair, adicionar `seq bigserial` monotônico é o fix nomeado.

## Tabela `meal_event_item` (consumo efetivo do "troquei", filha)

| Coluna           | Tipo                  | Null     | Descrição                                                                                                              |
| ---------------- | --------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------- |
| `id`             | uuid PK defaultRandom | —        | Identidade da linha                                                                                                    |
| `meal_event_id`  | uuid → meal_event     | NOT NULL | Evento pai                                                                                                             |
| `food_id`        | uuid → food           | NOT NULL | Alimento efetivamente consumido — FK→food **garante "dentro da lista"** (FR-004a); barra comida-fora-da-lista (Fase 4) |
| `quantity_grams` | double precision      | NOT NULL | Quantidade efetiva consumida                                                                                           |

Presente **apenas** em "troquei por substituição/combinação" (FR-004a). "troquei por opção" usa só `chosen_meal_option_id` do pai (FR-004b). `feito`/`pulei`/`desfazer` não geram filhas.

## Relações

- `meal_event` N:1 `patient`, `plan`, `meal`, `day_type`; N:1 (opcional) `meal_option`.
- `meal_event` 1:N `meal_event_item`; `meal_event_item` N:1 `food`.
- `mealEventRelations` / `mealEventItemRelations` declarados no bloco de relations.

## Regras de validação (negócio → núcleo puro)

- **within-group** (FR-004a): cada `meal_event_item` consumido deve pertencer ao mesmo grupo de equivalência do item do plano que substitui. O `groupIdEsperado` (do `meal_item`) e o `groupId` do food consumido são **resolvidos no banco pela casca** (reusando os joins de `substitution.service.ts`), **nunca confiados ao payload**; o core (`classificarEstado`) só compara os valores DB-resolvidos (`consumo-fora-do-grupo`). A FK→food + a checagem de grupo barram fora-da-lista.
- **gramas** > 0 (`consumo-invalido`) — item consumido com 0g não é consumo (simplesmente não entra na lista).
- **troquei por substituição** exige ≥1 item (lista vazia → `consumo-invalido`).
- **classificação** (FR-002/003): `pulei` se não-consumiu; `feito` se consumiu opção default sem itens trocados; `troquei` se opção não-default OU itens trocados.
- **idempotência** (FR-012): inserir só se o estado-alvo difere do vigente; senão no-op (decidido por `decidirRegistro` no core, executado pela casca sob transação+lock).
- **pertencimento** (FR-017, estrutural/estado → casca): `meal_id` deve pertencer ao plano ativo do `patient_id`.

## Transições de estado (por refeição, num dia)

```
não-registrada ──marcar(feito|troquei|pulei)──▶ <estado>
   ▲                                                │
   │                                                ├──marcar(outro estado)──▶ <outro>   (correção, FR-010)
   └────────────────desfazer (state=NULL)───────────┘
```

- Todas as transições são **INSERTs** (append-only). O "estado anterior" nunca é mutado/apagado.
- `desfazer` leva a "não-registrada" (ausência), idêntico a nunca ter registrado.
- Reenvio do mesmo estado-alvo: **no-op** (não gera transição observável).
- **Correção de conteúdo de um troquei** (outra opção/itens) se faz por **desfazer → re-registrar** (a UI só oferece a troca em "o agora"); idempotência por rótulo é suficiente. Correção direta troquei→troquei-distinto sem desfazer é fora de escopo no v0.
- "O agora" (FR-006) é re-derivado após qualquer transição: 1ª refeição não-registrada na ordem do plano; todas registradas → dia concluído.

> **FR-017 (escopo nesta feature)**: cobre o **pertencimento na escrita do paciente** (refeição→plano-ativo→paciente, 404 em IDOR cross-patient). A metade "nutri responsável" é **vacuamente satisfeita**: não há superfície de leitura de registros nesta feature; o canal de leitura da nutri (com seu controle de acesso) entra com adesão/relatório (Fase 3 posterior).

## Impacto em tabelas/contratos existentes

- **`seed.ts`**: limpar `meal_event_item` → `meal_event` no topo da cadeia (antes de `meal_item`).
- **`TodayResponse`** (`packages/types/src/today.ts`): `currentMealId: string | null`, novo `diaConcluido: boolean`, e por `MealDto` um `registro: { state: "feito"|"troquei"|"pulei" } | null` + `isCurrent: boolean`. **Breaking** — varrer consumidores.
- Nenhuma tabela existente é alterada estruturalmente (só leitura nova + extensão de DTO).

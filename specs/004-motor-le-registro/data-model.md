# Data Model — Motor lê o registro

**Sem tabelas/colunas novas.** Lê o que a Fase 3 persistiu e deriva grandezas em memória (efêmeras). Única mudança de persistência: o **registro de `troquei` passa a gravar o snapshot COMPLETO** em `meal_event_item` (mais linhas; mesma estrutura — sem migration).

## Lê / grava (existente)

- **`meal_event`** (Fase 3): `state` (feito/troquei/pulei, NULL=anulação), `chosen_meal_option_id`, `meal_id`, `logged_date`, `created_at`. Estado vigente por (paciente, refeição, dia) = último evento (`estadoVigente`, core).
- **`meal_event_item`** (Fase 3): `food_id`, `quantity_grams`. **Mudança (D3b)**: no `troquei`, passa a conter o **conjunto completo** de itens consumidos da refeição (não só os trocados).
- **`meal_option` / `meal_item` / `food`** (Fase 1/2): a opção cumprida (feito) e as macros (por 100g).

## Escrita do registro (Fase 3) — ajuste D3b

No `registro.service`, ao gravar **troquei**, materializar e gravar em `meal_event_item` o consumo COMPLETO:

| Sub-caso de troquei | `chosen_meal_option_id` | `meal_event_item` (gravado) |
|---------------------|--------------------------|------------------------------|
| por substituição/combinação | a opção cumprida (default) | TODOS os itens da opção, com os trocados sobrepostos por `consumo.items` (pareados por `itemId`) |
| por opção não-default | a opção não-default cumprida | TODOS os itens dessa opção |

`feito`/`pulei`/`desfazer`: **sem** `meal_event_item` (feito deriva da `chosen_meal_option_id`).

## Deriva (em memória, não persiste)

### Consumo real de uma refeição registrada

| Estado vigente | Contribuição ao total do dia |
|----------------|------------------------------|
| `feito` | itens da opção cumprida (`chosen_meal_option_id`; fallback: default da refeição, ou 1ª opção) × gramas planejadas |
| `troquei` | **soma de `meal_event_item`** (food × gramas) — snapshot completo, exato |
| `pulei` | **zero** |
| não-registrada | itens planejados (default; ou escolhida, se for o gatilho) |

Macros via `food.*Per100g` × gramas (`nutrientesDaPorcao`/`somaNutrientes`, core).

### Consumido-até-agora (vetor agregado)

`consumido: { kcal, carb, protein, fat }` = soma do consumo real de **todas** as refeições registradas (vigentes) do **dia corrente** (`localToday()`), do plano ativo — **type-agnostic** (qualquer tipo-de-dia). Grandeza **interna** do motor — não exposta ao paciente (FR-015). Usada por `previewTrocaTipoDia`.

> **Carga**: `meal_event` filtrado por **(patientId, planId, loggedDate=`localToday()`)** — NUNCA restrito a `mealId IN (refeições do tipo)`, senão a troca de tipo zeraria o consumido.

## Entrada do núcleo (não persistida)

- **`RefeicaoDia.isRegistered: boolean`** (novo campo **obrigatório**, input do core): true quando a refeição tem estado vigente registrado. Usado por `previewTrocaOpcao` para excluir da seleção de alavancas. Montado pela casca; atualizar TODOS os literais `RefeicaoDia` (rebalance.service, rebalance.test, phase2.edge.test).

## Regras de validação (negócio → núcleo)

- **Alavanca** = item flexível (`!isLocked && groupId != null`) de refeição **não registrada** e **não** a do gatilho (FR-001/FR-002).
- **Total** = consumo real das registradas + planejado das não-registradas (FR-005/FR-007); **alvo** = defaults do plano (FR-008).
- **Direção/piso** (FR-009/FR-010): `deltaKcal = total − alvo`; fora da faixa → reaproxima do alvo (aumenta/reduz); piso inviolável; recusa orientada (motivo mapeado, D10) se não couber. Inalterado da Fase 2.
- **Efêmero** (FR-014): nada do rebalanceamento é gravado.

## Impacto em contratos existentes

- **`POST /registro`** (Fase 3): troquei passa a gravar o snapshot completo em `meal_event_item` (D3b). Atualizar e2e de troquei.
- **`POST /rebalance/option-choice`**: sem mudança de request; o servidor carrega o registro (via helper) e exclui registradas + usa consumo real. Response inalterada.
- **`GET /today?dayTypeId`**: sem mudança de request; com override ativo + consumo hoje, itens flexíveis da opção default vêm com **gramas ajustadas**. Sem override (tipo padrão), inalterado.

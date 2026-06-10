# Data Model — 007-ciclo-de-acompanhamento

> **Migration `0003`** (a primeira desde a Fase 3): duas tabelas novas. Nenhuma tabela existente muda; nenhum dado existente é tocado (histórico fica fora de ciclo — Q3-B).

## Tabelas novas

### `cycle`

| Coluna                   | Tipo                | Regras                                                                                             |
| ------------------------ | ------------------- | -------------------------------------------------------------------------------------------------- |
| `id`                     | uuid PK             | `defaultRandom()`                                                                                  |
| `patient_id`             | uuid FK → `patient` | not null                                                                                           |
| `started_on`             | date                | not null — dia-calendário local do ato de abrir (D8)                                               |
| `expected_duration_days` | integer             | not null, > 0 — **obrigatória ao abrir** (FR-003); previsão, não trava (FR-005)                    |
| `closed_on`              | date                | **null = ciclo ativo**; preenchida no fechar manual ou no auto-fechar (= `started_on` do sucessor) |
| `created_at`             | timestamp           | `defaultNow()` — desempate da fronteira quando `started_on` empata (D3)                            |

**Índice**: `UNIQUE (patient_id) WHERE closed_on IS NULL` — o banco garante **no máximo um ciclo ativo por paciente** (FR-002/SC-002).

**Invariantes** (casca + core): `closed_on ≥ started_on`; janelas de um paciente não se sobrepõem (a fronteira compartilhada fechou-e-reabriu é o único toque permitido, resolvido por desempate — D3).

### `cycle_plan_vigencia`

| Coluna       | Tipo              | Regras                                       |
| ------------ | ----------------- | -------------------------------------------- |
| `id`         | uuid PK           | `defaultRandom()`                            |
| `cycle_id`   | uuid FK → `cycle` | not null                                     |
| `plan_id`    | uuid FK → `plan`  | not null                                     |
| `valid_from` | date              | not null                                     |
| `valid_to`   | date              | **null = vigência corrente** dentro do ciclo |

**Semântica (Q2-A + "observa")**: o ciclo NÃO manda em `plan.is_active` — ele registra a linha do tempo das ativações. Abrir ciclo grava a vigência inicial (= plano ativo no ato, `valid_from = started_on`); **ativar plano** (D2) fecha a vigência corrente (`valid_to = hoje`) e abre a nova. Um plano pode reaparecer em ciclos/vigências diferentes (re-vínculo).

## Entidades derivadas (tipos, não tabelas)

- **`CicloJanela`** (core): `{ id, startedOn, closedOn: string | null, createdAtMs }` — entrada de `atribuirCiclo`.
- **Atribuição**: `(paciente, dia)` → `cycleId | null` — derivada por cobertura + desempate (D3); **nunca** materializada nos `meal_event` (assumption da spec: atribuição derivada do período, sem re-ancorar registros).
- **Linha do tempo** (DTO): ciclos do paciente em ordem (`started_on` asc), cada um com janela, duração prevista, status (ativo/fechado) e vigências.
- **Registros do período** (DTO do detalhe — D6): por refeição com estado vigente na janela: `(date, mealId, position, state)`. Sem macros/consumo (isso é 006/relatório).

## Invariantes que amarram FRs aos dados

1. **FR-002/SC-002**: índice único parcial + transação no abrir → nunca dois ativos; auto-fechar grava `closed_on = started_on` do novo (fronteira compartilhada, resolvida pelo desempate na leitura).
2. **FR-006/SC-004**: nenhuma operação de ciclo escreve em `meal_event`/`meal_event_item`/`plan` (exceto `plan.is_active` no ato explícito de ativar — que já é a semântica existente do plano ativo).
3. **FR-007**: "qual plano vigia no dia X deste ciclo" = vigência cujo `[valid_from, valid_to ?? closed_on/hoje]` cobre X; sem sobreposição de vigências dentro do ciclo (transação fecha uma antes de abrir outra).
4. **FR-009/SC-001**: atribuição é função pura (D3) sobre as janelas — mesma entrada, mesma resposta.
5. **FR-011**: dias fora de qualquer janela → "nenhum ciclo"; nenhum ciclo retroativo é criado em migração (a migration só cria tabelas vazias).
6. **FR-012/FR-013/SC-006**: `cycle`/`cycle_plan_vigencia` só são lidas/escritas pelo módulo `ciclo/` na via `/nutri` (guard); nenhum DTO do paciente referencia ciclo.

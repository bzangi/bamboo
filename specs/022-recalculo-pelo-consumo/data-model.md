# Data Model — 022

## Entidades

**Nenhuma nova. Nenhum campo novo. Nenhuma migration.**

A feature só lê o que já existe: o registro vigente do dia (`meal_event` + `meal_event_item`, via o leitor único da `012`) e o grafo do plano (`plan → day_type → meal → meal_option → meal_item`, com `is_locked`, `substitution_group_id` e `ad_libitum`).

## O que realmente muda: o conjunto de alavancas

O único "modelo" afetado é um conjunto derivado em memória — quais itens o motor pode reescalar numa dada prévia.

### Hoje (troca de opção)

```
alavancas = { itens flexíveis de refeições onde position ≠ gatilho E não registrada }
```

### Depois

```
outras   = { itens flexíveis de refeições onde position ≠ gatilho E não registrada }
alavancas = outras, se outras ≠ ∅
          = { itens flexíveis da refeição-gatilho }, caso contrário
```

`item flexível` continua sendo exatamente o mesmo predicado de hoje (`ehAlavanca`): não travado, com grupo de substituição, e com quantidade prescrita (não "à vontade"). **A definição não é duplicada nem relaxada** — só o conjunto de refeições consultado muda.

Corolário que dispensa código: como os itens vindos do overlay da edição em lote entram no dia marcados como travados e sem grupo, eles já não satisfazem `ehAlavanca`. A guarda do FR-008 é uma consequência do predicado existente, não uma regra nova.

### Recálculo do dia (leitura da tela inicial)

O conjunto não muda de definição; muda a **condição de ativação**:

```
hoje:   recalcula se (há override de tipo-de-dia) E (há registro hoje)
depois: recalcula se (há registro hoje)
```

## Invariantes preservadas

- Refeição registrada nunca é alavanca; seu consumo real entra no total do dia.
- Item travado e item "à vontade" nunca são alavanca, em nenhum caminho.
- O piso por item é calculado sobre a quantidade **planejada** daquele item — inclusive quando o item pertence à refeição-gatilho.
- O alvo do dia continua sendo a soma das opções padrão de todas as refeições do dia.
- Nada do que é calculado aqui é persistido.

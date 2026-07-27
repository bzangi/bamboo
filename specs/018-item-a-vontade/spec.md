# Feature Specification: Item "à vontade"

**Feature Branch**: `018-item-a-vontade` (planejada e executada na `main`, padrão 006–017)
**Date**: 2026-07-26
**Origem**: bloqueio encontrado ao transcrever o plano real do paciente 0 —
[`bruno-2026-07.ts`](../../packages/db/scripts/planos/bruno-2026-07.ts), GAP-1. Aprovado pelo dono
("o à vontade pode existir sim").
**Status**: implementada (2026-07-26)

## Por que existe

O plano real prescreve **alface e brócolis sem quantidade** em 12 das 30 opções, e a nutri repete em
toda página: _"Salada, verduras e vegetais são SEMPRE à vontade!!"_. Os 5 vegetais que ela oferece
como substituição (beterraba, cenoura crua, cenoura cozida, tomate, tomate cereja) também são "À
vontade". Hoje isso **não é expressável**: `meal_item.quantity_grams` é `NOT NULL`, e a única saída
seria inventar uma gramatura que a nutri não escreveu.

Não é detalhe de carga. Um item sem quantidade prescrita:

- não pode entrar no alvo de kcal do dia (senão o alvo passa a depender de um número inventado);
- não pode ser **alavanca** de rebalanceamento (não há o que reescalar);
- não pode ter sua troca calculada por equivalência (vegetal ↔ vegetal é 1:1, "à vontade" ↔ "à
  vontade");
- não pode aparecer como **"0 g"** na tela do paciente — isso seria a tela mentindo.

## User Scenarios & Testing

### User Story 1 — O paciente vê "à vontade" (Priority: P0)

Na Home, o item que a nutri prescreveu sem quantidade aparece como "à vontade", não como 0 g nem
com uma gramatura inventada.

**Teste de aceitação**

1. **Quando** o item é à vontade, o sistema **deve** marcá-lo na resposta do dia e o app **deve**
   escrever "à vontade" no lugar da quantidade.
2. **Quando** o item é normal, **nada** muda — mesma quantidade, mesma medida caseira.

### User Story 2 — O motor não mexe no que não tem quantidade (Priority: P0)

Rebalancear nunca ajusta um item à vontade, e o alvo do dia não conta com ele.

**Teste de aceitação**

1. **Quando** o rebalanceamento roda numa refeição que tem item à vontade, o sistema **deve**
   deixá-lo fora dos ajustes.
2. **Quando** todos os itens flexíveis de uma refeição são à vontade, o sistema **deve** recusar de
   forma orientada ("sem alavanca"), nunca ajustar o inajustável.
3. **Quando** o alvo do dia é somado, o item à vontade **deve** contribuir zero.

### User Story 3 — Trocar salada por salada (Priority: P1)

O paciente pode trocar brócolis por tomate; a alternativa também é à vontade, sem gramatura.

**Teste de aceitação**

1. **Quando** o item de origem é à vontade, cada alternativa **deve** vir marcada como à vontade e
   **sem** quantidade equivalente.
2. **Quando** o item de origem é normal, a alternativa **deve** continuar trazendo a quantidade
   equivalente de sempre (nada muda).

## Requirements

- **FR-001** Um item de refeição deve poder ser marcado como **sem quantidade prescrita**.
- **FR-002** Item à vontade **nunca** é alavanca de rebalanceamento.
- **FR-003** Item à vontade contribui **zero** para o alvo nutricional e para o consumo real.
- **FR-004** A resposta do dia deve marcar o item; a quantidade prescrita **não** pode ser
  apresentada como número.
- **FR-005** A troca de um item à vontade devolve alternativas à vontade, sem quantidade calculada.
- **FR-006** Item à vontade continua **registrável** (feito/troquei/pulei) como qualquer outro.
- **FR-007** Nenhum comportamento de item normal pode mudar; a migration não altera nenhum item
  existente.

## Success Criteria

- **SC-001** Migration aplica e as suítes existentes seguem verdes (core 164 · api 165 · mobile 24).
- **SC-002** Um item à vontade numa refeição rebalanceada não aparece entre os ajustes.
- **SC-003** Refeição cujos únicos itens flexíveis são à vontade → recusa `sem-alavanca`.
- **SC-004** `GET /today` traz o item com a marca de à vontade e o app renderiza "à vontade".
- **SC-005** `GET /meal-items/:id/substitutions` de item à vontade: toda alternativa marcada e sem
  quantidade equivalente.
- **SC-006** O alvo de kcal do dia é idêntico com e sem o item à vontade na refeição.
- **SC-007** `pnpm lint`, Prettier e `check-types` limpos; OpenAPI regenerado.

## Fora de escopo (decisão)

- **Editor:** marcar "à vontade" pela tela da nutri é da [017](../017-editor-de-plano/spec.md), que
  está em curso — inclusive a validação `gramas > 0` dela precisa passar a aceitar este caso.
- **Faixa de "à vontade" com teto** ("até 200 g"): a nutri não escreve teto, escreve "à vontade".
  Inventar um teto é inventar prescrição.
- **Registrar quanto comeu de um item à vontade** (quantidade efetiva no registro). O registro
  atual guarda o que foi planejado/trocado; medir salada não é o problema que a adesão resolve.
- **Reaproveitar a marca para "sem quantidade" de outros motivos** (ex.: "tempero a gosto"). Um
  conceito por vez.

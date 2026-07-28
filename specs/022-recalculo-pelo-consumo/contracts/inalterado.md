# Contrato HTTP — 022

## Afirmação

**Nenhum path, campo, parâmetro ou status muda.** O OpenAPI continua com os mesmos 31 paths e a mesma forma de resposta.

Isso não é observação de passagem; é uma **restrição verificável** desta feature. Se a implementação precisar de um campo novo, alguma decisão do plano está errada.

## `GET /patients/:patientId/today`

Forma idêntica. O que muda é **o valor** de dois campos já existentes, em dias que hoje não os preenchem:

| Campo                                         | Hoje                                                       | Depois                                                         |
| --------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------- |
| `meals[].defaultOption.items[].quantityGrams` | quantidade planejada quando não há override de tipo-de-dia | quantidade recalculada pelo consumo, com ou sem override       |
| `meals[].rebalanceado`                        | `false` sem override                                       | `true` nas refeições com item recalculado, com ou sem override |
| `meals[].registro`                            | por posição sob override; por `mealId` sem override        | **exatamente igual** — a regra não muda (FR-005)               |

Dia sem nenhum registro: resposta byte-a-byte igual à de hoje.

## `POST /patients/:patientId/rebalance/option-choice`

Corpo e forma da resposta idênticos. O que muda é **quais casos produzem cada desfecho**:

| Estado do dia                                                                                 | Hoje                                                      | Depois                                                                    |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------- |
| Existe outra refeição não registrada com item flexível                                        | `rebalanceado` com essas refeições em `refeicoesAfetadas` | **igual** (FR-009)                                                        |
| A refeição-gatilho é a única ajustável, e tem item flexível                                   | `recusa-orientada` / `sem-alavanca`                       | `rebalanceado`, com a **própria refeição-gatilho** em `refeicoesAfetadas` |
| A refeição-gatilho é a única ajustável, e não tem item flexível (tudo travado ou "à vontade") | `recusa-orientada` / `sem-alavanca`                       | **igual** (FR-010)                                                        |
| Dia dentro da faixa                                                                           | `sem-acao`                                                | **igual**                                                                 |

`refeicoesAfetadas` já podia, pela forma do DTO, conter qualquer refeição do dia — o mapper agrupa por posição e não filtra o gatilho. Nenhum cliente precisa de mudança para receber a refeição-gatilho ali; o app do paciente muda apenas o **texto** que apresenta o resultado.

## Verificação

- Regenerar o OpenAPI e comparar: a contagem de paths e o schema dos DTOs devem ficar idênticos.
- e2e de dia sem registro no `/today`: resposta idêntica à de hoje.
- Suíte `rebalance.e2e-spec.ts` existente: verde sem alteração de arquivo.

# Implementation Plan: Item "à vontade"

**Input**: [spec.md](./spec.md) · **Date**: 2026-07-26 · **Status**: implementado

## Resumo técnico

Uma coluna booleana em `meal_item`, um predicado a mais no núcleo, um campo aditivo em dois DTOs e
uma linha de render no app. Atravessa as 4 camadas porque o conceito é do domínio — mas não muda
nenhuma conta: o que ele faz é **tirar** o item das contas.

## Decisões

- **D1 — `ad_libitum boolean not null default false`, e `quantity_grams` continua `NOT NULL` com
  `0`.** A alternativa (tornar `quantity_grams` nullable) obrigaria todo leitor a tratar `null`:
  `nutritionFor`, o motor, a adesão, o consumo real, o snapshot do troquei e os mappers. Com `0` o
  comportamento correto — contribuir zero para o alvo — já cai de graça, e a **flag é o que
  desambigua** "0 porque à vontade" de "0 porque bug". Bônus de convivência: a validação
  `gramas > 0` do editor (017, em curso) continua válida para item normal.
- **D2 — `ItemDia.adLibitum` OBRIGATÓRIO no núcleo.** Mesma disciplina do `isRegistered` da 004:
  campo opcional deixa o adaptador esquecer, e esquecer aqui significa reescalar salada. São 8
  construtores (2 fixtures de teste + 6 pontos da casca) — barato para o que compra.
- **D3 — `ehAlavanca` ganha a cláusula, em vez de filtrar antes.** O predicado já é o lugar único
  que define "item flexível" (`!isLocked && groupId != null`); acrescentar `&& !adLibitum` mantém
  uma definição só. Filtrar na casca criaria a segunda.
- **D4 — DTO: campo aditivo `adLibitum: boolean` em `MealItemDto` e em
  `SubstitutionAlternativeDto`, com `gramas: 0`.** Padrão do `rebalanceado` da 009 (aditivo, nunca
  troca de forma). Não removo `gramas` do DTO: cliente antigo continua compilando, e a flag manda.
- **D5 — Quem decide o texto é o app.** O DTO marca, o app escreve "à vontade". Regra de
  apresentação não desce para o contrato.
- **D6 — Sem endpoint novo e sem tocar o registro.** Item à vontade é registrável exatamente como
  hoje (FR-006), porque o registro guarda estado (feito/troquei/pulei), não quantidade comida.

## Onde mora o quê

| Camada   | Arquivo                                             | Mudança                                               |
| -------- | --------------------------------------------------- | ----------------------------------------------------- |
| schema   | `packages/db/src/schema.ts` + migration `0005`      | `meal_item.ad_libitum`                                |
| núcleo   | `packages/core/src/rebalance.ts`                    | `ItemDia.adLibitum` (obrigatório) + `ehAlavanca`      |
| contrato | `packages/types/src/today.ts` · `substitution.ts`   | `adLibitum` aditivo                                   |
| casca    | `apps/api/src/plan/{plan.service,today.mapper}.ts`  | lê a coluna, propaga ao núcleo e ao DTO               |
| casca    | `apps/api/src/rebalance/rebalance.service.ts`       | propaga ao núcleo (4 pontos)                          |
| casca    | `apps/api/src/substitution/substitution.service.ts` | origem à vontade ⇒ alternativa à vontade, `gramas: 0` |
| app      | `apps/mobile/src/HomeScreen.tsx`                    | "à vontade" no lugar da quantidade                    |

## Estratégia de teste

1. **Núcleo primeiro (TDD):** `rebalance.test.ts` ganha (a) item à vontade não recebe ajuste e (b)
   refeição só com flexíveis à vontade ⇒ `sem-alavanca`. É onde o bug seria invisível e caro.
2. **e2e novo** sobre `buildScenario` (013) — o construtor precisa saber declarar `aVontade`, então
   `ItemSpec` ganha o campo: `/today` marca, substituição devolve alternativas marcadas, e o alvo
   do dia é igual com e sem o item (SC-006).
3. **Unit do mapper** (`today.mapper.unit.test.ts`) para o campo aditivo.
4. **Mobile:** o render é uma linha; sem harness de componente no repo (mesma decisão de 005/015).
   O teste que importa é o do núcleo.

## Riscos

| Risco                                                                                               | Mitigação                                                                                                                                                                                |
| --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 017 (editor) está em curso e mexe em `packages/types` e no schema                                   | Commits pequenos e imediatos; `today.ts`/`substitution.ts` e `schema.ts` não estão na árvore modificada dela. Migration gerada e commitada primeiro, para o `_journal.json` não colidir. |
| `adLibitum` obrigatório quebrar compilação em ponto não previsto                                    | `check-types` no monorepo inteiro é o gate; o compilador acha todos.                                                                                                                     |
| Item à vontade com `groupId` virar alavanca de capacidade zero e produzir prévia com ajuste "0 → 0" | É exatamente o caso do teste (a) do núcleo.                                                                                                                                              |

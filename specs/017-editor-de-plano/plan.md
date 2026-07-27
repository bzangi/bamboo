# Implementation Plan: A nutri monta o plano alimentar pela tela

**Feature**: `017-editor-de-plano` · **Date**: 2026-07-26 · **Spec**: `./spec.md`

## Resumo técnico

Um módulo Nest novo (`apps/api/src/plano-editor/`) com a escrita do grafo do plano, mais
`PATCH`/`DELETE` de paciente no módulo `nutri` que já existe. Zero mudança em `packages/core`,
zero migration. Na web, Tailwind v4 + shadcn/ui e duas telas novas com Server Actions.

## Decisões

### D1 — Rotas: aninhadas para criar, planas para editar/excluir

Criar é sempre `POST <pai>/<filhos>` (o pai é o contexto). Editar e excluir são
`PATCH`/`DELETE /nutri/<coleção>/:id` — planas, porque o id é UUID e o caminho aninhado completo
(`/nutri/patients/:p/plans/:pl/day-types/:dt/meals/:m/options/:o/items/:i`) não acrescenta
informação nenhuma: o grafo é caminhável **para cima**, e a existência do nó já dá o 404.

Rejeitado: caminho totalmente aninhado (7 níveis de `@Param`, cada handler validando a corrente
inteira para não descobrir nada novo).

### D2 — Um `PUT` para a semana, não CRUD de `day_schedule`

`day_schedule` são 7 linhas que só fazem sentido juntas: uma semana com 6 dias programados é um
estado inválido que nenhuma tela quer poder produzir. Então
`PUT /nutri/plans/:planId/schedule` com os 7 pares, substituindo a programação inteira numa
transação. É CRUD da **semana**, que é a entidade real; linha solta de `day_schedule` não é.

### D3 — Leitura do plano: 4 queries + montagem em memória

`GET /nutri/plans/:planId` devolve o grafo inteiro. Quatro `select` (day types + schedule, meals,
options, items ⋈ food) e monta em memória com `Map`. Sem CTE recursiva, sem `db.query` relacional:
o grafo tem profundidade fixa e conhecida (4), e um plano real tem dezenas de nós, não milhares.

### D4 — Exclusão: cascata para baixo, 409 para os lados

Uma função por nó, cada uma no formato "junta os ids atingidos → checa os bloqueadores → apaga na
ordem reversa de FK". Os bloqueadores são sempre agregados de **fora** do plano:

| Excluir              | Cascata para baixo                                   | Recusa 409 se                                                                                     |
| -------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `meal_item`          | —                                                    | (nada; `meal_event_item` aponta para `food`, não para o item)                                     |
| `meal_option`        | itens                                                | é a única opção da refeição · há `meal_event.chosen_meal_option_id` apontando                     |
| `meal`               | opções, itens                                        | há `meal_event.meal_id` apontando                                                                 |
| `day_type`           | refeições, opções, itens                             | `day_schedule` o referencia · há `meal_event` em refeição sua                                     |
| `plan`               | tipos-de-dia e tudo abaixo, `day_schedule`           | há `meal_event.plan_id` · há `cycle_plan_vigencia` · é o plano ativo de paciente com ciclo aberto |
| `patient`            | planos e todo o grafo, ciclos, vigências             | há `meal_event`                                                                                   |
| `food`               | vínculos `food_substitution_group`, medidas caseiras | usado em `meal_item` ou `meal_event_item`                                                         |
| `substitution_group` | vínculos `food_substitution_group`                   | referenciado por `meal_item`                                                                      |

`meal_event`/`meal_event_item` **nunca** entram numa cascata. É a regra que R2 mitiga.

### D5 — `isDefault` exclusivo numa transação

Criar/atualizar opção com `isDefault: true` faz `UPDATE meal_option SET is_default = false` nos
irmãos antes do insert/update. Excluir a default promove a irmã de menor `label`/`id`. Tudo na
mesma transação. Não há constraint parcial no schema para isso e não vou criar migration só por
ela — a invariante fica na casca, com teste.

`ponytail:` invariante na aplicação, não no banco. Se aparecer escrita concorrente de opção, o
lugar certo é um `uniqueIndex` parcial em `(meal_id) WHERE is_default` — mesma forma do
`cycle_one_active_per_patient`.

### D6 — Validação de borda: helpers puros, não `class-validator`

`apps/api/src/plano-editor/validar.ts`: `texto`, `numeroPositivo`, `inteiroEntre`, `opcional`,
`umDe`. Funções puras, lançam `BadRequestException` com mensagem que diz o campo. Segue o padrão
que o repo já pratica (`patients.service.ts`, `ciclo.controller.ts`) e não paga a dependência.

Testadas como unit (`validar.unit.test.ts`) — é a única lógica nova com ramos suficientes para
merecer teste isolado; o resto é coberto por e2e.

### D7 — Distinção `undefined` vs `null` no PATCH

Patch parcial precisa separar "não mandou o campo" de "mandou null para limpar" (spec US1/3). Vem
da presença da chave no objeto (`'email' in body`), não do valor — `body.email === undefined` não
distingue os dois casos em JSON.

### D8 — Busca de alimento: `translate`, não a extensão `unaccent`

**Corrigido durante a execução.** O plano dizia "sem acento-insensibilidade, é caro"; a spec (US4/1)
pedia insensível a acento. A spec estava certa e o plano estava preguiçoso pelo motivo errado:
`lower()` + `translate()` resolve os dois eixos em UMA expressão SQL, sem extensão, sem migration
e sem privilégio de superusuário.

```sql
translate(lower(name), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc')
```

O mesmo dobramento é aplicado ao termo buscado em TS, e `%`/`_`/`\` do usuário são escapados —
sem isso `q=%` casaria com a base inteira. **Descoberta do teste:** a asserção óbvia ("buscar `%`
devolve zero") está errada — a TACO tem 8 alimentos com `%` literal no nome
(`Margarina … (65% de lipídeos)`). O teste passou a provar o que importa: o resultado é
estritamente menor que a base, e todo nome devolvido contém `%`.

`ponytail:` varredura sequencial sobre ~600 linhas — o `translate` impede índice comum. No tamanho
da TACO é irrelevante; se a base crescer uma ordem de magnitude, o passo é `unaccent` + índice
`gin_trgm_ops`, não normalizar em memória.

### D9 — Web: um `<select>` de alimentos por formulário, um tipo-de-dia por vez

O editor mostra **um tipo-de-dia por vez** (`?dayType=<id>`), então o número de formulários
"adicionar item" na página é o número de opções daquele tipo-de-dia (~4–8), não do plano inteiro.
Com isso o `<select name="foodId">` nativo — que dá type-ahead do navegador de graça, funciona sem
JS e não precisa de combobox — cabe: ~8 × 582 opções.

`ponytail:` HTML na casa de 150 KB no editor. Se pesar, o próximo passo é um campo de busca com
`?food=` filtrando server-side, não uma lib de combobox.

Rejeitado: `<datalist>` — o valor que ele devolve é o texto visível, e resolver nome→id no servidor
introduz ambiguidade (homônimo na TACO) onde o `<select>` já carrega o id.

### D9-bis — Medido: o editor pesa 63 KB, não 150

O `ponytail:` do D9 estimou ~150 KB de HTML. Medido no smoke, com um tipo-de-dia de uma refeição e
uma opção: **63 KB**. A estimativa era o pior caso (8 formulários de item × 590 `<option>`), e o
pior caso não é o caso comum — um tipo-de-dia real tem 4–6 refeições com 1–2 opções. O teto e o
caminho de upgrade seguem valendo; a urgência, não.

### D10 — Web: Server Actions, zero componente client

Toda escrita é Server Action + `revalidatePath`, como a 016. Falha volta pela URL como **código**
(`?erro=<codigo>`), traduzido para frase fixa na página — nada de fora é refletido. Isso mantém a
garantia da 015/016 (credencial só no servidor) e dispensa `useActionState`.

Os componentes shadcn usados são os que **não** precisam de client: `button`, `input`, `label`,
`card`, `table`, `badge`, `select` nativo estilizado. Nada de `dialog`/`popover`/`command`/Radix
`Select` — trariam `"use client"` e ~6 dependências para resolver o que `<details>` e `<select>`
nativos já resolvem.

### D11 — A paleta validada da 015 não é migrada

`apps/web/app/nutri.module.css` continua existindo para a visualização de dados do relatório
(colmo semanal + barra empilhada), cuja paleta foi validada em luminosidade/croma/ΔE/contraste. O
cromo da página migra para Tailwind/shadcn. Mistura deliberada: a paleta é dado, não cromo (R3).

## Onde mora o quê

```
apps/api/src/
  nutri/patients.service.ts      # + atualizar(), excluir()  (paciente é da 015/016)
  nutri/patients.controller.ts   # + PATCH, DELETE
  plano-editor/
    plano-editor.module.ts
    validar.ts                   # helpers puros de borda  (+ validar.unit.test.ts)
    plano.controller.ts          # plans, day-types, schedule
    plano.service.ts
    plano.leitura.ts             # GET do grafo (D3) — função de montagem pura + queries
    refeicao.controller.ts       # meals, options, items
    refeicao.service.ts
    catalogo.controller.ts       # foods, substitution-groups
    catalogo.service.ts
packages/types/src/plano-editor.ts   # DTOs do grafo e dos payloads
apps/web/
  app/globals.css                # Tailwind v4
  components/ui/*.tsx            # shadcn básicos
  lib/utils.ts                   # cn()
  lib/nutri.ts                   # + as chamadas de escrita
  app/patients/[patientId]/plans/page.tsx
  app/patients/[patientId]/plans/[planId]/page.tsx
```

Nenhum arquivo de `packages/core`, `apps/mobile` ou `packages/db/src/schema.ts` é tocado.

## Contratos (resumo)

Todas atrás de `x-nutri-key`.

| Método | Rota                                           | Corpo                                                                         |
| ------ | ---------------------------------------------- | ----------------------------------------------------------------------------- |
| PATCH  | `/nutri/patients/:patientId`                   | `{name?, email?, phone?, heightCm?, weightKg?, exposure?}`                    |
| DELETE | `/nutri/patients/:patientId`                   | —                                                                             |
| GET    | `/nutri/patients/:patientId/plans`             | —                                                                             |
| POST   | `/nutri/patients/:patientId/plans`             | `{name}`                                                                      |
| GET    | `/nutri/plans/:planId`                         | — (grafo inteiro)                                                             |
| PATCH  | `/nutri/plans/:planId`                         | `{name?}`                                                                     |
| DELETE | `/nutri/plans/:planId`                         | —                                                                             |
| PUT    | `/nutri/plans/:planId/schedule`                | `{days: [{weekday, dayTypeId}] × 7}`                                          |
| POST   | `/nutri/plans/:planId/day-types`               | `{name}`                                                                      |
| PATCH  | `/nutri/day-types/:id`                         | `{name}`                                                                      |
| DELETE | `/nutri/day-types/:id`                         | —                                                                             |
| POST   | `/nutri/day-types/:id/meals`                   | `{name, position, horario?}`                                                  |
| PATCH  | `/nutri/meals/:id`                             | `{name?, position?, horario?}`                                                |
| DELETE | `/nutri/meals/:id`                             | —                                                                             |
| POST   | `/nutri/meals/:id/options`                     | `{label, isDefault?}`                                                         |
| PATCH  | `/nutri/options/:id`                           | `{label?, isDefault?}`                                                        |
| DELETE | `/nutri/options/:id`                           | —                                                                             |
| POST   | `/nutri/options/:id/items`                     | `{foodId, quantityGrams, isLocked?, substitutionGroupId?}`                    |
| PATCH  | `/nutri/items/:id`                             | idem, parcial                                                                 |
| DELETE | `/nutri/items/:id`                             | —                                                                             |
| GET    | `/nutri/foods?q=&limit=`                       | —                                                                             |
| POST   | `/nutri/foods`                                 | `{name, kcalPer100g, carbPer100g, proteinPer100g, fatPer100g, fiberPer100g?}` |
| PATCH  | `/nutri/foods/:id`                             | parcial                                                                       |
| DELETE | `/nutri/foods/:id`                             | —                                                                             |
| GET    | `/nutri/substitution-groups`                   | — (com os alimentos vinculados)                                               |
| POST   | `/nutri/substitution-groups`                   | `{name, basis}`                                                               |
| PATCH  | `/nutri/substitution-groups/:id`               | `{name?, basis?}`                                                             |
| DELETE | `/nutri/substitution-groups/:id`               | —                                                                             |
| PUT    | `/nutri/substitution-groups/:id/foods/:foodId` | `{referencePortionGrams}`                                                     |
| DELETE | `/nutri/substitution-groups/:id/foods/:foodId` | —                                                                             |

Ativar plano **continua** sendo `POST /nutri/patients/:id/active-plan` (007) — não é duplicado
aqui, porque é o ato que o ciclo observa.

## Estratégia de teste

- **e2e novo, self-contained** com `buildScenario` (013) e `destroy()` no `afterAll` — nunca o
  paciente do seed (lição KI-001).
  - `plano-editor.e2e-spec.ts` — CRUD de plano/day-type/schedule + recusas.
  - `refeicao-editor.e2e-spec.ts` — meals/options/items, `isDefault` exclusivo, position duplicada,
    vínculo alimento↔grupo, cascata.
  - `nutri-paciente-crud.e2e-spec.ts` — PATCH/DELETE de paciente, 409 com registro.
  - `catalogo.e2e-spec.ts` — busca de alimento, CRUD de food/grupo, recusas de uso.
- **unit** — `validar.unit.test.ts` (borda) e `plano.leitura` (montagem do grafo, função pura).
- **Não-regressão** — `git diff` vazio em `packages/core` e nos `*.e2e-spec.ts` pré-existentes.
- **Ao vivo (SC-003)** — montar paciente + plano pela tela e conferir `GET /patients/:id/today`.

## Riscos e mitigação

Ver spec (R1–R3). Adicional desta etapa:

- **R4** — Tailwind v4 + Next 16 + Turbopack: a integração é via `@tailwindcss/postcss`, sem
  `tailwind.config.js`. Se o build quebrar, o fallback é Tailwind v3 com config — não sair do
  shadcn.

---

## Correções que a EXECUÇÃO impôs ao plano

Registradas aqui porque cada uma foi um erro do plano, não do código.

### C1 — O código de falha precisava da OPERAÇÃO, não só da entidade (D10)

O plano dizia "(status, entidade) → código". **O smoke provou que não fecha:** criar refeição e
excluir refeição respondem os dois **409**, por causas opostas — posição ocupada e "tem registro".
Com uma entidade só, a tela mostrava _"há registro nesta refeição"_ quando o problema era a
posição, mandando a nutri procurar o erro no lugar errado.

Correção: a entidade passou a ser o par **(nó, operação)** onde as duas operações divergem —
`refeicao-posicao` (criar/mover) e `refeicao` (excluir). Travado por
`apps/web/lib/erros.test.ts`, que também exige que **todo** par (status × entidade) tenha frase.

### C2 — `cod in FRASES` andava pela cadeia de protótipos

Achado pelo teste escrito para C1: `?erro=constructor` fazia `"constructor" in FRASES` ser `true`, e
a tela recebia `Object.prototype.constructor` — uma **função** onde ela espera texto. É a mesma
armadilha que o `presente()` da API já evitava com `hasOwnProperty`, e que eu não apliquei aqui.
Corrigido com `Object.hasOwn`.

### C3 — Busca por acento: o plano estava preguiçoso pelo motivo errado

Ver D8. O plano recusou a insensibilidade a acento alegando custo (extensão `unaccent`); a spec a
pedia; `lower()` + `translate()` resolvia em uma expressão. A spec estava certa.

### C4 — A asserção óbvia do teste de escape estava errada

"Buscar `%` devolve zero resultados" é falso: a TACO tem 8 alimentos com `%` literal no nome
(`Margarina … (65% de lipídeos)`). O teste passou a asserir o que importa — resultado
estritamente menor que a base, e todo nome devolvido contém `%`.

### C5 — O `grep` de `"use client"` dá 4 falsos positivos

Quatro arquivos **citam** a expressão em comentário (explicando por que não a usam). A verificação
do FR-006 tem de procurar a **diretiva**, não a substring:
`grep -rlE '^\s*["'"'"']use client["'"'"']' apps/web/{app,components,lib}` → **0**. Anotado no
cabeçalho de `lib/nutri.ts`, onde a garantia é descrita.

### C6 — `requestJson` não serve para 204

Os 11 `DELETE` respondem **204 sem corpo**, e `requestJson` chama `res.json()` sempre — o que
transforma sucesso em erro. Entrou `requestVoid` em `packages/api-client/src/http.ts`, dividindo o
mesmo tratamento de `ApiError`. Não é especulativo: tem 11 chamadores hoje.

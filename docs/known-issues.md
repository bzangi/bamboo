# Known issues / dívida técnica

Registro de problemas conhecidos e dívida técnica fora do escopo da feature em
curso. Cada item: sintoma, evidência, causa provável e próximo passo.

---

## KI-001 — Flaky e2e: `adesao.e2e` SC-008 intermitente 403 → 404

**Status:** aberto · **Área:** `apps/api` testes e2e · **Prioridade:** média
**Aberto em:** 2026-06-10 (durante o fix da flakiness de `meal_event`, feature 009)

### Sintoma

Rodando a suíte e2e completa do `apps/api` (`pnpm vitest run` em `apps/api`)
várias vezes seguidas, **raramente** (≈1 em 10 runs) falha:

```
FAIL test/adesao.e2e-spec.ts > US4 ... > SC-008 — sem x-nutri-key → 403; chave errada → 403
Error: expected 403 "Forbidden", got 404 "Not Found"  (test/adesao.e2e-spec.ts:799)
```

### O que JÁ se sabe (investigação 2026-06-10)

- **NÃO é estado de `meal_event`.** A flakiness principal (suítes que não
  limpavam `meal_event` do dia no `beforeAll`) foi corrigida em `registro.e2e`
  e `rebalance.e2e` via `test/helpers.ts::limparEventosDeHoje` (commit `a2894f3`).
  O 403→404 do adesao persiste e tem causa distinta.
- **É roteamento / init de app, não autorização.** O `NutriKeyGuard`
  (`src/nutri/nutri-key.guard.ts:14`) é *fail-closed*: sem/`x-nutri-key` errada →
  `canActivate` devolve `false` → Nest lança `ForbiddenException` → **403**.
  Um **404** significa que a **rota não foi casada** (`/nutri/patients/:id/adesao`
  não registrada/alcançada naquele app), não que o guard barrou.
- Reproduz **só na suíte completa**, nunca com `adesao.e2e` isolado → indício de
  **contaminação cross-arquivo** (estado de processo compartilhado entre suítes).

### Hipóteses (a confirmar com instrumentação)

1. **`pool.end()` em múltiplas suítes.** Vários `.e2e-spec.ts` chamam `pool.end()`
   no `afterAll` da "última suíte do arquivo" (o `pool` do `@bamboo/db` é
   singleton). Se o Vitest **não isola** os arquivos em processos separados, o
   primeiro arquivo a terminar fecha o pool compartilhado e os seguintes
   quebram. Verificar config de isolation do Vitest (`apps/api/vitest.config.ts`
   tem `fileParallelism: false`, mas isolation por arquivo não está explícito).
2. **`process.env.NUTRI_API_KEY`** é setado em *module-load* (`adesao.e2e:33`) e
   é global de processo — se compartilhado entre arquivos, pode ser mutado por
   outra suíte (`ciclo.e2e` também usa `NutriKeyGuard`).

### Próximo passo sugerido

- Instrumentar o run completo: logar, no `beforeAll`/no 404, se o pool está
  aberto e o valor de `process.env.NUTRI_API_KEY`, rodando até reproduzir.
- Decidir a correção de isolamento: ou garantir `pool.end()` único (global
  teardown do Vitest em vez de por-suíte), ou habilitar isolation por arquivo.
- Não é bloqueante para features; cada suíte passa **isolada**.

---

## KI-002 — Chave de pareamento sob override: 4 convenções, 2 rotas já divergem

**Status:** **parcialmente resolvido** (Sintoma A no caminho do override, feature 014) ·
**Área:** `apps/api` (registro/rebalance/ciclo/relatório) · **Prioridade:** média (era alta)
**Aberto em:** 2026-07-25 (revisão de arquitetura + grilling do candidato 01)
**Revisado em:** 2026-07-26 — o repro publicado aqui estava **errado**, os `file:line` sofreram
drift pós-012, e a investigação achou um bug **maior e não catalogado** (KI-005, já resolvido).

Decisões: [ADR-0001](adr/0001-chave-de-pareamento-sob-override.md) (**superseded** — manter
divergente) → [ADR-0003](adr/0003-option-choice-aceita-o-override-de-tipo-de-dia.md) (a decisão
tomada) · [ADR-0002](adr/0002-granularidade-divergente-nas-rotas-da-nutri.md) (o Sintoma B).

> **As duas condições do ADR-0001 foram cumpridas (2026-07-26).** O teste de colisão
> (`apps/api/test/colisao-position.e2e-spec.ts` — o único lugar da suíte que monta 2
> tipos-de-dia com `position` colidindo) e a decisão do dono (opção **(a)**).
>
> **O teste era oráculo de verdade, verificado por reversão** ANTES da correção: trocando o
> pareamento do `rebalance.service` para `position`, exatamente 2 dos 8 casos ficavam vermelhos;
> os outros 6 seguiam verdes — o que **provou** que aquele conserto (opção (b)) não resolveria o
> KI-005, e foi o que decidiu a rejeição dele.

### Correção de rumo: a atribuição a FR-013b era enganosa

A frase "`/today` faz o certo … FR-013b da 004" (abaixo) sugere que a 004 elegeu `position`
como chave. **Ela não elegeu.** `grep -c position specs/004-motor-le-registro/spec.md` = **0**:
a palavra não aparece uma única vez na spec. FR-013b só exige o invariante "contar cada slot
uma única vez", vive sob a seção _"Trocar tipo-de-dia recalcula pelo consumido"_ e tem como
único cenário de aceitação "quando o paciente troca de tipo-de-dia". `position` é decisão de
**plano** (`research.md:63`), atrelada a um parâmetro de uma função no `getToday`, e marcada lá
como **aproximação v0** válida só quando os tipos têm slots alinhados (`research.md:65`) — a
própria 004 usa `itemId` e não `position` no nível de item, justificando que "positions colidem
entre tipos" (`research.md:115`).

O endosso em nível de **spec** existe, mas é na **009** (FR-002: "o pareamento … é **por
posição** (type-agnostic)") — e a mesma 009 fecha a porta em FR-011: "NÃO deve alterar a
matemática do motor de rebalanceamento nem o que ele recalcula". Ou seja: precedente de
direção para o `/today`, **nenhum requisito que alcance** `POST /rebalance/option-choice`.
Portanto a escolha da chave segue sendo decisão de produto, exatamente como o ADR diz.

### Sintoma A — gramas erradas no app · **parcialmente resolvido (014)**

> **Recortado em 2026-07-26** por [ADR-0003](adr/0003-option-choice-aceita-o-override-de-tipo-de-dia.md):
>
> - ✅ **Resolvido** no caminho do override (gatilho numa refeição do tipo exibido, com
>   `dayTypeId` no corpo): a refeição registrada sai das alavancas e seu consumo real entra no
>   total. Pinado em `colisao-position.e2e-spec.ts`, bloco `014/US2`.
> - ⚠️ **Resíduo aceito** no caminho "registrei sob B → voltei para o tipo padrão A → escolho
>   opção em A": o evento de B segue invisível ao motor, enquanto `/today?dayTypeId=A` mostra o
>   badge por **posição** (009/FR-002). A divergência badge-vs-motor sobrevive **ali**. É
>   coerente com FR-013a da 004 ("o tipo padrão nunca auto-ajusta"), e fechá-la exigiria decidir
>   se o `/today` do tipo padrão deveria contar evento de outro tipo — o que **contradiz** aquele
>   FR. Decisão de produto separada. Pinado no bloco `014/A2`.
>
> A pergunta original deste KI ("`mealId` ou `position`?") era a **errada**: o defeito não estava
> na chave, estava em qual dia o motor recebia. Nenhuma troca de chave foi necessária.
>
> O texto abaixo fica como registro do diagnóstico original.

`registro.service.ts:119-137` grava como snapshot o `dayTypeId` do **override**; o `mealId`
vem do payload (`:370`) e é validado só contra o plano (`:158-174`), **nunca contra o
`dayTypeId` resolvido** — o evento cai no meal do tipo escolhido porque o app envia esse
`mealId`, e nada barra um par `mealId`/`dayTypeId` inconsistente.
`rebalance.service.ts:130-147` resolve o tipo-de-dia sempre pelo weekday do `day_schedule`,
e `:294` pareia o consumo por `porMeal.get(m.id)`.

Consequência: **refeição registrada sob override + troca de opção ⇒ a refeição comida NÃO
sai das alavancas** e entra planejada no total. O motor redistribui como se o paciente ainda
fosse comer o que já comeu — a grama exibida no app fica errada.

Note o contraste: `/today` faz o certo (`plan.service.ts:346-348` monta
`registeredPositions` **por `position`**, type-agnostic, FR-013b da 004). Só o
`rebalance.service` ficou com `mealId`.

### Sintoma B — duas rotas da nutri contam diferente

> **Recortado em 2026-07-26 por [ADR-0002](adr/0002-granularidade-divergente-nas-rotas-da-nutri.md).**
> A diferença de **granularidade** entre as duas rotas é **deliberada e legítima** — são
> perguntas diferentes, e o DTO do relatório é estruturalmente incapaz de expressar duas
> refeições na mesma `position` (só tem `position`/`nome`; o do ciclo tem `mealId`). O que **é
> defeito** e continua aberto aqui é o **descarte silencioso**: sob colisão, o
> `new Map([position, state])` do `relatorio.loader.ts` resolve por último-ganha arbitrário e o
> estado perdido **não vira `semRegistro`** — desaparece dos totais. Dois fatos entram, um sai,
> sem rastro.


Num dia em que duas refeições de tipos-de-dia diferentes ocupam a **mesma `position`**:

- `GET /nutri/patients/:id/cycles/:cycleId` preserva `mealId` → conta as duas
- `GET /nutri/patients/:id/cycles/:cycleId/report` colapsa por `position` → conta uma

As duas rotas **já divergem hoje**, sem nenhuma mudança de código.

### Por que nenhum teste pegava (até 2026-07-26)

A suíte era cega ao eixo: `relatorio.e2e-spec.ts:130-161` mapeia os 7 weekdays para **um**
`dayTypeId`; `adesao.e2e-spec.ts:284-290` pega só o plano ativo; `rebalance.e2e-spec.ts` opera
só no tipo-de-dia do weekday. Não existia cenário com dois tipos-de-dia, então a colisão de
`position` era inalcançável. **Agora existe:** `colisao-position.e2e-spec.ts`.

### ⚠️ O repro que estava publicado aqui NÃO demonstrava o Sintoma A

A versão anterior deste KI mandava registrar `feito` na pos 2 de B **e** `pulei` na pos 2 de A
no mesmo dia. O segundo evento é do tipo exibido, casa por `mealId`, sai das alavancas — e
**mascara** exatamente o efeito que se queria mostrar. Quem seguisse o roteiro concluiria que
não há bug.

**Repro limpo (o que o teste faz):** **um único** registro sob override — `mealId` e `dayTypeId`
ambos do tipo B — e nada no tipo A. Então `POST /rebalance/option-choice` com gatilho no tipo A,
duas vezes: antes e depois de inserir o evento. **Os corpos são byte-a-byte idênticos** — o
registro é invisível ao motor. O controle que dá poder ao teste é o mesmo fato gravado no tipo
**A** (mesma `position`!): aí o corpo muda.

Para o Sintoma B o repro segue válido: dois eventos vigentes no mesmo dia e mesma `position`,
em tipos diferentes → `GET /cycles/:id` conta **2**, `.../report` conta **1**, e o estado
perdido **não vira `semRegistro`** — desaparece dos totais (descarte silencioso em
`relatorio.loader.ts`, `new Map` com último-ganha).

### Drift de `file:line` (pós-012)

Os números citados acima são de antes da feature 012. Hoje: `rebalance.service.ts:294` → o
pareamento está em **`:285-286`**; `plan.service.ts:346-348` → **`:338`**.

### Próximo passo — o que RESTA deste KI

A decisão de produto foi tomada em 2026-07-26: **opção (a)**, implementada na feature 014
([ADR-0003](adr/0003-option-choice-aceita-o-override-de-tipo-de-dia.md)). A (b) — parear por
`position` — foi **rejeitada**: verificado por reversão que ela **não** mata o KI-005, e
obrigaria a inventar uma regra de desempate para colisão que o motor não tem.

Sobra deste KI, os dois com teste que os pina:

1. **O resíduo do Sintoma A** (caminho do tipo padrão) — ver o recorte acima. Precisa de decisão
   sobre FR-013a da 004, não de código.
2. **O Sintoma B** — o descarte silencioso do relatório sob colisão de `position`. Rota da nutri,
   caminho diferente; ver [ADR-0002](adr/0002-granularidade-divergente-nas-rotas-da-nutri.md),
   que separa a granularidade (deliberada) do descarte (defeito).

---

## KI-004 — A suíte e2e do `apps/api` só passava de segunda a sexta

**Status:** mitigado na suíte (2026-07-25) · **Área:** `apps/api` testes e2e · **Prioridade:** média
**Aberto em:** 2026-07-25 (descoberto ao levantar o baseline da feature 012, num sábado)

### Sintoma

`pnpm --filter api test:e2e` num **fim de semana**: `126 passed | 6 skipped`, com o
`beforeAll` de `rebalance.e2e-spec.ts` estourando
`TypeError: Cannot read properties of undefined (reading 'id')`. De segunda a sexta:
`132 passed`. Ninguém notou porque o desenvolvimento acontece em dia de semana.

### Causa

Duas camadas de acoplamento ao calendário, na suíte
`POST .../rebalance/option-choice (US2) — total do dia pelo consumo real`:

1. **Nome de alimento fixo.** O `beforeAll` resolvia o item de origem da substituição por
   `eq(food.name, 'Batata inglesa cozida')`, mas o tipo-de-dia vem do weekday do servidor
   (`:411`) e o seed programa **seg–sex → `treino`, sáb/dom → `descanso`**
   (`packages/db/scripts/seed.ts`). O jantar de `descanso` tem `Batata doce cozida`, não
   inglesa → `undefined` → `beforeAll` estoura → os 6 testes do `describe` são pulados.
2. **Asserções calibradas num plano só.** Resolver o item pelo **grupo** (o conserto óbvio)
   faz o `beforeAll` passar, mas 2 asserções continuam falhando: sob `descanso` a substituição
   Batata doce (76,76 kcal/100 g) → Mandioca gera um delta menor que sob `treino`
   (Batata inglesa, 51,59), o dia fica **dentro** da faixa e o motor devolve `sem-acao` em vez
   de `rebalanceado` — corretamente. O cenário que os testes precisam não existe no fim de
   semana.

### Mitigação aplicada

A suíte passou a **fixar** a programação de hoje em `treino` no `beforeAll` (idempotente) e
**restaurar** no `afterAll`, antes do `pool.end()`. Nenhuma asserção foi alterada — o cenário
ficou determinístico independente do calendário. O item de origem também passou a ser
resolvido por grupo (`Amidos e cereais` + `isLocked: false` + `ORDER BY id`), o que é correto
por si.

Ressalva: é **mutação de estado compartilhado**, o padrão que a revisão de arquitetura de
2026-07-25 apontou em `substitutions.e2e-spec.ts:290-292`. Contido por
`fileParallelism: false` + restore no `afterAll`; se o processo morrer no meio, a programação
de hoje fica em `treino` até o próximo `seed`.

### A classe do problema — **agora com module** (feature 013, 2026-07-26)

Existe `buildScenario` em `packages/db/src/testing/scenario.ts` (subpath
`@bamboo/db/testing`): o cenário é **declarado**, e o construtor detém a ordem de inserção, a
ordem reversa de FK do teardown, a data-calendário local (`localDate` — antes eram 5 cópias
byte-idênticas de `isoDaysAgo`) e a resolução determinística de nutricionista/food/grupo.
`everyWeekday('A')` torna o cenário independente do calendário **por construção**, que é
exatamente o que faltava aqui.

Migradas como prova: `colisao-position` (506 → 348 linhas) e `escopo-plano` (558 → 355),
**−361 linhas**, zero `insert(`/`delete(`/`getDay()` nas duas. A equivalência foi provada por
**reversão**, não presumida: os oráculos do KI-002 e os SC-007/SC-008 da 012 derrubam
exatamente os mesmos casos antes e depois.

**O que NÃO migra, e por quê** — três grupos com prognósticos diferentes, nomeados para
ninguém tentar o errado:

- **`relatorio.e2e` (460 de fixture) — migração dirigida, não oportunista.** É self-contained e
  o construtor corrige de graça dois defeitos reais dela (ver abaixo). Mas os denominadores
  `4/8` e `14/34` (`:785-787`) derivam dos 2 foods **arbitrários** que o Postgres devolveu, e a
  resolução determinística **muda** esses números — re-derivar é indistinguível de regressão.
  Quando for: fixar o food por nome explícito no spec.
- **`adesao.e2e` / `ciclo.e2e` — parcial por natureza, ~10 a 20 linhas cada.** O `beforeAll` de
  315 linhas da adesão é um **leitor** do plano semeado (alimenta `adesaoDoDia` para não
  hardcodar expectativa) — não é montagem. Os ciclos da `ciclo.e2e` são o comportamento **sob
  teste**. Não perseguir cobertura aqui.
- **`today`, `today-options`, `today-daytype`, `combine`, `substitutions`, `rebalance`,
  `registro`, `app` (8 suítes) — o construtor não as ajuda, hoje nem depois.** Elas fazem
  **zero** insert de plano: **resolvem** o seed. A dor delas é um leitor (paciente 12×, plano
  ativo 13×, weekday→tipo 9×) — outro module, outro seam, outra interface (**resolver**, não
  construir). Juntar os dois faria um module raso com duas semânticas e mataria a invariante
  "`destroy()` só apaga o que o cenário possui".

**Dois defeitos latentes achados no levantamento**, ainda vivos porque a suíte deles não migrou:

1. `relatorio.e2e-spec.ts:457-461` deleta `mealEvent` **sem** apagar `mealEventItem` antes — a
   FK não tem cascade. Passa **por sorte**: a suíte não cria nenhum `meal_event_item`. Um teste
   de `troquei` com snapshot ali quebraria o teardown.
2. `relatorio.e2e-spec.ts:103-106` faz `from(food).limit(2)` **sem `where`** — pode devolver
   alimento de 0 kcal e degenerar o alvo silenciosamente.

Ambos ficam impossíveis por construção sob o construtor (invariante I-2 + ordem de `destroy()`).

### O que sobra da classe do problema

O construtor cobre quem **monta**; quem **resolve** o seed segue acoplado:

- **10 pontos** resolvem o paciente com `select().from(patient).limit(1)` **sem `where` nem
  `order by`**: `today.e2e:20`, `today-options:18`, `today-daytype:54`,
  `rebalance:25`/`192`/`382`, `registro:28`/`259`/`730`, `combine:21`, `ciclo:55`,
  `adesao:280`.
- **8 pontos** reimplementam a resolução do tipo-de-dia por weekday — a mesma regra que o
  service sob teste implementa.
- Números do seed hardcoded em asserção: `rebalance.e2e-spec.ts:839` tem
  `const pisos = [20, 50, 42.5]`, que são 50% de 40 g / 100 g / 85 g do seed. Mudar uma grama
  no seed quebra o teste, sem nenhuma referência entre os arquivos.
- E um não-determinismo **no próprio seed**: o último `UPDATE` (`seed.ts:655-666`) trava UM item
  via `LIMIT 1` **sem `ORDER BY`** — pode ser o ovo do treino ou do descanso. `combine`,
  `substitutions` e `today-daytype` dependem desse único item travado.

**Próximo passo, para quem for mexer nessas 8 suítes:** o seam que falta é um **leitor** do
seed — não o construtor. Interface diferente (resolver, não construir), e o construtor
deliberadamente não a absorve. O `seed.ts` também não migrou: a exigência era que ele
**pudesse** ser chamador, e isso está provado pelo seam `executor` + um teste de rollback, sem
tocar o arquivo. Também fora daquele seam, e igualmente duplicado: bootstrap do Nest (17×),
`NUTRI_API_KEY` (5×), `nutriGet` (4×), `app?.close()`/`pool.end()` (18×) — um `bootstrapE2e()`
em `apps/api/test/` resolve.

---

## KI-005 — ~~A prévia de rebalanceamento está morta sob override~~ **RESOLVIDO**

**Status:** ✅ **resolvido** na feature 014 (2026-07-26) · **Área:** `apps/api` + `apps/mobile`
**Aberto em:** 2026-07-26 (achado colateral da investigação do KI-002; **não** estava no KI-002
nem no ADR-0001, e nenhum teste cobria) · **Fechado em:** 2026-07-26

> **Resolvido pela decisão (a)** — ver
> [ADR-0003](adr/0003-option-choice-aceita-o-override-de-tipo-de-dia.md). `POST option-choice`
> passou a aceitar um `dayTypeId` opcional, com a mesma semântica do `POST /registro`: o roster
> vira o do tipo exibido, o gatilho é encontrado, e o 404 morreu. Os 2 casos que asseriam o 404
> em `colisao-position.e2e-spec.ts` foram **invertidos** e agora asserem 200 + prévia
> (bloco `014/US1`).
>
> Ficou de graça no mesmo conserto: o **Sintoma A do KI-002** no caminho do override — com o
> roster certo o `mealId` do evento casa sozinho, sem trocar a chave de pareamento.
>
> O texto abaixo fica como registro do que era.

### Sintoma

Com o picker de tipo-de-dia em override (`/today?dayTypeId=B`), **tocar qualquer chip de opção
devolve 404** — com ou sem registro, em qualquer refeição:

```
POST /patients/:id/rebalance/option-choice  { triggerMealId: <meal do tipo B>, ... }
→ 404 "refeição do gatilho não está no dia corrente"
```

Ou seja: o rebalanceamento — que é a tese central do produto ("adaptar, não apenas mostrar") —
é **inalcançável** enquanto o paciente estiver vendo outro tipo-de-dia. É pior que o Sintoma A
do KI-002: lá o número sai errado, aqui a função não roda.

### Causa

Assimetria de contrato entre os dois endpoints que o app chama da mesma tela:

- **`POST /registro` aceita** `body.dayTypeId` (grava o snapshot do override).
- **`POST /rebalance/option-choice` NÃO aceita** tipo-de-dia:
  `OptionChoiceRequest = { triggerMealId, chosenOptionId }`
  (`packages/types/src/rebalance.ts:8`), controller sem query
  (`rebalance.controller.ts:46`).

Então o rebalance sempre resolve o tipo pelo weekday (`rebalance.service.ts:136-152`), monta o
roster com `meal.dayTypeId = sched.dayTypeId` (`:177`) e **rejeita duro** um gatilho fora dele:
`meals.find((m) => m.id === body.triggerMealId)` → `NotFoundException` (`:243-247`).

E o app alcança esse estado sem esforço: `HomeScreen.tsx` renderiza `meal.options.map(...)`
**sem consultar `overrideActive`** — só o *desfazer do registro* é gateado (`:507-528`). O
`triggerMealId` enviado é o `meal.id` do cardápio **exibido**, que sob override é sempre do
tipo B.

### Por que nenhum teste pegava

`rebalance.e2e-spec.ts` só opera no tipo-de-dia do weekday (e desde a 012/T000 **fixa** a
programação de hoje para garantir isso — ver KI-004). Nenhuma suíte combinava override com
`option-choice`.

### Estado

Caracterizado em `apps/api/test/colisao-position.e2e-spec.ts` (bloco `KI-005`). O teste pina o
404 e o fato de que **toda** refeição exibida sob override é inalcançável.

**Verificado por reversão:** consertar o KI-002 pelo caminho **(b)** (parear por `position`)
deixa este 404 **intacto** — os casos do KI-005 seguem verdes. Só o caminho **(a)** (aceitar o
override no `option-choice`) resolve os dois de uma vez.

### Próximo passo

Decidir junto com o KI-002, porque o conserto (a) resolve ambos. As perguntas de produto que
faltam: sob override, o dia é comparado contra a faixa-alvo de **qual** tipo — o exibido ou o do
weekday? E o que acontece quando o tipo exibido não tem refeição na `position` registrada?
Nenhum artefato (004, 009, 011) responde.

---

## KI-003 — Leitura do consumo real não tem snapshot: `troquei` pode render `itens: []`

**Status:** aberto · **Área:** `apps/api` leitura de `meal_event` · **Prioridade:** baixa
**Aberto em:** 2026-07-25 (levantado pelo crítico YAGNI no grilling do candidato 01)

### Sintoma

Ler o consumo real são **4 queries sequenciais sem transação**: os eventos, depois a opção
cumprida, depois os itens planejados, depois o snapshot em `meal_event_item`
(`registro-consumo.ts:64-202`, `adesao-consumo.ts:56-189`).

Se um `POST /registro` de `troquei` commitar entre a query 1 e a query 4, o evento aparece
como `troquei` mas seus `meal_event_item` ainda não estão visíveis ⇒ `itens: []` ⇒ o
consumido vem **a menos** ⇒ o rebalanceamento aumenta indevidamente as refeições restantes.

Falha **silenciosa**: sem erro, sem log, sem tipo violado. Reprodução por corrida.

### Estado

**Pré-existente e inalterado pela feature 012** (implementada em 2026-07-25) — o mesmo número
de queries separadas antes e depois: a 012 moveu as 4 queries de 2 arquivos para o
empilhamento `registro-vigente.loader` (1 query) + `consumo-real.loader` (3 queries), e a
janela de exposição é idêntica. Registrado para não ser confundido com regressão da 012.

Os `file:line` do sintoma acima são **pré-012**; os arquivos citados não existem mais. Hoje o
mesmo problema vive em `apps/api/src/registro-vigente.loader.ts` +
`apps/api/src/consumo-real.loader.ts`.

### Próximo passo

Envolver a leitura num `db.transaction` (o Postgres dá snapshot consistente dentro da
transação, mesmo em `READ COMMITTED`, para os `SELECT` de um mesmo statement — aqui são
statements distintos, então precisa de `REPEATABLE READ` ou de uma query só). **Ficou barato
com a 012:** existe **um** ponto de composição (os 2 loaders empilhados, chamados em sequência
por 5 call sites) em vez de 5 cópias para envolver uma a uma.

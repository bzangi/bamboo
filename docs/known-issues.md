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

**Status:** aberto · **Área:** `apps/api` (registro/rebalance/ciclo/relatório) · **Prioridade:** alta
**Aberto em:** 2026-07-25 (revisão de arquitetura + grilling do candidato 01)

Ver [ADR-0001](adr/0001-chave-de-pareamento-sob-override.md) para a decisão de manter como
está. Este KI guarda os dois sintomas e o repro.

### Sintoma A — gramas erradas no app (bug de comportamento)

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

### Sintoma B — duas rotas da nutri contam diferente (divergência de contrato)

Num dia em que duas refeições de tipos-de-dia diferentes ocupam a **mesma `position`**:

- `GET /nutri/patients/:id/cycles/:cycleId` preserva `mealId` → conta as duas
- `GET /nutri/patients/:id/cycles/:cycleId/report` colapsa por `position` → conta uma

As duas rotas **já divergem hoje**, sem nenhuma mudança de código.

### Por que nenhum teste pega

A suíte é cega ao eixo: `relatorio.e2e-spec.ts:130-161` mapeia os 7 weekdays para **um**
`dayTypeId`; `adesao.e2e-spec.ts:284-290` pega só o plano ativo. Não existe cenário com dois
tipos-de-dia, então a colisão de `position` é inalcançável.

### Repro sugerido (o teste que falta)

Plano com **2 tipos-de-dia** (A e B) cujas refeições de `position: 2` são distintas;
`POST /registro` com `body.dayTypeId` do tipo B (override) marcando `feito` na refeição pos 2
de B; e um `pulei` na refeição pos 2 de A no mesmo `loggedDate`. Então:

1. asserir `report.registro.totais` vs `GET /cycles/:id` — divergem
2. `POST /rebalance/option-choice` com gatilho em outra refeição — asserir se a pos 2
   aparece nas alavancas (hoje aparece; não deveria)

### Próximo passo

Decisão de **produto** sobre qual chave é a certa (ADR-0001 lista o trade-off nas duas
direções), com o teste de colisão escrito antes. Não é escopo da 012, que tem por critério
de sucesso "nenhum número muda".

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

### A classe do problema (não mitigada)

Este é um sintoma de algo maior — a suíte depende de detalhes do fixture de produção:

- **10 pontos** resolvem o paciente com `select().from(patient).limit(1)` **sem `where` nem
  `order by`**: `today.e2e:20`, `today-options:18`, `today-daytype:54`,
  `rebalance:25`/`192`/`382`, `registro:28`/`259`/`730`, `combine:21`, `ciclo:55`,
  `adesao:280`.
- **8 pontos** reimplementam a resolução do tipo-de-dia por weekday — a mesma regra que o
  service sob teste implementa.
- Números do seed hardcoded em asserção: `rebalance.e2e-spec.ts:791` tem
  `const pisos = [20, 50, 42.5]`, que são 50% de 40 g / 100 g / 85 g do seed. Mudar uma grama
  no seed quebra o teste, sem nenhuma referência entre os arquivos.

Próximo passo real: o **construtor de cenário** (candidato 04 da revisão de arquitetura de
2026-07-25) — `criarCenario(spec)` em `packages/db`, que devolve os ids resolvidos e faz o
`seed.ts` virar um chamador. Enquanto isso não existe, cada suíte segue acoplada ao João da
Silva.

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

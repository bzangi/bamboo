# Tasks: Leitura do registro — um leitor de `meal_event`

**Input**: [spec.md](./spec.md) · [plan.md](./plan.md) · [research.md](./research.md) (D1–D7)

**Prerequisites**: gate único (D7) — **este arquivo** é o que precisa da aprovação do Bruno.

**Verificação já feita**: 3 verificadores independentes checaram ~180 referências `file:line`
destes artefatos contra o código, e um revisor simulou a execução deste plano. As correções
estão aplicadas; os furos que ele achou estão marcados com ⚠️ nas tasks afetadas.

**Organization**: por fase, com os testes que faltam **antes** de qualquer extração
(pré-requisito não-negociável de 2 dos 3 críticos adversariais). Duas categorias, que exigem
comportamento oposto:

- **Caracterização** (T-A, T-D) — escrita contra o código **atual**, precisa passar **VERDE de
  primeira**. Se falhar, ou o teste está errado ou o comportamento foi entendido errado:
  **pare e avise**, não "corrija" o código.
- **TDD clássico** (T-C) — precisa **FALHAR** primeiro (RED observado), porque afirma
  comportamento novo.

**Baseline a preservar**: core **157** · `apps/api` **132** (= 119 e2e em `test/*.e2e-spec.ts`
+ 13 unit colocados em `src/**/*.unit.test.ts`) · mobile **24**. Nenhuma expectativa existente
pode ser alterada — **nem comentário** de `*.e2e-spec.ts` (SC-001). Note que
`rebalance.e2e-spec.ts:171`, `:337` e `today-daytype.e2e-spec.ts:24` citam em comentário o
helper que vai ser apagado: esses comentários ficam **obsoletos de propósito**.

## Path Conventions

Núcleo em `packages/core/src/`, casca em `apps/api/src/` (raiz, sufixo `.loader.ts` — D6),
e2e em `apps/api/test/`. **Sem migration. Sem `apps/mobile`. Sem `packages/types`. Sem
`@Injectable` nos loaders** — são funções livres que recebem `db`, como os 3 helpers atuais.

## Git

Commits direto na `main`, um por checkpoint (padrão 006–011).

---

## Phase 1: Setup

- [ ] **T001** Registrar o baseline rodando as 3 suítes **antes** de qualquer mudança:
      `pnpm --filter @bamboo/core test` (157) · `pnpm --filter api test:e2e` (132, com
      docker+seed) · `pnpm --filter mobile test` (24). Anotar as contagens no commit — é o ponto
      de comparação de SC-001.
- [x] **T002** [P] `CONTEXT.md` na raiz (**novo**) — glossário de domínio, incl. **registro
      vigente**, **consumo real** e **escopo de plano** (D6). *Feito.*
- [x] **T003** [P] `docs/adr/0001-chave-de-pareamento-sob-override.md` (**novo diretório**) —
      decisão D4. *Feito.*
- [x] **T004** [P] `docs/known-issues.md` — KI-002 e KI-003. *Feito.*
- [ ] **T005** Apontar `.specify/feature.json` para `specs/012-leitura-do-registro`

**Checkpoint**: baseline registrado, decisões documentadas onde uma próxima revisão as acha.

---

## Phase 2: A leitura descartada do relatório (independente)

**Purpose**: FR-011 — colher o ganho que não depende de nada desta feature. Os 3 críticos
disseram para fazer primeiro.

**Depende de**: T001

- [ ] **T006** Extrair `janela(patientId, cycleId)` de `CicloService.detalhe`
      (`apps/api/src/ciclo/ciclo.service.ts:262-294`), **sem** carregar `registros`.
      ⚠️ **`janela` DEVE conter os dois guards que `detalhe` tem hoje**: `exigirPaciente`
      (`:266`) e o 404 de "ciclo não encontrado no paciente" (`:282`) —
      `relatorio.service.ts:87` documenta que herda o 404 de lá. Sem eles, um `cycleId`
      inexistente vira 500 ao acessar `janela.startedOn` (violaria FR-008). `detalhe` passa a
      compor `{...janela, registros}` **sem repetir** os guards. `CicloDetalheResponse` e o
      contrato HTTP intocados.
- [ ] **T007** `relatorio.service.ts:87` e `:177` passam a chamar `janela` em vez de `detalhe`.
      Verificado: `detalhe.registros` **nunca** é lido em `apps/api/src/relatorio/`.
- [ ] **T008** ⚠️ Rodar a suíte **completa** do `apps/api` (132), não só `ciclo.e2e` (17 casos)
      e `relatorio.e2e` (13): `janela`/`detalhe` são compartilhados e a suíte tem flakiness de
      isolamento conhecida entre `registro.e2e` e `rebalance.e2e` (KI-001). Zero expectativa
      alterada — `ciclo.e2e-spec.ts:487-506` já pina o payload de `detalhe`.

**Checkpoint**: `GET .../report` sai de 3 range-scans de `meal_event` por ciclo para 2.
Commit: `perf(api): 012 — janela do ciclo sem registros`.

---

## Phase 3: Os testes que faltam

**Purpose**: FR-012 — tornar observáveis os dois eixos a que a suíte é cega. Sem isso, "tudo
verde" não é evidência de nada.

**Depende de**: T001

- [ ] **T009** **[CARACTERIZAÇÃO — deve passar VERDE de primeira]** T-A, escopo de plano.
      Suíte e2e nova `apps/api/test/escopo-plano.e2e-spec.ts`, **self-contained**.

      ⚠️ **O desenho original não discriminava.** `GET /today` sem override filtra
      `inArray(mealEvent.mealId, mealIds)` do plano ativo (`plan.service.ts:143`), e como
      `meal → day_type → plan` uma refeição nunca é compartilhada entre planos: o evento do
      plano aposentado sai pelo filtro de `mealId` **mesmo sem** o de `planId`. Idem no
      rebalance, que lê por `porMeal.get(m.id)` (`rebalance.service.ts:294`). Trocar o escopo
      para `qualquer-plano` nesses dois sites não mudaria uma vírgula — o teste passaria igual e
      SC-007 não seria alcançado.

      **Asserções que de fato discriminam:**
      1. `GET /nutri/patients/:id/adesao?from&to` — plan-scoped e **sem** filtro de `mealId`
         (`adesao-consumo.ts:69-76`). É o único consumidor onde as duas convenções produzem
         números diferentes. Asserir `valorPct`/`media` do dia do evento.
      2. `GET /patients/:id/today?dayTypeId=<tipo do P2>` com o evento do P1 numa refeição de
         **mesma `position`** que um slot do tipo do override. É o caminho type-agnostic
         projetado por posição (`plan.service.ts:338-348`): com escopo errado, o badge
         apareceria e a alavanca daquela posição sairia.
      3. `GET /nutri/patients/:id/cycles/:cycleId` — **conta** o evento do P1
         (`ciclo.service.ts:374-379` não filtra `planId`).

      **Fixture (enumerado — é a task mais caras do plano):** `nutritionist` (FK notNull de
      `patient`) → `patient` → plano **P1 `isActive:false`** e **P2 `isActive:true`** → **≥2
      `dayType` no P2** (para o override) + 1 no P1 → `daySchedule` do weekday de **hoje** em
      cada plano usado (sem isso, `plan.service.ts:100` responde "sem programação para o dia
      corrente") → `meal` com `position` casando entre os tipos → `mealOption` default →
      `mealItem` referenciando `food` do TACO já semeado → `cycle` cobrindo hoje →
      `process.env.NUTRI_API_KEY` + header `x-nutri-key` (padrão
      `relatorio.e2e-spec.ts:22-23`, `:61-62`) → Testing module com `PlanModule` +
      `RebalanceModule` + `CicloModule` + `AdesaoModule`.
      **`afterAll` obrigatório mesmo em falha**, em ordem reversa de FK: `mealEventItem` →
      `mealEvent` → `cyclePlanVigencia` → `cycle` → `mealItem` → `mealOption` → `meal` →
      `dayType` → `daySchedule` → `plan` → `patient` → `nutritionist`. ⚠️ Não é opcional: 10
      pontos das suítes existentes fazem `select().from(patient).limit(1)` **sem `where` nem
      `order`**, então um paciente-cenário sobrevivente pode ser sorteado por elas.
- [ ] **T010** [P] **[CARACTERIZAÇÃO — deve passar VERDE de primeira]** T-D, janela do dia.
      Na mesma suíte: `meal_event` de **ontem** no paciente + plano ativo → `GET /today` de
      hoje não muda (nenhum ajuste, nenhum `registro`). Converte em invariante a imunidade que
      hoje vem de `eq(loggedDate, localToday())` — **antes** de parametrizar `from/to`.
- [ ] **T011** **[TDD — escrever e VER FALHAR]** T-C e2e, empate de ordenação. Na mesma suíte:
      dois `meal_event` no mesmo `(paciente, refeição, dia)` com `created_at` **idêntico** e
      `state` diferente (inserir com `createdAt` explícito para forçar o empate) → asserir
      **qual** deve ganhar: o de maior `id`, dado `ORDER BY logged_date, created_at, id`; e que
      `dayTypeId`/`chosenMealOptionId` observáveis vêm do **mesmo** evento.
      ⚠️ **Rodar 3× e confirmar que falha nas 3.** Hoje o vencedor é arbitrário
      (`plan.service.ts:131-145` sem `ORDER BY` + `seq = getTime()` em `:154`), então o teste
      pode passar por sorte — RED por sorte não é RED. Se passar, ajuste a asserção até que ela
      distinga.
- [ ] **T012** Rodar a suíte completa: **132 + T-A + T-D verdes**, T-C **vermelho**, nenhuma
      expectativa antiga tocada.

**Checkpoint**: os dois eixos cegos passam a ter oráculo. Commit:
`test(api): 012 — caracterização de escopo e janela (T-A/T-D) + RED do empate (T-C)`.

---

## Phase 4: Núcleo — `eventoVigente`

**Purpose**: FR-004/FR-005/FR-010.

**Depende de**: T012

- [ ] **T013** **[TDD — escrever e VER FALHAR]** Casos novos em
      `packages/core/src/registro.test.ts` para `eventoVigente`: lista vazia → `null` ·
      vencedor tombstone → `null` · array fora de ordem → a linha de maior `seq` (não a última
      do array) · **empate de `seq` → mantém o PRIMEIRO** (`>`, nunca `>=`) · a linha devolvida
      é a **mesma** de onde vem o `state` · **equivalência**: para toda entrada,
      `eventoVigente(e)?.state ?? null === estadoVigente(e)` — trava FR-010 bit-a-bit.
- [ ] **T014** Implementar `eventoVigente` em `packages/core/src/registro.ts` até T013 verde,
      com o retorno **narrowed** (`(T & { state: EstadoRegistro }) | null`) para que nenhum
      chamador precise de cast. Re-expressar `estadoVigente` como
      `eventoVigente(eventos)?.state ?? null`.
      ⚠️ **Nada a fazer no barrel**: `packages/core/src/index.ts:11` já é
      `export * from "./registro.js"`. Confirmar com `pnpm --filter @bamboo/core build` + um
      import em `apps/api`.
- [ ] **T015** Confirmar `registro.service.ts` (`:197`, `:461` — caminho de escrita) compilando
      e verde **sem alteração**: já usa `seq = índice` (D3). Não "consertar" o `ORDER BY` de
      `:192`/`:449` (sem `, id`) — FR-001 exclui o caminho de escrita.

**Checkpoint**: a regra tem uma casa e é testável sem banco. Commit:
`feat(core): 012 — eventoVigente devolve a linha vencedora`.

---

## Phase 5: `registro-vigente.loader.ts`, o único leitor

**Purpose**: FR-001/FR-002/FR-003.

**Depende de**: T014

- [ ] **T016** Criar `apps/api/src/registro-vigente.loader.ts` conforme o contrato do
      [plan.md](./plan.md). 1 query `meal_event ⋈ meal` com
      `ORDER BY (logged_date, created_at, id)`; agrupa por `(date, mealId)`; `seq = índice`;
      `eventoVigente`; descarta tombstone.
      ⚠️ **Ordem de saída = primeira aparição** de cada `(date, mealId)` na query ordenada —
      é o que o agrupamento por `Map` produz hoje. **Não** é a ordem do `created_at` do evento
      *vencedor*: trocar isso muda quem ganha uma colisão de `position` em
      `relatorio.loader.ts:225-229` e a ordem do array de `registros` do ciclo, pinada em
      `ciclo.e2e-spec.ts:487-506`. Escrever isso no docblock.
      ⚠️ **Descartar com `if (ev === null) continue`, nunca com cast.** Com o retorno narrowed
      de T014 o `tsc` já garante `state: EstadoRegistro`; um `as EstadoRegistro` apagaria o
      descarte do tombstone e faria refeições desfeitas reaparecerem nos 5 consumidores.
- [ ] **T017** [P] Migrar `ciclo.service.registrosDaJanela` (`:359-413`) →
      `carregarRegistroVigente({escopo:{kind:'qualquer-plano'}})`; o `sort` por
      `(date, position)` (`:410-412`) **fica** no ciclo. Apagar a função privada.
- [ ] **T018** [P] Migrar `relatorio.loader.ts:84-146` →
      `carregarRegistroVigente({escopo:{kind:'qualquer-plano'}})`. **O resto do loader fica**:
      `enumerarDias`/`weekdayOf` (`:37-55`), `planoVigenteEm` (`:57-68`), fallback + Q3-B
      (`:148-191`), roster (`:193-216`) — D5, candidato 05. ⚠️ O `new Map(...)` de `:225-229`
      depende da ordem de entrada (último-ganha): não mexer.
- [ ] **T019** Migrar `plan.service.ts:131-160` → **uma** chamada a
      `carregarRegistroVigente({from:hoje,to:hoje,escopo:{kind:'plano',planId}})`.
      ⚠️ **A query nova é type-agnostic** — NÃO aplicar `inArray(mealId, mealIds)` nela. O
      filtro por `mealIds` vira `.filter()` em memória e serve **só** para montar
      `estadoPorMeal`. Aplicá-lo na query mataria `registroPorPosition`/`registeredPositions`
      (`:338-348`), que é exatamente o bug que a 004 corrigiu: a refeição comida no tipo antigo
      desapareceria do consumido.
      Apagar a query local e os comentários `:127-128` e `:152-154`, que documentam o
      raciocínio errado (D3).
- [ ] **T020** Rodar a suíte completa: 132 + T-A/T-D verdes, T-C ainda pode estar vermelho até
      T019 entrar (depois dele deve passar). Zero expectativa alterada.

**Checkpoint**: um leitor, ordem determinística, escopo explícito em 4 call sites. Commit:
`feat(api): 012 US1 — registro-vigente.loader, o único leitor de meal_event`.

---

## Phase 6: `consumo-real.loader.ts` empilhado, e as deleções

**Purpose**: FR-006/FR-007/FR-013.

**Depende de**: T016 (e T019 para a T023)

- [ ] **T021** Criar `apps/api/src/consumo-real.loader.ts` a partir de `adesao-consumo.ts`
      (que já é o superconjunto): `carregarConsumoReal(db, vigentes)` — **recebe** os vigentes,
      **não** consulta `meal_event` (`meal_event_item` é legítimo — é o snapshot). Preserva sem
      alteração: fallback D9 da opção cumprida, o switch `pulei`/`feito`/`troquei`, e as 3
      queries batch. **Não** devolve agregado do dia (FR-007).
      ⚠️ **`pulei` continua NO MAPA com `itens: []`** (`registro-consumo.ts:208-209`). Filtrar
      "quem tem itens" reintroduz double-count: a pulada precisa entrar como
      `isRegistered: true` com 0 kcal (`rebalance.service.ts:294-305`).
      ⚠️ **`dayTypeId` NÃO entra em `RefeicaoConsumida`** — vem dos vigentes.
- [ ] **T022** Migrar `adesao.service.ts:148` → `carregarRegistroVigente({from,to,escopo:
      {kind:'plano',planId}})` + `carregarConsumoReal`. O `somaNutrientes` de `:204-205` já está
      no call site — mantém.
      ⚠️ **O Q3-B de `:183-190` muda de FONTE, não de regra.** Hoje o `dayTypeId` vem de
      `ConsumoRefeicaoAdesao` (`adesao-consumo.ts:24`); passa a vir de
      `RegistroVigente.dayTypeId`, pareado por `(date, mealId)`. A decisão Q3-B em si é intocada
      (D5) — não mexer no `new Set(registradas.map(r => r.dayTypeId))`, só na origem do dado.
- [ ] **T023** Migrar `plan.service.ts:329` → **reusa os mesmos vigentes de T019** (segunda
      leitura eliminada — SC-005) + `carregarConsumoReal` + `somaNutrientes` no call site.
      `localToday()` sai do loader para o call site (uma leitura de relógio por request).
      ⚠️ **Preservar o early-return de `:333`** na forma `if (vigentes.length === 0) return {}`,
      **antes** de qualquer `?? new Map()`. Passar um `Map` vazio adiante faz
      `today.mapper.ts:203-205` escolher o ramo por `position` e **apagar todos os badges do
      dia** (FR-013). Ver o trecho campo-a-campo no plan.md.
      **Depende de**: T019, T021.
- [ ] **T024** Migrar `rebalance.service.ts:266` → `carregarRegistroVigente` +
      `carregarConsumoReal`. ⚠️ **Sem `somaNutrientes`** — o rebalance destrutura só `porMeal`
      e o total vem do núcleo via `diaComEscolha`; uma variável de agregado aqui é código morto
      que o `no-unused-vars` barra no done-gate. ⚠️ **Importar `localToday` de
      `../local-date`** (o service não importa hoje) e passar `from = to = localToday()` — usar
      `new Date().toISOString()` desloca a janela na virada do dia.
      ⚠️ **`:294` continua pareando por `mealId`** (ADR-0001). O consumo real agora devolve
      `position` no mesmo objeto: não "consistentificar".
- [ ] **T025** **Apagar** `apps/api/src/registro-consumo.ts` (240) e
      `apps/api/src/adesao/adesao-consumo.ts` (225). Confirmar 0 imports órfãos.
      ⚠️ Os comentários de `rebalance.e2e-spec.ts:171`, `:337` e `today-daytype.e2e-spec.ts:24`
      que citam o helper apagado **ficam como estão** — T026 exige `git diff` vazio nos
      `*.e2e-spec.ts` existentes.
- [ ] **T026** Rodar a suíte completa: 132 + T-A/T-D/T-C **todos verdes**, zero expectativa
      alterada. E agora os greps de SC-002/SC-003 fazem sentido (antes de T025 eram
      insatisfazíveis, porque os dois arquivos ainda existiam).

**Checkpoint**: os 2 modules empilhados servem os 5 consumidores; 465 linhas apagadas. Commit:
`feat(api): 012 — consumo-real.loader empilhado; registro-consumo e adesao-consumo apagados`.

---

## Phase 7: Verificação e done-gate

**Depende de**: T026

- [ ] **T027** Verificar os critérios de sucesso, um por um, com comando:
      **SC-001** `git diff` nos `*.e2e-spec.ts` existentes vazio + as 3 contagens ·
      **SC-002** `grep -rn 'schema\.mealEvent\b' apps/api/src` (com `\b`, senão casa
      `mealEventItem`) · **SC-003** `grep -rn 'estadoVigente(' apps/api/src` (a **chamada**; o
      campo homônimo do `today.mapper` permanece e é esperado) · **SC-004** arquivos não existem
      · **SC-005/SC-006** ⚠️ **não existe logger de SQL** (`packages/db/src/client.ts:14` não
      passa `logger`): contar por leitura de código nos call sites, ou habilitar
      `drizzle(pool, {schema, logger: true})` temporariamente num run local e contar os
      `select ... from "meal_event"` de um request · **SC-007/SC-008** reverter localmente
      (trocar o escopo para `qualquer-plano`; tirar o `, id` do `ORDER BY`) e confirmar que
      T-A e T-C ficam **vermelhos** · **SC-009** `git diff --stat`.
- [ ] **T028** Done-gate do `CLAUDE.md`: `pnpm lint` + `pnpm format` na raiz +
      `pnpm check-types`. Nenhuma task fecha com lint ou formatação quebrados.
- [ ] **T029** Atualizar `docs/estado-atual.md` e o bloco SPECKIT do `CLAUDE.md`: 012
      implementada, o que mudou de forma e o que **não** mudou de comportamento, os artefatos
      novos (`CONTEXT.md`, ADR-0001, KI-002/003), e o que ficou para o candidato 05 (Q3-B +
      fonte do fallback).

**Checkpoint final**: saldo de linhas negativo, zero mudança de comportamento, dois eixos que
eram cegos agora têm oráculo.

---

## Dependências

```
T001 ──┬─→ T006 → T007 → T008                              (Phase 2, independente)
       └─→ T009 ∥ T010 ∥ T011 → T012                        (Phase 3, testes primeiro)
                                 └─→ T013 → T014 → T015     (Phase 4, núcleo)
                                              └─→ T016 ──┬─→ T017 ∥ T018 ∥ T019 → T020
                                                         └─→ T021 ──┬─→ T022 ∥ T024
                                                                    └─→ T023  (depende TAMBÉM de T019)
                                                                         └─→ T025 → T026 → T027 → T028 → T029
```

T002–T004 já feitos. `[P]` = paralelizável com o vizinho marcado.
**T023 depende de T019 e T021** — não executar em paralelo com T019.

## O que NÃO fazer nesta feature

Guardas explícitas. As 6 primeiras são decisões; as demais vieram do revisor que simulou a
execução — cada uma é um escorregão natural no calor da migração.

1. **Não** unificar Q3-B nem a fonte do fallback de plano (candidato 05 — muda número).
2. **Não** padronizar `mealId`/`position` "para ficar consistente" (ADR-0001 — muda grama).
3. **Não** mexer em `MAX_DIAS` nem nos códigos 400/422 divergentes.
4. **Não** mover o roster de refeições esperadas para o loader novo.
5. **Não** adicionar `db.transaction` na leitura (KI-003 — escopo separado).
6. **Não** alterar nenhuma expectativa — nem comentário — de teste existente.
7. **Não** aplicar `inArray(mealId, mealIds)` na query nova do `plan.service` (T019).
8. **Não** passar `Map` vazio onde hoje há early-return (T023 — apaga os badges).
9. **Não** filtrar `pulei` do mapa de consumo (T021 — volta o double-count).
10. **Não** trocar a ordem de agrupamento (primeira aparição) pela do evento vencedor (T016).
11. **Não** usar `>=` no desempate de `eventoVigente` — `>` mantém o primeiro, e é o que trava
    a equivalência bit-a-bit do FR-010 (T013/T014).
12. **Não** transformar os loaders em `@Injectable` nem tocar `DbModule`/providers — os 3
    helpers atuais são funções livres que recebem `db`; manter o padrão. `CicloModule` e
    `AdesaoModule` já exportam seus services desde a 011.
13. **Não** afirmar determinismo global: o caminho de **escrita** ordena sem `, id`
    (`registro.service.ts:192`, `:449`) e segue arbitrário no empate. FR-001 o exclui.
14. **Não** trocar a fonte do nome do roster por `RegistroVigente.nome` — ele não tem
    consumidor, e trocar mudaria as refeições esperadas do relatório.
15. **Não** renomear `MealRow.estadoVigente` (`today.mapper.ts:73`) para "limpar o grep" —
      SC-003 já é escrito em cima da chamada, não do campo.

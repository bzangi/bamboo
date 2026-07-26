# Tasks: Construtor de cenário para as suítes e2e

**Input**: [spec.md](./spec.md) · [plan.md](./plan.md)

**Baseline a preservar**: core **164** · `apps/api` **147** · mobile **24**. Nenhuma expectativa
existente pode mudar (SC-001). Nas 2 suítes migradas, os blocos `it` devem ficar
**byte-idênticos** — só `beforeAll`/`afterAll`/helpers podem mudar.

**Git**: commits direto na `main`, um por checkpoint.

---

## Phase 1: Setup e o seam

- [x] **T001** Registrar o baseline (core 164 · api 147 · mobile 24) antes de tocar em nada.
- [x] **T002** Criar o subpath `@bamboo/db/testing`: entrada em `exports` do
      `packages/db/package.json` + `tsconfig.build.json` incluindo `src/testing/`.
      ⚠️ **Não** exportar pelo barril `src/index.ts` — o construtor é para teste e seed, e não
      pode virar dependência alcançável do runtime da API (A3).
      Gate: um import de `@bamboo/db/testing` compila no `apps/api` (`nodenext`/CJS — R4).

**Checkpoint**: o seam existe e resolve nos dois lados.

---

## Phase 2: O module (test-first)

**Depende de**: T002

- [x] **T003** **[TDD — escrever e VER FALHAR]** Unit do construtor em
      `packages/db/src/testing/scenario.test.ts`, cobrindo o que é **interface**, não
      implementation:
      · `localDate()` devolve data-calendário **local**, e `localDate(1)` = ontem (nunca UTC);
      · `everyWeekday('A')` = `{0..6: 'A'}`;
      · cenário mínimo materializa e os lookups do handle devolvem ids que existem no banco;
      · lookup inexistente **lança listando os labels existentes** (I-4), nunca devolve
      `undefined`;
      · `meal({dayType, position})` resolve plano e paciente por derivação (I-1/localidade);
      · **I-5**: dois ciclos abertos no mesmo paciente → erro **com mensagem**, não erro cru do
      Postgres; label duplicado → erro; `position` duplicada num tipo → erro;
      · **I-2**: dois apelidos de food distintos ⇒ ids distintos;
      · **SC-005 (o mais importante)**: `destroy()` não deixa resíduo — contagens de
      `patient`/`plan`/`day_type`/`day_schedule`/`meal`/`meal_option`/`meal_item`/`cycle`/
      `cycle_plan_vigencia`/`meal_event`/`meal_event_item` **idênticas** antes e depois;
      · **I-7**: `destroy()` **não** mexe em `food`/`substitution_group`/
      `food_substitution_group`/`food_household_measure` — contagens dessas 4 idênticas;
      · **I-1**: spec com apelido de food irresolvível **lança sem ter escrito nada** (contagem
      de `patient` inalterada depois do erro);
      · **o 2º adapter do seam**: `buildScenario` dentro de um `db.transaction` do chamador,
      com rollback, **não persiste nada** — é a prova de que o `seed.ts` pode ser chamador
      (FR-010) sem tocar o `seed.ts`.
- [x] **T004** Implementar `packages/db/src/testing/scenario.ts` até T003 verde, conforme os
      contratos do [plan.md](./plan.md).
      ⚠️ **Ordem obrigatória (I-1)**: resolver nutricionista + foods + grupos **antes** do
      primeiro insert.
      ⚠️ **Atomicidade**: transação própria **só** quando `opts.executor` é omitido; recebendo
      uma tx, usar como está (sem savepoint).
      ⚠️ `chosenMealOptionId` **forçado a null** em `pulei` e na anulação — é a regra do schema.
      ⚠️ Nunca `pool.end()` (I-6).
- [x] **T005** Rodar `pnpm --filter @bamboo/db test` + `pnpm --filter api test:e2e` (147 —
      ainda intacta) + `tsc`.

**Checkpoint**: o module existe, é testado sem Nest e não deixa resíduo.
Commit: `feat(db): 013 — buildScenario, o construtor de cenário para as suítes e2e`.

---

## Phase 3: Migrar `colisao-position` (a prova)

**Depende de**: T004 · **Por que primeiro**: é a menor (234 linhas de fixture) e tem oráculo
embutido contra o pior risco (R2).

- [x] **T006** Reescrever o `beforeAll`/`afterAll`/`afterEach` de
      `apps/api/test/colisao-position.e2e-spec.ts` sobre `buildScenario`.
      ⚠️ Os 8 blocos `it` ficam **byte-idênticos** — se um precisar mudar, é bug (R1).
      ⚠️ **Pinar `bandTolerancePct: 10` e `floorPct: 50` no paciente**: hoje a calibração
      160g/100g depende dos defaults semeados na nutricionista (`seed.ts:260-261`). Herdar esse
      acoplamento na migração seria migrar o problema.
      ⚠️ `group` por **nome canônico**, não `substitutionGroup limit(1)` sem `order by`.
      Usa: 2 tipos-de-dia com positions 1–3 colidindo · opção não-default calibrada ·
      `everyWeekday` · ciclo aberto + vigência · spec **sem** eventos + `addEvents` nos `it` +
      `clearEvents()` no `afterEach`.
- [x] **T007** Rodar a suíte migrada **isolada** e conferir 8/8; depois a completa (147).
      ⚠️ Conferir explicitamente que a pré-condição
      `expect(res.body.outcome.kind).toBe('rebalanceado')` **passa** — se virar `sem-acao` ou
      `recusa-orientada`, os 4 casos de comparação de corpo passam por **vacuidade** e a
      migração destruiu o poder de detecção (R2).
- [x] **T008** ⚠️ **Reprovar o oráculo do KI-002 depois da migração**: repetir a reversão
      (parear por `position` no `rebalance.service`) e confirmar que **exatamente 2** dos 8
      casos ficam vermelhos, como antes. Se o número mudar, a migração alterou o que o teste
      detecta.

**Checkpoint**: −~200 linhas, mesmo poder de detecção, provado por reversão.
Commit: `test(api): 013 — colisao-position sobre buildScenario`.

---

## Phase 4: Migrar `escopo-plano`

**Depende de**: T007

- [x] **T009** Reescrever o fixture de `apps/api/test/escopo-plano.e2e-spec.ts` (330 linhas)
      sobre `buildScenario`. Os 7 `it` ficam byte-idênticos.
      Cobre o que a `colisao` não cobre: 2 planos (P1 `active:false` / P2 `active:true`),
      3 tipos-de-dia entre eles, evento no plano aposentado por `dayType: 'P1'` (o
      discriminante do T-A), e `EventSpec.id` com os **4 uuids literais** do desempate de
      `created_at`.
      ⚠️ Apagar o `criarTipoDia` local (`:118-163`) — é uma versão pobre e uniforme da
      implementation do module.
- [x] **T010** Suíte isolada (7/7) + completa (147). ⚠️ Reconferir SC-007/SC-008 da **012** por
      reversão: unificar o escopo derruba as 2 asserções discriminantes do T-A; tirar o `, id`
      do `ORDER BY` derruba o T-C. A migração não pode ter enfraquecido nenhum dos dois.

**Checkpoint**: os 2 chamadores existem — o seam deixou de ser hipotético.
Commit: `test(api): 013 — escopo-plano sobre buildScenario`.

---

## Phase 5: Verificação e done-gate

**Depende de**: T010

- [x] **T011** Verificar os SCs com comando: **SC-001** as 3 contagens · **SC-002** ≥300 linhas
      de fixture a menos, somadas · **SC-003** `grep` nas 2 migradas por `insert(`, `delete(` e
      `getDay()` → zero · **SC-005** o teste de resíduo do T003 · **SC-006** `git diff` vazio
      nos `*.e2e-spec.ts` **não** migrados · **SC-007** `git diff --stat` com saldo negativo.
- [x] **T012** Done-gate: `pnpm lint` + `pnpm format` + `pnpm check-types`.
- [x] **T013** Atualizar `CONTEXT.md` (termo **cenário de teste**), `docs/estado-atual.md`, o
      bloco SPECKIT do `CLAUDE.md` e o **KI-004** (a classe do problema deixou de ser só
      "não mitigada": passou a ter module; registrar o que migrou e o que **não** migra nunca,
      com o porquê).

---

## Dependências

```
T001 → T002 → T003 → T004 → T005 ─→ T006 → T007 → T008
                                              └─→ T009 → T010 → T011 → T012 → T013
```

## O que NÃO fazer

1. **Não** exportar `buildScenario` pelo barril `src/index.ts` — vira alcançável do runtime.
2. **Não** migrar as 8 suítes que **resolvem** o seed em vez de montar: outro seam, outra
   interface (resolver, não construir). Juntar os dois faz um module raso com duas semânticas e
   mata a invariante "`destroy()` só apaga o que o cenário possui".
3. **Não** migrar `relatorio.e2e` agora: a resolução determinística (I-2) muda os denominadores
   nutricionais dela, e re-derivá-los é indistinguível de regressão.
4. **Não** tocar `scripts/seed.ts` — a exigência é que ele **possa** ser chamador, provado pelo
   seam + o teste de rollback.
5. **Não** trocar `throw` por `Result` no construtor (I-4 — decisão consciente; `Result` é
   disciplina do núcleo puro).
6. **Não** absorver o bootstrap do Nest / `NUTRI_KEY` / `nutriGet` nesta interface — seam de
   HTTP, deixaria este module raso.
7. **Não** criar `food`/grupos/medidas no construtor (I-7).
8. **Não** aceitar que a pré-condição `rebalanceado` da `colisao` vire `sem-acao` depois da
   migração — é vacuidade disfarçada de verde (R2).
9. **Não** alterar nenhum bloco `it` das 2 suítes migradas.
10. **Não** desenhar campo sem chamador hoje (FR-011) — a lista do que **saiu** está no
    plan.md.

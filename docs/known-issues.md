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

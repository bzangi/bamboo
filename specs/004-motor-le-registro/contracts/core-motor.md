# Contrato — Núcleo puro (`packages/core/src/rebalance.ts`)

Mudança mínima: `previewTrocaOpcao` fica ciente do registro. `rebalancearPorKcal` e `previewTrocaTipoDia` **não mudam** (só ganham consumidor). Sem I/O/throw/mutação.

## Tipo alterado

```ts
export interface RefeicaoDia {
  readonly position: number;
  readonly itens: readonly ItemDia[];
  readonly isRegistered: boolean; // NOVO — refeição com estado vigente registrado hoje
}
```

> A casca monta `isRegistered` por refeição (estado vigente != null). Campo **obrigatório** (TS strict): atualizar TODOS os literais `RefeicaoDia` — `rebalance.service.ts` (montagem do dia), `rebalance.test.ts` (~6 literais), `phase2.edge.test.ts` (~L86-87). Tarefa explícita no tasks.

## `previewTrocaOpcao` — agora exclui registradas (FR-001/FR-002)

Assinatura inalterada; só a seleção de alavancas muda:

```ts
// antes:  .filter((r) => r.position !== triggerPosition)
// depois: .filter((r) => r.position !== triggerPosition && !r.isRegistered)
const alavancas = diaComEscolha
  .filter((r) => r.position !== triggerPosition && !r.isRegistered)
  .flatMap((r) => r.itens.filter(ehAlavanca).map((i) => toAlavanca(i, r.position)));
```

- `alvo` = `alvoDoDia(refeicoesDefault)` — **inalterado** (alvo do plano, FR-008).
- `totalAtual` = `somaNutrientes(diaComEscolha.flatMap(itens))` — **inalterado** no core, mas a casca agora passa **itens reais** nas registradas (feito/troquei/pulei) → o total reflete o consumido (FR-005).
- A refeição do **gatilho** já sai por `position !== trigger` (mesmo se registrada). Coerente com o edge case "gatilho registrado".
- Direção/piso/recusa: via `rebalancearPorKcal` (inalterado) — `deltaKcal<0` aumenta, `>0` reduz, piso inviolável, recusa orientada.

## `previewTrocaTipoDia` — ganha consumidor (FR-011/FR-012)

**Não muda.** Já recebe `consumido: Nutrientes` + `refeicoesRestantesNovoTipo` + `refeicoesDefaultNovoTipo`; calcula `totalProjetado = consumido + restantePlanejado`, `deltaKcal = totalProjetado − alvoNovo`, e rebalanceia. A casca (`getToday`, na troca de tipo-de-dia) passa a chamá-lo com:

- `consumido` = agregado das registradas de hoje (real).
- `refeicoesRestantesNovoTipo` = **todas** as refeições do novo tipo (nenhuma registrada sob ele) — cada uma com `isRegistered:false`.
- `refeicoesDefaultNovoTipo` = defaults do novo tipo (alvo).

Saída: `RebalanceOutcome` (`rebalanceado` com `AlavancaAjustada[]` itemId→gramasNovo+medidaCaseira | `sem-acao` | `recusa-orientada`).

## Cobertura de teste (test-first, Vitest) — `rebalance.test.ts` (adições)

- `previewTrocaOpcao`: refeição **registrada não é alavanca** (isRegistered:true → fica intacta; só não-registradas ajustam).
- `previewTrocaOpcao`: registrada com consumo real **alimenta o totalAtual** (déficit do pulei → restante aumenta; troquei calórico → restante reduz).
- `previewTrocaOpcao`: todas as outras registradas (sem alavanca) → `recusa-orientada` (sem-alavanca).
- `previewTrocaOpcao`: gatilho registrado ainda é o gatilho (excluído de alavanca por position; não bloqueia).
- `previewTrocaTipoDia`: já coberto na Fase 2 (consumido alimenta totalProjetado) — **confirmar que segue verde** (o caso "consumido=0 → sem-acao / planejado" já existe em `rebalance.test.ts`, "início do dia"; não é caso novo). O casamento ajuste→item é por **`itemId`** (não position).

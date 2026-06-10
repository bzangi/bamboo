# Contrato — núcleo puro `packages/core/src/adesao.ts`

> Funções puras: sem I/O, sem `throw`, sem mutação. Erro estrutural como `Result`.

## `adesaoDoDia`

```ts
export interface AdesaoFlags {
  readonly carb?: "acima" | "abaixo";
  readonly protein?: "acima" | "abaixo";
  readonly fat?: "acima" | "abaixo";
}

export interface AdesaoDia {
  readonly valorPct: number; // 0–100, saturado na faixa de kcal
  readonly dentroFaixa: boolean; // classificação (FR-006a)
  readonly flags: AdesaoFlags; // só macros fora da respectiva faixa (FR-008)
  readonly cobertura: number; // 0–1 (FR-007)
}

export type AdesaoError = { readonly kind: "entrada-invalida" };
// toleranciaPct fora de [0,100], contagens negativas, registradas > refeições do tipo

export function adesaoDoDia(input: {
  readonly alvo: Nutrientes; // alvoDoDia(opções default do tipo que define o alvo)
  readonly consumido: Nutrientes; // somaNutrientes do consumo real das registradas
  readonly toleranciaPct: number; // resolverParametros(...)
  readonly refeicoesDoTipo: number; // denominador da cobertura (> 0 esperado)
  readonly refeicoesRegistradas: number; // numerador (pareadas por position — D4, casca)
}): Result<AdesaoDia, AdesaoError>;
```

**Invariantes** (cada uma vira teste):

1. **Saturação** (Q1a-B): `avaliarFaixa(consumido, alvo, tol).kcal === 'dentro'` ⇒ `valorPct === 100` e `dentroFaixa === true` — inclusive na borda exata (borda é "dentro", herdado de `avaliarFaixa`). _(SC-009.)_
2. **Desvio da borda mais próxima**: fora da faixa, `valorPct = max(0, 100 − 100×d/alvo.kcal)` onde `d = consumido.kcal − (alvo.kcal + margem)` se acima, `(alvo.kcal − margem) − consumido.kcal` se abaixo; `margem = alvo.kcal × tol/100`.
3. **Simetria** (FR-004/SC-003): X kcal abaixo da borda inferior ⇒ mesmo `valorPct` e mesma classificação que X acima da superior.
4. **Clamp**: desvio ≥ alvo.kcal ⇒ `valorPct === 0` (nunca negativo).
5. **Alvo zero** (D2): `alvo.kcal === 0 && consumido.kcal === 0` ⇒ 100/dentro; `alvo.kcal === 0 && consumido.kcal > 0` ⇒ 0/fora (sem divisão por zero).
6. **Flags** (Q1b-iii): `flags` contém exatamente os macros com `avaliarFaixa(...) !== 'dentro'`; kcal nunca aparece em `flags` (é o valor). _(SC-009.)_
7. **Cobertura**: `cobertura = refeicoesRegistradas / refeicoesDoTipo`; `refeicoesDoTipo === 0` ⇒ `err entrada-invalida` (dia sem refeições é "sem dado" — a casca nem chama o núcleo).
8. **Pureza**: mesmas entradas ⇒ mesmo resultado (SC-001); entradas não mutadas.

## `mediaAdesao`

```ts
export function mediaAdesao(valores: ReadonlyArray<number>): number | null;
```

**Invariantes**: média aritmética simples; `[]` ⇒ `null` (período sem dia com dado — US3.2); a casca passa **só os dias com dado** (dias sem dado nunca diluem — SC-010).

## Reusados sem mudança

`alvoDoDia`, `avaliarFaixa`, `somaNutrientes` (nutrition.ts) · `resolverParametros`/`PARAMETROS_SISTEMA` (params.ts) · `estadoVigente` (registro.ts). **Nenhuma função existente do core muda nesta feature.**

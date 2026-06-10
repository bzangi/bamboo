# Contrato — núcleo puro `packages/core/src/ciclo.ts`

> Funções puras: sem I/O, sem `throw`, sem mutação. Datas são strings `YYYY-MM-DD` (ordem lexicográfica = cronológica). Erros como `Result` + discriminated union.

## `atribuirCiclo`

```ts
export interface CicloJanela {
  readonly id: string;
  readonly startedOn: string; // YYYY-MM-DD
  readonly closedOn: string | null; // null = ativo
  readonly createdAtMs: number; // desempate quando startedOn empata
}

export function atribuirCiclo(
  ciclos: ReadonlyArray<CicloJanela>,
  dia: string,
): string | null; // cycleId, ou null = "nenhum ciclo"
```

**Invariantes** (cada uma vira teste):

1. **Cobertura**: ciclo cobre `dia` ⇔ `startedOn ≤ dia` e (`closedOn === null` ou `dia ≤ closedOn`). Dia anterior a todo `startedOn` → `null`; dia em lacuna entre ciclos → `null` (FR-011).
2. **Ciclo aberto cobre dali em diante** (o "agora" estende até o presente; quem limita datas futuras é a casca/consumidor).
3. **Fronteira fechou-e-reabriu** (assumption da spec): dois ciclos tocando o mesmo dia (`closedOn` de um = `startedOn` do outro) → vence o de `startedOn` **mais recente**; empate de `startedOn` → maior `createdAtMs`. Exatamente **uma** resposta, sempre (FR-009/SC-001).
4. **Determinismo/pureza**: mesma entrada ⇒ mesma saída; entrada não mutada; ordem do array de entrada é irrelevante.

## `decidirAbertura`

```ts
export type AberturaError = { readonly kind: "duracao-invalida" }; // ≤ 0 ou não-inteira

export type DecisaoAbertura = {
  readonly kind: "abrir";
  readonly fecharAnteriorEm: string | null; // hoje, se havia ativo (A+C); null se não havia
};

export function decidirAbertura(input: {
  readonly cicloAtivo: CicloJanela | null;
  readonly hoje: string;
  readonly duracaoDias: number;
}): Result<DecisaoAbertura, AberturaError>;
```

**Invariantes**: duração inteira > 0 obrigatória (FR-003); com ativo → `fecharAnteriorEm = hoje` (abrir fecha o anterior — FR-002/FR-005); sem ativo → `fecharAnteriorEm = null`. Nunca recusa por "já existe ativo" (decisão C do gate).

## `decidirFechamento`

```ts
export type DecisaoFechamento =
  | { readonly kind: "fechar"; readonly em: string } // hoje
  | { readonly kind: "no-op-orientado"; readonly motivo: "sem-ciclo-ativo" };

export function decidirFechamento(input: {
  readonly cicloAtivo: CicloJanela | null;
  readonly hoje: string;
}): DecisaoFechamento;
```

**Invariantes**: sem ativo → `no-op-orientado` (nunca erro destrutivo — edge da spec); com ativo → fechar em `hoje`. **Prazo vencido não fecha sozinho** — esta função não olha a duração (FR-005).

## Reusados sem mudança

`estadoVigente` (registro.ts — leitura dos registros do período no detalhe, D6) · `Result`/`ok`/`err`. **Nenhuma função existente do core muda nesta feature.**

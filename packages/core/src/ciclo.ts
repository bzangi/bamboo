// ciclo.ts — regras puras do ciclo de acompanhamento (Feature 007).
// Gate (Sessão 2026-06-10): ciclo de vida A+C híbrido (abre manual; fecha
// manual OU auto-fecha quando o próximo abre; prazo NÃO fecha sozinho),
// fronteira fechou-e-reabriu → o aberto mais recentemente. Datas são strings
// YYYY-MM-DD (ordem lexicográfica = cronológica). Sem I/O, sem throw, sem
// mutação. Ver contracts/core-ciclo.md.

import { type Result, err, ok } from "./result.js";

export interface CicloJanela {
  readonly id: string;
  readonly startedOn: string; // YYYY-MM-DD
  readonly closedOn: string | null; // null = ativo
  readonly createdAtMs: number; // desempate quando startedOn empata
}

/**
 * Atribuição (dia → ciclo): um ciclo cobre o dia quando startedOn ≤ dia e
 * (aberto, ou dia ≤ closedOn — bordas inclusivas). Mais de um cobrindo
 * (fronteira fechou-e-reabriu) → vence o de startedOn mais recente; empate →
 * maior createdAtMs. Exatamente uma resposta, sempre (FR-009).
 */
export function atribuirCiclo(
  ciclos: ReadonlyArray<CicloJanela>,
  dia: string,
): string | null {
  const cobrindo = ciclos.filter(
    (c) => c.startedOn <= dia && (c.closedOn === null || dia <= c.closedOn),
  );
  if (cobrindo.length === 0) return null;

  const vencedor = cobrindo.reduce((melhor, c) => {
    if (c.startedOn > melhor.startedOn) return c;
    if (c.startedOn === melhor.startedOn && c.createdAtMs > melhor.createdAtMs)
      return c;
    return melhor;
  });
  return vencedor.id;
}

/* ============ ciclo de vida (A+C) ============ */

export type AberturaError = { readonly kind: "duracao-invalida" }; // ≤ 0 ou não-inteira

export interface DecisaoAbertura {
  readonly kind: "abrir";
  readonly fecharAnteriorEm: string | null; // hoje, se havia ativo (A+C); null se não
}

/**
 * Abrir: duração prevista obrigatória (inteira, > 0 — FR-003). Com ciclo
 * ativo, NUNCA recusa — instrui fechar o anterior no ato (decisão C do gate).
 */
export function decidirAbertura(input: {
  readonly cicloAtivo: CicloJanela | null;
  readonly hoje: string;
  readonly duracaoDias: number;
}): Result<DecisaoAbertura, AberturaError> {
  const { cicloAtivo, hoje, duracaoDias } = input;
  if (!Number.isInteger(duracaoDias) || duracaoDias <= 0) {
    return err({ kind: "duracao-invalida" });
  }
  return ok({
    kind: "abrir",
    fecharAnteriorEm: cicloAtivo === null ? null : hoje,
  });
}

export type DecisaoFechamento =
  | { readonly kind: "fechar"; readonly em: string }
  | { readonly kind: "no-op-orientado"; readonly motivo: "sem-ciclo-ativo" };

/**
 * Fechar: ato manual da reavaliação. Sem ativo → no-op orientado (nunca erro
 * destrutivo). NÃO olha a duração prevista — prazo vencido não fecha sozinho
 * (FR-005: previsão, não trava).
 */
export function decidirFechamento(input: {
  readonly cicloAtivo: CicloJanela | null;
  readonly hoje: string;
}): DecisaoFechamento {
  const { cicloAtivo, hoje } = input;
  if (cicloAtivo === null) {
    return { kind: "no-op-orientado", motivo: "sem-ciclo-ativo" };
  }
  return { kind: "fechar", em: hoje };
}

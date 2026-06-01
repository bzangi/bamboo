// params.ts — parâmetros de adaptação (faixa-alvo e piso) com resolução de
// 3 níveis (Fase 2 / FR-012a–c). TS puro, sem I/O. Ver contracts/core-parametros.md.

export interface ParametrosAdaptacao {
  readonly toleranciaPct: number; // faixa = alvoNutriente ± toleranciaPct%
  readonly pisoPct: number; // piso = gramasPlanejado × pisoPct/100
}

// Defaults sugeridos pelo SISTEMA (nível 3, fallback). Não vão ao banco.
export const PARAMETROS_SISTEMA: ParametrosAdaptacao = {
  toleranciaPct: 10,
  pisoPct: 50,
};

/**
 * Resolve os parâmetros efetivos por precedência de 3 níveis, por campo:
 * `paciente ?? nutri ?? sistema` (o mais específico que estiver definido vence).
 * `undefined` (= coluna nullable null) cai pro próximo nível. Pura, determinística.
 */
export function resolverParametros(niveis: {
  readonly sistema: ParametrosAdaptacao;
  readonly nutri?: Partial<ParametrosAdaptacao>;
  readonly paciente?: Partial<ParametrosAdaptacao>;
}): ParametrosAdaptacao {
  const { sistema, nutri, paciente } = niveis;
  return {
    toleranciaPct:
      paciente?.toleranciaPct ?? nutri?.toleranciaPct ?? sistema.toleranciaPct,
    pisoPct: paciente?.pisoPct ?? nutri?.pisoPct ?? sistema.pisoPct,
  };
}

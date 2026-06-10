// adesao.ts — métrica de adesão (Feature 006). Fórmula do gate (Sessão
// 2026-06-10): valor contínuo SATURADO na faixa de kcal (Q1a-B) + flags por
// macro fora da respectiva faixa (Q1b-iii) + cobertura do registro (Q2-B).
// Reusa avaliarFaixa (Fase 2) — adesão e motor concordam sobre "dentro".
// Pura: sem I/O, sem throw, sem mutação. Ver contracts/core-adesao.md.

import { type Nutrientes, avaliarFaixa } from "./nutrition.js";
import { type Result, err, ok } from "./result.js";

export interface AdesaoFlags {
  readonly carb?: "acima" | "abaixo";
  readonly protein?: "acima" | "abaixo";
  readonly fat?: "acima" | "abaixo";
}

export interface AdesaoDia {
  readonly valorPct: number; // 0–100, saturado na faixa de kcal
  readonly dentroFaixa: boolean; // classificação dentro/fora (FR-006a)
  readonly flags: AdesaoFlags; // só macros fora da faixa (FR-008); kcal nunca
  readonly cobertura: number; // 0–1: registradas ÷ refeições do tipo (FR-007)
}

export type AdesaoError = { readonly kind: "entrada-invalida" };

/**
 * Adesão de um dia: 100% quando o consumido total fecha DENTRO da faixa-alvo
 * de kcal (borda inclusive); fora dela, decai pelo desvio relativo medido a
 * partir da borda mais próxima, clampado em 0. Alvo 0 + consumo > 0 → 0 (sem
 * divisão por zero). Erro estrutural (não-de-produto) vira `err`.
 */
export function adesaoDoDia(input: {
  readonly alvo: Nutrientes;
  readonly consumido: Nutrientes;
  readonly toleranciaPct: number;
  readonly refeicoesDoTipo: number;
  readonly refeicoesRegistradas: number;
}): Result<AdesaoDia, AdesaoError> {
  const { alvo, consumido, toleranciaPct, refeicoesDoTipo } = input;
  const registradas = input.refeicoesRegistradas;

  if (
    toleranciaPct < 0 ||
    toleranciaPct > 100 ||
    refeicoesDoTipo <= 0 ||
    registradas < 0 ||
    registradas > refeicoesDoTipo
  ) {
    return err({ kind: "entrada-invalida" });
  }

  const faixa = avaliarFaixa(consumido, alvo, toleranciaPct);
  const dentroFaixa = faixa.kcal === "dentro";

  let valorPct: number;
  if (dentroFaixa) {
    valorPct = 100; // saturação: dentro da faixa nunca pontua < 100 (FR-004)
  } else if (alvo.kcal === 0) {
    valorPct = 0; // D2: alvo degenerado — qualquer consumo é infinitamente fora
  } else {
    const margem = Math.abs(alvo.kcal) * (toleranciaPct / 100);
    const desvio =
      faixa.kcal === "acima"
        ? consumido.kcal - (alvo.kcal + margem)
        : alvo.kcal - margem - consumido.kcal;
    valorPct = Math.max(0, 100 - (100 * desvio) / alvo.kcal);
  }

  const flags: AdesaoFlags = {
    ...(faixa.carb !== "dentro" ? { carb: faixa.carb } : {}),
    ...(faixa.protein !== "dentro" ? { protein: faixa.protein } : {}),
    ...(faixa.fat !== "dentro" ? { fat: faixa.fat } : {}),
  };

  return ok({
    valorPct,
    dentroFaixa,
    flags,
    cobertura: registradas / refeicoesDoTipo,
  });
}

/**
 * Média do período (FR-011): média aritmética das adesões dos dias COM dado —
 * a casca passa só esses; dias sem dado nunca diluem. Vazio → null (≠ 0).
 */
export function mediaAdesao(valores: ReadonlyArray<number>): number | null {
  if (valores.length === 0) return null;
  return valores.reduce((acc, v) => acc + v, 0) / valores.length;
}

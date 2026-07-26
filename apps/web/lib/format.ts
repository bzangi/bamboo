// Derivações de APRESENTAÇÃO da visão da nutri (Feature 015). Puras, sem I/O,
// sem React — o que a tela mostra além de layout está aqui, e é o que tem teste.
//
// NÃO é domínio: nenhuma régua nova. Adesão, agregação semanal e comparativo vêm
// prontos da API (006/011) e não são recalculados — por isso isto NÃO vive em
// `packages/core` (Princípio III: o núcleo é regra de negócio, não formatação).
//
// ⚠️ ESCALAS MISTAS no DTO do relatório, a armadilha desta tela:
//   `adesao.media`         → 0–100
//   `coberturaMedia`       → 0–1
//   `deltas.media`         → diferença em 0–100
//   `deltas.cobertura/taxa*` → diferença em 0–1
// Duas funções distintas (`pct100`/`pct01`) em vez de uma com flag: a flag é o
// convite ao erro silencioso.

import type { NutriPatientDto } from "@bamboo/types";

const SEM_DADO = "—";

/** Valor já em 0–100 (adesão). */
export const pct100 = (v: number | null): string =>
  v === null ? SEM_DADO : `${Math.round(v)}%`;

/** Proporção 0–1 (cobertura, taxas de registro). */
export const pct01 = (v: number | null): string =>
  v === null ? SEM_DADO : `${Math.round(v * 100)}%`;

export type Tom = "bom" | "ruim" | "neutro" | "sem-dado";

/**
 * Delta do comparativo em pontos percentuais, com sinal e leitura.
 * - `bomSeSobe: false` inverte o tom — subir "pulei" é piora, e a cor não pode
 *   dizer o contrário do número.
 * - `bomSeSobe: null` = métrica SEM direção boa: é o caso de "troquei". Trocar é
 *   adaptação, não falha (tese central) — pintar de vermelho ensinaria a nutri a
 *   ler adaptação como problema.
 */
export function deltaPontos(
  v: number | null,
  opts: { readonly fator: 1 | 100; readonly bomSeSobe: boolean | null },
): { readonly label: string; readonly tom: Tom } {
  if (v === null) return { label: SEM_DADO, tom: "sem-dado" };

  const pontos = Math.round(v * opts.fator);
  if (pontos === 0) return { label: "igual", tom: "neutro" };

  const sinal = pontos > 0 ? "+" : "−"; // U+2212: menos, não hífen
  const label = `${sinal}${Math.abs(pontos)} pts`;
  if (opts.bomSeSobe === null) return { label, tom: "neutro" };

  return { label, tom: pontos > 0 === opts.bomSeSobe ? "bom" : "ruim" };
}

const MESES = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * 'YYYY-MM-DD' → '14 jul'. Sem `new Date(iso)`: aquilo é meia-noite UTC e, a
 * oeste de Greenwich, renderiza o DIA ANTERIOR. A data do domínio é
 * data-calendário local (mesma razão do `localDate` da 013).
 */
export function dataCurta(iso: string): string {
  const m = ISO.exec(iso);
  if (!m) return iso;
  return `${Number(m[3])} ${MESES[Number(m[2]) - 1]}`;
}

const emDias = (iso: string): number | null => {
  const m = ISO.exec(iso);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000;
};

/** Dias entre duas datas-calendário, INCLUSIVO nas duas pontas (mínimo 1). */
export function contarDias(fromIso: string, toIso: string): number {
  const a = emDias(fromIso);
  const b = emDias(toIso);
  if (a === null || b === null) return 1;
  return Math.max(1, b - a + 1);
}

/** "dia N de M" do ciclo: o dia de início é o dia 1. */
export const diaDoCiclo = (startedOn: string, refIso: string): number =>
  contarDias(startedOn, refIso);

export interface Totais {
  readonly feito: number;
  readonly troquei: number;
  readonly pulei: number;
  readonly semRegistro: number;
}

interface Fatia {
  /** Proporção crua ×100 — largura do segmento; nunca arredondada (a soma
   *  arredondada não fecha 100 e a barra ganha uma fresta). */
  readonly pctExato: number;
  readonly label: string;
}

/** Fatias da barra empilhada do padrão de registro. */
export function taxas(t: Totais): {
  readonly total: number;
  readonly vazio: boolean;
  readonly feito: Fatia;
  readonly troquei: Fatia;
  readonly pulei: Fatia;
  readonly semRegistro: Fatia;
} {
  const total = t.feito + t.troquei + t.pulei + t.semRegistro;
  const fatia = (n: number): Fatia =>
    total === 0
      ? { pctExato: 0, label: SEM_DADO }
      : {
          pctExato: (n / total) * 100,
          label: `${Math.round((n / total) * 100)}%`,
        };

  return {
    total,
    vazio: total === 0,
    feito: fatia(t.feito),
    troquei: fatia(t.troquei),
    pulei: fatia(t.pulei),
    semRegistro: fatia(t.semRegistro),
  };
}

/** A tela do paciente resolve nome + ciclo relendo a roster (D1). */
export const findPatient = (
  patients: ReadonlyArray<NutriPatientDto>,
  id: string,
): NutriPatientDto | undefined => patients.find((p) => p.id === id);

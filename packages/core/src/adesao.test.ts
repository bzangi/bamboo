import { describe, expect, it } from "vitest";
import type { Nutrientes } from "./nutrition.js";
import { adesaoDoDia, mediaAdesao } from "./adesao.js";

// Invariantes do contrato contracts/core-adesao.md (Feature 006).
// Fórmula do gate (Sessão 2026-06-10): Q1a → B (contínua saturada na faixa de
// kcal), Q1b → iii (kcal como valor + flags por macro), cobertura (Q2-B).

// Alvo base: faixa de kcal com tol 10% = [1800, 2200]; macros com faixas
// próprias (carb ±25, protein ±12, fat ±6).
const ALVO: Nutrientes = { kcal: 2000, carb: 250, protein: 120, fat: 60 };

const consumido = (parcial: Partial<Nutrientes>): Nutrientes => ({
  ...ALVO,
  ...parcial,
});

const base = {
  alvo: ALVO,
  toleranciaPct: 10,
  refeicoesDoTipo: 4,
  refeicoesRegistradas: 4,
};

describe("adesaoDoDia — saturação na faixa (Q1a-B / SC-009)", () => {
  it("consumido igual ao alvo → 100%, dentro, sem flags", () => {
    const r = adesaoDoDia({ ...base, consumido: consumido({}) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.valorPct).toBe(100);
    expect(r.value.dentroFaixa).toBe(true);
    expect(r.value.flags).toEqual({});
  });

  it("borda exata da faixa (alvo + margem) ainda é dentro → 100%", () => {
    // Borda é "dentro" (≤ margem) — herdado de avaliarFaixa (Fase 2).
    const r = adesaoDoDia({ ...base, consumido: consumido({ kcal: 2200 }) });
    expect(r.ok && r.value.valorPct).toBe(100);
    expect(r.ok && r.value.dentroFaixa).toBe(true);
  });

  it("dentro da faixa mas longe do alvo central → ainda 100% (faixa, não alvo-ponto)", () => {
    const r = adesaoDoDia({ ...base, consumido: consumido({ kcal: 1810 }) });
    expect(r.ok && r.value.valorPct).toBe(100);
  });
});

describe("adesaoDoDia — desvio a partir da borda mais próxima", () => {
  it("acima da faixa: 2400 kcal → desvio 200 da borda 2200 → 90%", () => {
    const r = adesaoDoDia({ ...base, consumido: consumido({ kcal: 2400 }) });
    expect(r.ok && r.value.valorPct).toBeCloseTo(90, 10);
    expect(r.ok && r.value.dentroFaixa).toBe(false);
  });

  it("abaixo da faixa: 1600 kcal → desvio 200 da borda 1800 → 90%", () => {
    const r = adesaoDoDia({ ...base, consumido: consumido({ kcal: 1600 }) });
    expect(r.ok && r.value.valorPct).toBeCloseTo(90, 10);
    expect(r.ok && r.value.dentroFaixa).toBe(false);
  });

  it("simetria (FR-004/SC-003): X abaixo da borda inferior = X acima da superior", () => {
    const acima = adesaoDoDia({
      ...base,
      consumido: consumido({ kcal: 2350 }),
    });
    const abaixo = adesaoDoDia({
      ...base,
      consumido: consumido({ kcal: 1650 }),
    });
    expect(acima.ok && abaixo.ok).toBe(true);
    if (!acima.ok || !abaixo.ok) return;
    expect(acima.value.valorPct).toBeCloseTo(abaixo.value.valorPct, 10);
    expect(acima.value.dentroFaixa).toBe(false);
    expect(abaixo.value.dentroFaixa).toBe(false);
  });

  it("clamp em 0: desvio maior que o alvo nunca fica negativo", () => {
    // 4400 kcal → desvio 2200 > alvo 2000 → 100 − 110 → clamp 0.
    const r = adesaoDoDia({ ...base, consumido: consumido({ kcal: 4400 }) });
    expect(r.ok && r.value.valorPct).toBe(0);
  });
});

describe("adesaoDoDia — alvo de kcal zero (D2)", () => {
  const alvoZero: Nutrientes = { kcal: 0, carb: 0, protein: 0, fat: 0 };

  it("alvo 0 e consumido 0 → 100%, dentro", () => {
    const r = adesaoDoDia({ ...base, alvo: alvoZero, consumido: alvoZero });
    expect(r.ok && r.value.valorPct).toBe(100);
    expect(r.ok && r.value.dentroFaixa).toBe(true);
  });

  it("alvo 0 e consumido > 0 → 0%, fora (sem divisão por zero)", () => {
    const r = adesaoDoDia({
      ...base,
      alvo: alvoZero,
      consumido: { kcal: 50, carb: 0, protein: 0, fat: 0 },
    });
    expect(r.ok && r.value.valorPct).toBe(0);
    expect(r.ok && r.value.dentroFaixa).toBe(false);
  });
});

describe("adesaoDoDia — flags por macro (Q1b-iii / FR-008)", () => {
  it("kcal dentro + proteína abaixo da faixa → 100% com flag protein:abaixo", () => {
    // protein 90 < 108 (borda inferior da faixa [108, 132]).
    const r = adesaoDoDia({ ...base, consumido: consumido({ protein: 90 }) });
    expect(r.ok && r.value.valorPct).toBe(100);
    expect(r.ok && r.value.flags).toEqual({ protein: "abaixo" });
  });

  it("múltiplos macros fora → todos os flags presentes; kcal nunca em flags", () => {
    // carb 300 > 275 (acima); fat 40 < 54 (abaixo); kcal 2100 dentro.
    const r = adesaoDoDia({
      ...base,
      consumido: consumido({ kcal: 2100, carb: 300, fat: 40 }),
    });
    expect(r.ok && r.value.flags).toEqual({ carb: "acima", fat: "abaixo" });
  });

  it("flags independem da classificação de kcal (kcal fora + macros dentro → sem flags)", () => {
    const r = adesaoDoDia({
      ...base,
      consumido: consumido({ kcal: 2400 }),
    });
    expect(r.ok && r.value.flags).toEqual({});
  });
});

describe("adesaoDoDia — cobertura (Q2-B / FR-007)", () => {
  it("3 de 4 refeições registradas → cobertura 0.75", () => {
    const r = adesaoDoDia({
      ...base,
      consumido: consumido({}),
      refeicoesRegistradas: 3,
    });
    expect(r.ok && r.value.cobertura).toBeCloseTo(0.75, 10);
  });

  it("refeicoesDoTipo = 0 → err entrada-invalida (a casca nem deveria chamar)", () => {
    const r = adesaoDoDia({
      ...base,
      consumido: consumido({}),
      refeicoesDoTipo: 0,
      refeicoesRegistradas: 0,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe("entrada-invalida");
  });

  it("registradas > refeições do tipo, contagens negativas e tolerância fora de [0,100] → err", () => {
    const casos = [
      { ...base, consumido: consumido({}), refeicoesRegistradas: 5 },
      { ...base, consumido: consumido({}), refeicoesRegistradas: -1 },
      { ...base, consumido: consumido({}), toleranciaPct: -1 },
      { ...base, consumido: consumido({}), toleranciaPct: 101 },
    ];
    for (const caso of casos) {
      const r = adesaoDoDia(caso);
      expect(r.ok).toBe(false);
    }
  });
});

describe("adesaoDoDia — pureza (SC-001)", () => {
  it("entradas congeladas não são mutadas e o resultado é determinístico", () => {
    const input = Object.freeze({
      alvo: Object.freeze({ ...ALVO }),
      consumido: Object.freeze(consumido({ kcal: 2400 })),
      toleranciaPct: 10,
      refeicoesDoTipo: 4,
      refeicoesRegistradas: 2,
    });
    const a = adesaoDoDia(input);
    const b = adesaoDoDia(input);
    expect(a).toEqual(b);
  });
});

describe("mediaAdesao — média do período (FR-011 / SC-010)", () => {
  it("média aritmética simples dos dias com dado", () => {
    expect(mediaAdesao([100, 90, 80])).toBeCloseTo(90, 10);
  });

  it("um único dia → o próprio valor", () => {
    expect(mediaAdesao([73])).toBe(73);
  });

  it("nenhum dia com dado → null (nunca 0)", () => {
    expect(mediaAdesao([])).toBeNull();
  });
});

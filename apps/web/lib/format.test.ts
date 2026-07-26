import { describe, expect, it } from "vitest";
import {
  contarDias,
  dataCurta,
  deltaPontos,
  diaDoCiclo,
  findPatient,
  pct01,
  pct100,
  taxas,
} from "./format";

// O erro mais provável desta tela é de ESCALA: o DTO mistura 0–100 (adesão) com
// 0–1 (cobertura e taxas de registro). São duas funções distintas de propósito —
// uma só, com flag, é o convite ao erro.

describe("pct100 — adesão (0–100)", () => {
  it("arredonda para inteiro com %", () => {
    expect(pct100(78.4)).toBe("78%");
    expect(pct100(78.6)).toBe("79%");
    expect(pct100(100)).toBe("100%");
    expect(pct100(0)).toBe("0%");
  });

  it("sem dado é travessão, NUNCA 0%", () => {
    expect(pct100(null)).toBe("—");
  });
});

describe("pct01 — cobertura e taxas (0–1)", () => {
  it("escala para porcentagem", () => {
    expect(pct01(0.8333)).toBe("83%");
    expect(pct01(1)).toBe("100%");
    expect(pct01(0)).toBe("0%");
  });

  it("sem dado é travessão", () => {
    expect(pct01(null)).toBe("—");
  });
});

describe("deltaPontos — comparativo com o ciclo anterior", () => {
  it("positivo em métrica boa-se-sobe: sinal + e tom bom", () => {
    expect(deltaPontos(6.2, { fator: 1, bomSeSobe: true })).toEqual({
      label: "+6 pts",
      tom: "bom",
    });
  });

  it("negativo em métrica boa-se-sobe: sinal − e tom ruim", () => {
    expect(deltaPontos(-4, { fator: 1, bomSeSobe: true })).toEqual({
      label: "−4 pts",
      tom: "ruim",
    });
  });

  it("inverte o tom em métrica ruim-se-sobe (pulei)", () => {
    expect(deltaPontos(0.12, { fator: 100, bomSeSobe: false })).toEqual({
      label: "+12 pts",
      tom: "ruim",
    });
    expect(deltaPontos(-0.12, { fator: 100, bomSeSobe: false })).toEqual({
      label: "−12 pts",
      tom: "bom",
    });
  });

  it("fator 100 converte diferença de proporção em pontos", () => {
    expect(deltaPontos(0.075, { fator: 100, bomSeSobe: true }).label).toBe(
      "+8 pts",
    );
  });

  it("métrica sem direção boa (troquei) mostra o sinal e fica neutra", () => {
    expect(deltaPontos(0.09, { fator: 100, bomSeSobe: null })).toEqual({
      label: "+9 pts",
      tom: "neutro",
    });
    expect(deltaPontos(-0.09, { fator: 100, bomSeSobe: null })).toEqual({
      label: "−9 pts",
      tom: "neutro",
    });
  });

  it("delta que arredonda para zero é neutro, sem sinal", () => {
    expect(deltaPontos(0.2, { fator: 1, bomSeSobe: true })).toEqual({
      label: "igual",
      tom: "neutro",
    });
  });

  it("null (um dos lados sem dado) não inventa número", () => {
    expect(deltaPontos(null, { fator: 1, bomSeSobe: true })).toEqual({
      label: "—",
      tom: "sem-dado",
    });
  });
});

describe("dataCurta", () => {
  it("formata YYYY-MM-DD em pt-BR curto sem passar por Date (fuso)", () => {
    // `new Date('2026-01-01')` é meia-noite UTC: em UTC-3 viraria 31/dez.
    expect(dataCurta("2026-01-01")).toBe("1 jan");
    expect(dataCurta("2026-07-14")).toBe("14 jul");
    expect(dataCurta("2026-12-31")).toBe("31 dez");
  });

  it("string fora do formato volta como veio, sem lançar", () => {
    expect(dataCurta("")).toBe("");
    expect(dataCurta("ontem")).toBe("ontem");
  });
});

describe("contarDias — inclusivo nas duas pontas", () => {
  it("mesmo dia conta 1", () => {
    expect(contarDias("2026-07-14", "2026-07-14")).toBe(1);
  });

  it("semana cheia conta 7", () => {
    expect(contarDias("2026-07-14", "2026-07-20")).toBe(7);
  });

  it("atravessa mês e horário de verão sem perder dia", () => {
    expect(contarDias("2026-02-25", "2026-03-02")).toBe(6);
    expect(contarDias("2026-10-15", "2026-11-14")).toBe(31);
  });

  it("ordem invertida não devolve negativo", () => {
    expect(contarDias("2026-07-20", "2026-07-14")).toBe(1);
  });
});

describe("diaDoCiclo", () => {
  it("o dia do início é o dia 1", () => {
    expect(diaDoCiclo("2026-07-14", "2026-07-14")).toBe(1);
  });

  it("conta os dias corridos até a data de referência", () => {
    expect(diaDoCiclo("2026-07-14", "2026-07-25")).toBe(12);
  });
});

describe("taxas — a barra empilhada do padrão de registro", () => {
  const totais = { feito: 24, troquei: 6, pulei: 3, semRegistro: 7 };

  it("soma 100% e mantém a proporção crua para a largura", () => {
    const t = taxas(totais);
    expect(t.total).toBe(40);
    expect(t.feito.pctExato).toBeCloseTo(60);
    expect(t.troquei.pctExato).toBeCloseTo(15);
    expect(t.pulei.pctExato).toBeCloseTo(7.5);
    expect(t.semRegistro.pctExato).toBeCloseTo(17.5);
    const soma =
      t.feito.pctExato +
      t.troquei.pctExato +
      t.pulei.pctExato +
      t.semRegistro.pctExato;
    expect(soma).toBeCloseTo(100);
  });

  it("rótulo arredondado é inteiro", () => {
    expect(taxas(totais).pulei.label).toBe("8%");
  });

  it("total zero não divide por zero: tudo em 0 e vazio marcado", () => {
    const t = taxas({ feito: 0, troquei: 0, pulei: 0, semRegistro: 0 });
    expect(t.total).toBe(0);
    expect(t.vazio).toBe(true);
    expect(t.feito.pctExato).toBe(0);
    expect(t.feito.label).toBe("—");
  });
});

describe("findPatient", () => {
  const lista = [
    { id: "a", name: "Ana", cicloAtual: null },
    { id: "b", name: "Bia", cicloAtual: null },
  ];

  it("acha por id", () => {
    expect(findPatient(lista, "b")?.name).toBe("Bia");
  });

  it("id ausente devolve undefined (a página trata como 404)", () => {
    expect(findPatient(lista, "zzz")).toBeUndefined();
  });
});

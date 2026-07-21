import { describe, expect, it } from "vitest";
import {
  agregarAdesao,
  agregarEstados,
  compararCiclos,
  encontrarCicloAnterior,
  fatiarSemanas,
  type AgregadoParaComparacao,
  type DiaAdesaoEntrada,
  type SlotRegistro,
} from "./relatorio.js";

// Contrato: specs/011-relatorio-de-ciclo/{research.md D1–D9,data-model.md}.
// Núcleo puro: nenhuma função aqui recebe Date.now/relógio — janelas e "hoje"
// entram sempre como parâmetro string YYYY-MM-DD, resolvidos pela casca.

describe("fatiarSemanas — A1 (semana relativa ao início, D1)", () => {
  it("janela múltiplo exato de 7 → todas as semanas completas, nenhuma parcial", () => {
    const r = fatiarSemanas("2026-06-01", "2026-06-14"); // 14 dias
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual([
      { indice: 1, from: "2026-06-01", to: "2026-06-07", parcial: false },
      { indice: 2, from: "2026-06-08", to: "2026-06-14", parcial: false },
    ]);
  });

  it("janela não-múltiplo de 7 → última fatia parcial com o intervalo real", () => {
    const r = fatiarSemanas("2026-06-01", "2026-06-17"); // 17 dias
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual([
      { indice: 1, from: "2026-06-01", to: "2026-06-07", parcial: false },
      { indice: 2, from: "2026-06-08", to: "2026-06-14", parcial: false },
      { indice: 3, from: "2026-06-15", to: "2026-06-17", parcial: true },
    ]);
  });

  it("janela de 1 dia (ciclo fechado no mesmo dia em que abriu) → 1 semana parcial de 1 dia", () => {
    const r = fatiarSemanas("2026-06-01", "2026-06-01");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual([
      { indice: 1, from: "2026-06-01", to: "2026-06-01", parcial: true },
    ]);
  });

  it("fim < início → err janela-invalida", () => {
    const r = fatiarSemanas("2026-06-10", "2026-06-01");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toEqual({ kind: "janela-invalida" });
  });

  it("cruza virada de mês/ano sem erro de aritmética de calendário", () => {
    const r = fatiarSemanas("2026-12-28", "2027-01-05"); // 9 dias
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual([
      { indice: 1, from: "2026-12-28", to: "2027-01-03", parcial: false },
      { indice: 2, from: "2027-01-04", to: "2027-01-05", parcial: true },
    ]);
  });
});

describe("agregarAdesao", () => {
  const dia = (partial: Partial<DiaAdesaoEntrada> = {}): DiaAdesaoEntrada => ({
    status: "com-dado",
    valorPct: 100,
    dentroFaixa: true,
    flags: {},
    cobertura: 1,
    ...partial,
  });

  it("mistura com/sem-dado: média e cobertura só sobre os com-dado; sem-dado nunca dilui", () => {
    const r = agregarAdesao([
      dia({ valorPct: 100, cobertura: 1, dentroFaixa: true }),
      { status: "sem-dado" },
      dia({ valorPct: 50, cobertura: 0.5, dentroFaixa: false }),
    ]);
    expect(r.media).toBeCloseTo(75, 10);
    expect(r.coberturaMedia).toBeCloseTo(0.75, 10);
    expect(r.diasComDado).toBe(2);
    expect(r.diasSemDado).toBe(1);
    expect(r.diasDentroFaixa).toBe(1);
  });

  it("todos sem-dado → media e coberturaMedia null (nunca 0); diasDentroFaixa 0", () => {
    const r = agregarAdesao([{ status: "sem-dado" }, { status: "sem-dado" }]);
    expect(r.media).toBeNull();
    expect(r.coberturaMedia).toBeNull();
    expect(r.diasComDado).toBe(0);
    expect(r.diasSemDado).toBe(2);
    expect(r.diasDentroFaixa).toBe(0);
  });

  it("lista vazia → tudo zerado/null, nunca erro", () => {
    const r = agregarAdesao([]);
    expect(r).toEqual({
      media: null,
      diasComDado: 0,
      diasSemDado: 0,
      coberturaMedia: null,
      diasDentroFaixa: 0,
      flagsFrequencia: {},
    });
  });

  it("flagsFrequencia: só macro com contagem > 0 aparece; só o lado com contagem > 0 aparece", () => {
    const r = agregarAdesao([
      dia({ flags: { protein: "abaixo" } }),
      dia({ flags: { protein: "abaixo" } }),
      dia({ flags: { fat: "acima" } }),
      dia({ flags: {} }), // carb nunca fora — não deve aparecer
    ]);
    expect(r.flagsFrequencia).toEqual({
      protein: { abaixo: 2 },
      fat: { acima: 1 },
    });
    expect(r.flagsFrequencia.carb).toBeUndefined();
  });
});

describe("agregarEstados — D9 (sem-registro = esperado − vigente; anulado não distinto)", () => {
  const slot = (p: SlotRegistro): SlotRegistro => p;

  it("totais + porRefeicao por position, ordenados; semRegistro quando state é null", () => {
    const r = agregarEstados([
      slot({ position: 1, nome: "Café da manhã", state: "feito" }),
      slot({ position: 1, nome: "Café da manhã", state: "feito" }),
      slot({ position: 2, nome: "Almoço", state: "troquei" }),
      slot({ position: 2, nome: "Almoço", state: null }), // sem-registro
      slot({ position: 3, nome: "Jantar", state: "pulei" }),
    ]);
    expect(r.totais).toEqual({ feito: 2, troquei: 1, pulei: 1, semRegistro: 1 });
    expect(r.porRefeicao).toEqual([
      { position: 1, nome: "Café da manhã", feito: 2, troquei: 0, pulei: 0, semRegistro: 0 },
      { position: 2, nome: "Almoço", feito: 0, troquei: 1, pulei: 0, semRegistro: 1 },
      { position: 3, nome: "Jantar", feito: 0, troquei: 0, pulei: 1, semRegistro: 0 },
    ]);
  });

  it("lista vazia → totais zerados, porRefeicao vazio (ciclo sem registros — FR-007)", () => {
    expect(agregarEstados([])).toEqual({
      totais: { feito: 0, troquei: 0, pulei: 0, semRegistro: 0 },
      porRefeicao: [],
    });
  });

  it("nome: melhor esforço — mantém o primeiro nome visto pra aquela position (empate não é erro)", () => {
    const r = agregarEstados([
      slot({ position: 1, nome: "Café da manhã", state: "feito" }),
      slot({ position: 1, nome: "Café reforçado", state: "pulei" }), // nome diverge em outro dia
    ]);
    const [primeira] = r.porRefeicao;
    expect(primeira?.nome).toBe("Café da manhã");
    expect(primeira).toMatchObject({ feito: 1, pulei: 1 });
  });
});

describe("encontrarCicloAnterior — A3/D3", () => {
  it("escolhe o closedOn mais recente ≤ startedOn do atual", () => {
    const r = encontrarCicloAnterior(
      [
        { id: "c1", startedOn: "2026-01-01", closedOn: "2026-01-10" },
        { id: "c2", startedOn: "2026-01-11", closedOn: "2026-02-01" },
      ],
      "2026-03-01",
      "atual",
    );
    expect(r?.id).toBe("c2");
  });

  it("desempate — dois fechados no mesmo dia → o de startedOn mais recente (aberto mais recentemente)", () => {
    const r = encontrarCicloAnterior(
      [
        { id: "c1", startedOn: "2026-01-01", closedOn: "2026-01-15" },
        { id: "c2", startedOn: "2026-01-15", closedOn: "2026-01-15" },
      ],
      "2026-02-01",
      "atual",
    );
    expect(r?.id).toBe("c2");
  });

  it("exclui o próprio id e candidatos fechados DEPOIS do início do atual", () => {
    const r = encontrarCicloAnterior(
      [
        { id: "atual", startedOn: "2026-01-01", closedOn: "2026-01-05" },
        { id: "futuro", startedOn: "2026-01-06", closedOn: "2026-02-01" },
      ],
      "2026-01-01",
      "atual",
    );
    expect(r).toBeNull();
  });

  it("lista vazia ou nenhum candidato válido → null (primeiro ciclo do paciente)", () => {
    expect(encontrarCicloAnterior([], "2026-01-01", "atual")).toBeNull();
  });
});

describe("compararCiclos — deltas atual − anterior; um lado sem-dado → tudo null", () => {
  const agregado = (
    p: Partial<AgregadoParaComparacao> = {},
  ): AgregadoParaComparacao => ({
    media: 80,
    coberturaMedia: 0.8,
    totais: { feito: 8, troquei: 1, pulei: 1, semRegistro: 0 },
    ...p,
  });

  it("ambos com dado → 5 deltas = atual − anterior", () => {
    const r = compararCiclos(
      agregado({ media: 84, coberturaMedia: 0.82, totais: { feito: 38, troquei: 9, pulei: 6, semRegistro: 19 } }),
      agregado({ media: 76.9, coberturaMedia: 0.71, totais: { feito: 70, troquei: 21, pulei: 15, semRegistro: 62 } }),
    );
    expect(r.media).toBeCloseTo(7.1, 6);
    expect(r.coberturaMedia).toBeCloseTo(0.11, 6);
    // taxaFeito atual = 38/72 ; anterior = 70/168
    expect(r.taxaFeito).toBeCloseTo(38 / 72 - 70 / 168, 6);
  });

  it("anterior sem dado (media null) → os 5 deltas vêm null (nunca cálculo parcial)", () => {
    const r = compararCiclos(agregado(), agregado({ media: null, coberturaMedia: null }));
    expect(r).toEqual({
      media: null,
      coberturaMedia: null,
      taxaFeito: null,
      taxaTroquei: null,
      taxaPulei: null,
    });
  });

  it("atual sem dado (media null) → os 5 deltas também vêm null", () => {
    const r = compararCiclos(agregado({ media: null, coberturaMedia: null }), agregado());
    expect(r.media).toBeNull();
    expect(r.taxaFeito).toBeNull();
  });
});

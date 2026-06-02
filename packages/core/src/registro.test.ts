import { describe, expect, it } from "vitest";
import {
  type Adequacao,
  type EventoRegistro,
  classificarEstado,
  decidirRegistro,
  derivarOAgora,
  estadoVigente,
} from "./registro.js";

/* ============ classificarEstado (FR-002, FR-003, FR-004) ============ */

describe("classificarEstado", () => {
  it("nao-consumiu → pulei (adequacao ignorada)", () => {
    const r = classificarEstado({
      marcacao: "nao-consumiu",
      adequacao: { kind: "opcao-nao-default", mealOptionId: "o1" },
    });
    expect(r.ok && r.value).toBe("pulei");
  });

  it("consumiu sem adequacao → feito", () => {
    const r = classificarEstado({ marcacao: "consumiu", adequacao: null });
    expect(r.ok && r.value).toBe("feito");
  });

  it("consumiu com opcao-nao-default → troquei", () => {
    const r = classificarEstado({
      marcacao: "consumiu",
      adequacao: { kind: "opcao-nao-default", mealOptionId: "o1" },
    });
    expect(r.ok && r.value).toBe("troquei");
  });

  it("consumiu com substituicao valida → troquei", () => {
    const r = classificarEstado({
      marcacao: "consumiu",
      adequacao: {
        kind: "substituicao-combinacao",
        itens: [{ groupIdEsperado: "g1", groupId: "g1", gramas: 120 }],
      },
    });
    expect(r.ok && r.value).toBe("troquei");
  });

  it("substituicao com itens vazio → consumo-invalido", () => {
    const r = classificarEstado({
      marcacao: "consumiu",
      adequacao: { kind: "substituicao-combinacao", itens: [] },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("consumo-invalido");
  });

  it("substituicao com food fora do grupo → consumo-fora-do-grupo", () => {
    const r = classificarEstado({
      marcacao: "consumiu",
      adequacao: {
        kind: "substituicao-combinacao",
        itens: [{ groupIdEsperado: "g1", groupId: "g2", gramas: 120 }],
      },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("consumo-fora-do-grupo");
  });

  it("substituicao com gramas <= 0 → consumo-invalido", () => {
    const r = classificarEstado({
      marcacao: "consumiu",
      adequacao: {
        kind: "substituicao-combinacao",
        itens: [{ groupIdEsperado: "g1", groupId: "g1", gramas: 0 }],
      },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("consumo-invalido");
  });

  it("ordem de guarda: grupo antes de gramas (fora do grupo E gramas<=0 → fora-do-grupo)", () => {
    const r = classificarEstado({
      marcacao: "consumiu",
      adequacao: {
        kind: "substituicao-combinacao",
        itens: [{ groupIdEsperado: "g1", groupId: "g2", gramas: -5 }],
      },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("consumo-fora-do-grupo");
  });

  it("multi-item: valida todos; 1º ok, 2º fora do grupo → consumo-fora-do-grupo", () => {
    const r = classificarEstado({
      marcacao: "consumiu",
      adequacao: {
        kind: "substituicao-combinacao",
        itens: [
          { groupIdEsperado: "g1", groupId: "g1", gramas: 100 },
          { groupIdEsperado: "g2", groupId: "gX", gramas: 50 },
        ],
      },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("consumo-fora-do-grupo");
  });

  it("edge troca-desfeita antes de marcar (adequacao null) → feito", () => {
    const adequacao: Adequacao | null = null;
    const r = classificarEstado({ marcacao: "consumiu", adequacao });
    expect(r.ok && r.value).toBe("feito");
  });
});

/* ============ estadoVigente (FR-010, FR-011) ============ */

describe("estadoVigente", () => {
  it("lista vazia → null", () => {
    expect(estadoVigente([])).toBeNull();
  });

  it("maior seq vence", () => {
    const eventos: ReadonlyArray<EventoRegistro> = [
      { seq: 1, state: "feito" },
      { seq: 2, state: "pulei" },
    ];
    expect(estadoVigente(eventos)).toBe("pulei");
  });

  it("robusto a array fora de ordem (maior seq vence)", () => {
    const eventos: ReadonlyArray<EventoRegistro> = [
      { seq: 3, state: "troquei" },
      { seq: 1, state: "feito" },
      { seq: 2, state: "pulei" },
    ];
    expect(estadoVigente(eventos)).toBe("troquei");
  });

  it("tombstone (maior seq com state null) → null", () => {
    const eventos: ReadonlyArray<EventoRegistro> = [
      { seq: 1, state: "feito" },
      { seq: 2, state: null },
    ];
    expect(estadoVigente(eventos)).toBeNull();
  });

  it("sequência feito→pulei→feito→desfazer → null", () => {
    const eventos: ReadonlyArray<EventoRegistro> = [
      { seq: 1, state: "feito" },
      { seq: 2, state: "pulei" },
      { seq: 3, state: "feito" },
      { seq: 4, state: null },
    ];
    expect(estadoVigente(eventos)).toBeNull();
  });
});

/* ============ decidirRegistro (FR-012) ============ */

describe("decidirRegistro", () => {
  it("marcar == vigente → no-op", () => {
    const d = decidirRegistro({
      vigente: "feito",
      alvo: { kind: "marcar", estado: "feito" },
    });
    expect(d.kind).toBe("no-op");
  });

  it("marcar != vigente → inserir", () => {
    const d = decidirRegistro({
      vigente: "pulei",
      alvo: { kind: "marcar", estado: "feito" },
    });
    expect(d.kind === "inserir" && d.state).toBe("feito");
  });

  it("marcar com vigente null → inserir", () => {
    const d = decidirRegistro({
      vigente: null,
      alvo: { kind: "marcar", estado: "feito" },
    });
    expect(d.kind === "inserir" && d.state).toBe("feito");
  });

  it("desfazer com vigente → inserir(null)", () => {
    const d = decidirRegistro({
      vigente: "feito",
      alvo: { kind: "desfazer" },
    });
    expect(d.kind === "inserir" && d.state).toBeNull();
  });

  it("desfazer sem vigente → no-op", () => {
    const d = decidirRegistro({ vigente: null, alvo: { kind: "desfazer" } });
    expect(d.kind).toBe("no-op");
  });

  it("troquei → feito (estados distintos) → inserir", () => {
    const d = decidirRegistro({
      vigente: "troquei",
      alvo: { kind: "marcar", estado: "feito" },
    });
    expect(d.kind === "inserir" && d.state).toBe("feito");
  });
});

/* ============ derivarOAgora (FR-006, FR-007, FR-008, FR-013) ============ */

describe("derivarOAgora", () => {
  it("1ª não-registrada (na ordem) vira o agora", () => {
    const o = derivarOAgora({
      refeicoes: [
        { mealId: "m1", ordem: 1 },
        { mealId: "m2", ordem: 2 },
        { mealId: "m3", ordem: 3 },
      ],
      vigentes: [
        { mealId: "m1", estado: "feito" },
        { mealId: "m2", estado: null },
        { mealId: "m3", estado: null },
      ],
    });
    expect(o.kind === "refeicao" && o.mealId).toBe("m2");
  });

  it("ordena por ordem (array de refeições embaralhado)", () => {
    const o = derivarOAgora({
      refeicoes: [
        { mealId: "m3", ordem: 3 },
        { mealId: "m1", ordem: 1 },
        { mealId: "m2", ordem: 2 },
      ],
      vigentes: [{ mealId: "m1", estado: "feito" }],
    });
    expect(o.kind === "refeicao" && o.mealId).toBe("m2");
  });

  it("refeição ausente do map de vigentes = não-registrada → vira o agora", () => {
    const o = derivarOAgora({
      refeicoes: [
        { mealId: "m1", ordem: 1 },
        { mealId: "m2", ordem: 2 },
      ],
      // m2 sem nenhum evento (não retornada pela query) → não-registrada.
      vigentes: [{ mealId: "m1", estado: "feito" }],
    });
    expect(o.kind === "refeicao" && o.mealId).toBe("m2");
  });

  it("refeição anterior esquecida permanece o agora (não pula)", () => {
    const o = derivarOAgora({
      refeicoes: [
        { mealId: "m1", ordem: 1 },
        { mealId: "m2", ordem: 2 },
        { mealId: "m3", ordem: 3 },
      ],
      // m1 esquecida (null), m2 feita, m3 não-registrada.
      vigentes: [
        { mealId: "m1", estado: null },
        { mealId: "m2", estado: "feito" },
        { mealId: "m3", estado: null },
      ],
    });
    expect(o.kind === "refeicao" && o.mealId).toBe("m1");
  });

  it("todas registradas → dia-concluido", () => {
    const o = derivarOAgora({
      refeicoes: [
        { mealId: "m1", ordem: 1 },
        { mealId: "m2", ordem: 2 },
      ],
      vigentes: [
        { mealId: "m1", estado: "feito" },
        { mealId: "m2", estado: "pulei" },
      ],
    });
    expect(o.kind).toBe("dia-concluido");
  });

  it("lista de refeições vazia → dia-concluido (sem erro)", () => {
    const o = derivarOAgora({ refeicoes: [], vigentes: [] });
    expect(o.kind).toBe("dia-concluido");
  });
});

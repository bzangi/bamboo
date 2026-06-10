import { describe, expect, it } from "vitest";
import {
  atribuirCiclo,
  decidirAbertura,
  decidirFechamento,
  type CicloJanela,
} from "./ciclo.js";

// Invariantes do contrato contracts/core-ciclo.md (Feature 007).
// Gate (Sessão 2026-06-10): ciclo de vida A+C híbrido; fronteira fechou-e-
// reabriu → o aberto mais recentemente; prazo vencido NÃO fecha sozinho.

const janela = (
  id: string,
  startedOn: string,
  closedOn: string | null,
  createdAtMs = 0,
): CicloJanela => ({ id, startedOn, closedOn, createdAtMs });

describe("atribuirCiclo — cobertura e lacunas", () => {
  const c1 = janela("c1", "2026-06-01", "2026-06-05", 1);
  const c2 = janela("c2", "2026-06-08", null, 2); // ativo

  it("dia dentro de um ciclo fechado → o ciclo; bordas startedOn/closedOn são inclusivas", () => {
    expect(atribuirCiclo([c1, c2], "2026-06-03")).toBe("c1");
    expect(atribuirCiclo([c1, c2], "2026-06-01")).toBe("c1"); // borda início
    expect(atribuirCiclo([c1, c2], "2026-06-05")).toBe("c1"); // borda fim
  });

  it("ciclo aberto cobre do início dali em diante", () => {
    expect(atribuirCiclo([c1, c2], "2026-06-08")).toBe("c2");
    expect(atribuirCiclo([c1, c2], "2026-07-20")).toBe("c2"); // segue aberto
  });

  it("dia anterior a todo ciclo e dia em lacuna → null (fora de ciclo — FR-011)", () => {
    expect(atribuirCiclo([c1, c2], "2026-05-30")).toBeNull();
    expect(atribuirCiclo([c1, c2], "2026-06-06")).toBeNull(); // lacuna 06–07
    expect(atribuirCiclo([], "2026-06-03")).toBeNull(); // paciente sem ciclo
  });
});

describe("atribuirCiclo — fronteira fechou-e-reabriu (desempate)", () => {
  it("dia compartilhado (closedOn de um = startedOn do outro) → o de startedOn mais recente", () => {
    const anterior = janela("velho", "2026-06-01", "2026-06-10", 1);
    const novo = janela("novo", "2026-06-10", null, 2);
    expect(atribuirCiclo([anterior, novo], "2026-06-10")).toBe("novo");
    expect(atribuirCiclo([anterior, novo], "2026-06-09")).toBe("velho");
  });

  it("empate de startedOn (abriu e fechou no mesmo dia, reabriu) → maior createdAtMs", () => {
    const efemero = janela("efemero", "2026-06-10", "2026-06-10", 100);
    const sucessor = janela("sucessor", "2026-06-10", null, 200);
    expect(atribuirCiclo([efemero, sucessor], "2026-06-10")).toBe("sucessor");
  });

  it("determinismo: ordem do array de entrada é irrelevante e a entrada não é mutada", () => {
    const a = janela("a", "2026-06-01", "2026-06-10", 1);
    const b = janela("b", "2026-06-10", null, 2);
    const lista = Object.freeze([Object.freeze(a), Object.freeze(b)] as const);
    expect(atribuirCiclo([a, b], "2026-06-10")).toBe(
      atribuirCiclo([b, a], "2026-06-10"),
    );
    expect(atribuirCiclo(lista as readonly CicloJanela[], "2026-06-10")).toBe(
      "b",
    );
  });
});

describe("decidirAbertura — A+C híbrido (FR-002/FR-003/FR-005)", () => {
  const hoje = "2026-06-10";

  it("duração obrigatória: ≤ 0 ou não-inteira → err duracao-invalida", () => {
    for (const duracaoDias of [0, -7, 3.5]) {
      const r = decidirAbertura({ cicloAtivo: null, hoje, duracaoDias });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.kind).toBe("duracao-invalida");
    }
  });

  it("sem ciclo ativo → abrir sem fechar ninguém", () => {
    const r = decidirAbertura({ cicloAtivo: null, hoje, duracaoDias: 42 });
    expect(r.ok && r.value).toEqual({ kind: "abrir", fecharAnteriorEm: null });
  });

  it("com ciclo ativo → abrir fechando o anterior HOJE (nunca recusa por já-existe-ativo)", () => {
    const ativo = janela("ativo", "2026-05-01", null, 1);
    const r = decidirAbertura({ cicloAtivo: ativo, hoje, duracaoDias: 28 });
    expect(r.ok && r.value).toEqual({ kind: "abrir", fecharAnteriorEm: hoje });
  });
});

describe("decidirFechamento — manual, orientado, sem prazo automático", () => {
  const hoje = "2026-06-10";

  it("sem ciclo ativo → no-op orientado (nunca erro destrutivo)", () => {
    expect(decidirFechamento({ cicloAtivo: null, hoje })).toEqual({
      kind: "no-op-orientado",
      motivo: "sem-ciclo-ativo",
    });
  });

  it("com ciclo ativo → fechar hoje — mesmo com a duração prevista estourada (previsão, não trava)", () => {
    // started 01/01 + duração que já venceu há meses: a decisão não olha prazo.
    const ativo = janela("ativo", "2026-01-01", null, 1);
    expect(decidirFechamento({ cicloAtivo: ativo, hoje })).toEqual({
      kind: "fechar",
      em: hoje,
    });
  });
});

import { describe, expect, it } from "vitest";
import {
  A_VONTADE,
  dataExtenso,
  formatDiffQuantidade,
  formatQuantidade,
  formatQuantidadeItem,
} from "./format";

// A tabela à mão existe para não depender do locale do Hermes; o teste é o que
// impede que ela fique fora de ordem (um deslize de índice troca o mês inteiro).
describe("dataExtenso", () => {
  it("dia da semana e mês por extenso, em pt-BR", () => {
    // 2026-07-27 é uma segunda-feira (mês 6 = julho, 0-based).
    expect(dataExtenso(new Date(2026, 6, 27))).toBe(
      "segunda-feira, 27 de julho",
    );
  });

  it("as duas pontas da tabela: domingo e dezembro", () => {
    expect(dataExtenso(new Date(2026, 11, 6))).toBe("domingo, 6 de dezembro");
  });
});

// 018 — o item que a nutri prescreveu SEM quantidade não pode aparecer como
// "0 g". O curto-circuito é a regra; o resto é o comportamento de sempre.
describe("formatQuantidadeItem", () => {
  it('item à vontade: "à vontade", ignorando gramas e medida caseira', () => {
    expect(
      formatQuantidadeItem({
        adLibitum: true,
        quantityGrams: 0,
        medidaCaseira: null,
      }),
    ).toBe(A_VONTADE);

    // Mesmo que o DTO trouxesse resíduo, a flag manda.
    expect(
      formatQuantidadeItem({
        adLibitum: true,
        quantityGrams: 80,
        medidaCaseira: { label: "folha", grams: 10 },
      }),
    ).toBe(A_VONTADE);
  });

  it("item normal com medida caseira: usa a medida", () => {
    expect(
      formatQuantidadeItem({
        adLibitum: false,
        quantityGrams: 100,
        medidaCaseira: { label: "unidade média", grams: 50 },
      }),
    ).toBe("2 unidades médias (100 g)");
  });

  it("item normal sem medida: gramas", () => {
    expect(
      formatQuantidadeItem({
        adLibitum: false,
        quantityGrams: 150,
        medidaCaseira: null,
      }),
    ).toBe("150 g");
  });
});

// O label da tabela vale UMA unidade ("unidade média" = 50 g). Sem a contagem
// escrita, a tela imprimia "unidade média (117 g)": ou o paciente lê 1 ovo
// (errado) ou lê um ovo de 117 g (errado).
describe("formatQuantidade", () => {
  const ovo = { label: "unidade média", grams: 50 };

  it("uma unidade: o 1 vai escrito", () => {
    expect(formatQuantidade(52, ovo)).toBe("1 unidade média (52 g)");
  });

  it("mais de uma: contagem + label no plural + total em gramas", () => {
    expect(formatQuantidade(117, ovo)).toBe("2 unidades médias (117 g)");
    expect(
      formatQuantidade(47, { label: "colher de sopa cheia", grams: 12 }),
    ).toBe("4 colheres de sopa cheias (47 g)");
  });

  // Os rótulos que o ingest do TACO produz — flexão do núcleo e dos adjetivos,
  // sem tocar na preposição, no termo que ela governa, nem no parêntese.
  it.each([
    ["unidade", "2 unidades"],
    ["filé médio", "2 filés médios"],
    ["porção média", "2 porções médias"],
    ["porção média (cru)", "2 porções médias (cru)"],
    ["concha média", "2 conchas médias"],
    ["pedaço médio", "2 pedaços médios"],
    ["lata drenada", "2 latas drenadas"],
    ["folha", "2 folhas"],
    ["pote", "2 potes"],
  ])("plural de %s", (label, esperado) => {
    expect(formatQuantidade(200, { label, grams: 100 })).toBe(
      `${esperado} (200 g)`,
    );
  });

  it("granel (sem medida) ou medida zerada: só gramas", () => {
    expect(formatQuantidade(150, null)).toBe("150 g");
    expect(formatQuantidade(150, { label: "porção", grams: 0 })).toBe("150 g");
  });
});

// A prévia mostrava só o valor novo: dava pra ver QUAIS itens mudaram, não se
// aumentou, diminuiu, nem quanto.
describe("formatDiffQuantidade", () => {
  const fatia = { label: "fatia", grams: 25 };

  it("diminuiu: seta pra baixo, delta e o valor anterior", () => {
    expect(formatDiffQuantidade(70, 55, fatia)).toBe(
      "↓ 15 g · antes 3 fatias (70 g)",
    );
  });

  it("aumentou: seta pra cima", () => {
    expect(formatDiffQuantidade(120, 150, null)).toBe("↑ 30 g · antes 120 g");
  });

  it("mudança que arredonda pra 0 g: nada a anunciar", () => {
    expect(formatDiffQuantidade(100, 100, null)).toBeNull();
    expect(formatDiffQuantidade(100, 100.4, null)).toBeNull();
  });
});

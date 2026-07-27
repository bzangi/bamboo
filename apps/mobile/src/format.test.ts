import { describe, expect, it } from "vitest";
import { A_VONTADE, formatQuantidadeItem } from "./format";

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
    ).toBe("2× unidade média");
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

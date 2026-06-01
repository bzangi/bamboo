import { describe, expect, it } from "vitest";
import {
  PARAMETROS_SISTEMA,
  type ParametrosAdaptacao,
  resolverParametros,
} from "./params.js";

const sistema: ParametrosAdaptacao = PARAMETROS_SISTEMA;

describe("resolverParametros — precedência paciente > nutri > sistema", () => {
  it("só sistema (sem nutri/paciente) usa os defaults do sistema", () => {
    expect(resolverParametros({ sistema })).toEqual({
      toleranciaPct: 10,
      pisoPct: 50,
    });
  });

  it("nutri sobrepõe o sistema (nível 2)", () => {
    expect(
      resolverParametros({
        sistema,
        nutri: { toleranciaPct: 15, pisoPct: 60 },
      }),
    ).toEqual({ toleranciaPct: 15, pisoPct: 60 });
  });

  it("paciente vence a nutri (nível 1)", () => {
    expect(
      resolverParametros({
        sistema,
        nutri: { toleranciaPct: 15, pisoPct: 60 },
        paciente: { pisoPct: 70 },
      }),
    ).toEqual({ toleranciaPct: 15, pisoPct: 70 }); // tolerância da nutri, piso do paciente
  });

  it("mistura: paciente põe tolerância, nutri põe piso, resto cai pro sistema", () => {
    expect(
      resolverParametros({
        sistema,
        nutri: { pisoPct: 40 },
        paciente: { toleranciaPct: 8 },
      }),
    ).toEqual({ toleranciaPct: 8, pisoPct: 40 });
  });

  it("campos undefined (null no banco) caem pro próximo nível", () => {
    expect(
      resolverParametros({
        sistema,
        nutri: { toleranciaPct: undefined, pisoPct: undefined },
        paciente: { toleranciaPct: undefined },
      }),
    ).toEqual({ toleranciaPct: 10, pisoPct: 50 });
  });
});

import { describe, expect, it } from "vitest";
import { codigo, FRASES, frase } from "./erros";

// Este arquivo existe por causa de um defeito que o smoke da 017 pegou e nenhum
// teste pegava: criar refeição e excluir refeição respondem os DOIS 409, por
// causas opostas (posição ocupada vs. tem registro). Com uma entidade só, a tela
// mostrava "há registro nesta refeição" quando o problema era a posição — mandando
// a nutri procurar o erro no lugar errado.

describe("codigo — (status, entidade) → código", () => {
  it("separa os dois 409 da refeição por OPERAÇÃO", () => {
    // Foi o caso que quebrou no smoke.
    expect(codigo(409, "refeicao-posicao")).toBe("conflito-posicao");
    expect(codigo(409, "refeicao")).toBe("conflito-refeicao");
  });

  it("dá a frase de conflito de cada nó", () => {
    expect(codigo(409, "paciente")).toBe("conflito-paciente");
    expect(codigo(409, "plano")).toBe("conflito-plano");
    expect(codigo(409, "tipo-de-dia")).toBe("conflito-tipo-de-dia");
    expect(codigo(409, "opcao")).toBe("conflito-opcao");
  });

  it("422 do item é o vínculo com o grupo; da semana, o plano errado", () => {
    expect(codigo(422, "item")).toBe("fora-do-grupo");
    expect(codigo(422, "semana")).toBe("tipo-de-outro-plano");
    expect(codigo(422, "grupo")).toBe("sem-nutricionista");
  });

  it("400 nomeia a causa onde ela é nomeável, e cai no genérico onde não é", () => {
    expect(codigo(400, "semana")).toBe("semana-invalida");
    expect(codigo(400, "item")).toBe("conflito-item");
    expect(codigo(400, "paciente")).toBe("ficha-invalida");
    expect(codigo(400, "plano")).toBe("invalido");
  });

  it("404 e falha de rede", () => {
    expect(codigo(404, "plano")).toBe("nao-encontrado");
    // `statusDaFalha` devolve -1 quando não é ApiError, 0 quando não conectou.
    expect(codigo(0, "plano")).toBe("api");
    expect(codigo(-1, "plano")).toBe("api");
    expect(codigo(500, "plano")).toBe("api");
  });

  it("todo código devolvido tem frase — nenhum cai num undefined na tela", () => {
    const status = [400, 404, 409, 422, 500, 0, -1];
    const entidades = [
      "paciente",
      "plano",
      "tipo-de-dia",
      "refeicao-posicao",
      "refeicao",
      "opcao",
      "item",
      "semana",
      "alimento",
      "grupo",
    ] as const;
    for (const s of status) {
      for (const e of entidades) {
        const cod = codigo(s, e);
        expect(FRASES[cod], `${s}/${e} → ${cod}`).toBeTruthy();
      }
    }
  });
});

describe("frase — tradução do código que vem na URL", () => {
  it("traduz código conhecido", () => {
    expect(frase("conflito-posicao")).toBe(FRASES["conflito-posicao"]);
  });

  it("sem código não mostra nada", () => {
    expect(frase(undefined)).toBeNull();
    expect(frase("")).toBeNull();
  });

  it("código inventado cai na frase genérica — NUNCA reflete o que veio na URL", () => {
    // É a razão de o erro trafegar como código: um parâmetro de texto refletido
    // deixaria qualquer um montar uma URL que exibe a frase que quisesse dentro
    // da tela da nutri.
    expect(frase("Sua sessão expirou, clique aqui")).toBe(FRASES.api);
    expect(frase("<script>alert(1)</script>")).toBe(FRASES.api);
    expect(frase("constructor")).toBe(FRASES.api);
    expect(frase("toString")).toBe(FRASES.api);
  });
});

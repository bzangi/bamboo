import { describe, expect, it } from "vitest";
import { buscarFuzzy, normalizarBusca, pontuarFuzzy } from "./fuzzy.js";

describe("normalizarBusca", () => {
  it("dobra caixa e acento", () => {
    expect(normalizarBusca("Açaí Polpa Ção")).toBe("acai polpa cao");
    expect(normalizarBusca("PÃO FRANCÊS")).toBe("pao frances");
  });

  it("é idempotente", () => {
    const uma = normalizarBusca("Fígado à milanesa");
    expect(normalizarBusca(uma)).toBe(uma);
  });
});

describe("pontuarFuzzy", () => {
  it("acha sem acento o que tem acento", () => {
    expect(pontuarFuzzy("acai", "Açaí, polpa")).not.toBeNull();
  });

  it("acha por subsequência, não só por trecho contíguo", () => {
    expect(pontuarFuzzy("arrint", "Arroz integral")).not.toBeNull();
  });

  it("devolve null quando algum caractere não aparece na ordem", () => {
    expect(pontuarFuzzy("arroz", "Feijão carioca")).toBeNull();
    // Os caracteres existem, mas fora de ordem: "zorra" não é subsequência.
    expect(pontuarFuzzy("zorra", "Arroz")).toBeNull();
  });

  it("ignora espaço do termo — o nome pode separar com hífen", () => {
    expect(pontuarFuzzy("arroz integral", "Arroz-integral")).not.toBeNull();
  });

  it("termo vazio casa com tudo, com pontuação neutra", () => {
    expect(pontuarFuzzy("", "qualquer coisa")).toBe(0);
    expect(pontuarFuzzy("   ", "qualquer coisa")).toBe(0);
  });

  it("pontua mais o casamento contíguo que o espalhado", () => {
    const contiguo = pontuarFuzzy("arroz", "Arroz integral");
    const espalhado = pontuarFuzzy("arroz", "Farinha de arroz doce");
    expect(contiguo).not.toBeNull();
    expect(espalhado).not.toBeNull();
    expect(contiguo!).toBeGreaterThan(espalhado!);
  });

  it("colado pesa mais que quebrado em duas palavras", () => {
    // Isola o prêmio de contiguidade: o segundo candidato ganharia o bônus de
    // início de palavra e mesmo assim precisa ficar atrás.
    expect(pontuarFuzzy("ab", "ab")!).toBeGreaterThan(
      pontuarFuzzy("ab", "a b")!,
    );
  });

  it("pontua mais o casamento no início de palavra", () => {
    const inicio = pontuarFuzzy("int", "Arroz integral");
    const meio = pontuarFuzzy("int", "Manteiga de amendoim printada");
    expect(inicio!).toBeGreaterThan(meio!);
  });
});

describe("buscarFuzzy", () => {
  const nomes = [
    "Arroz branco",
    "Arroz integral",
    "Batata doce",
    "Farinha de arroz",
    "Feijão carioca",
  ];

  it("mantém só quem casa", () => {
    expect(buscarFuzzy(nomes, "arroz", (n) => n)).toEqual([
      "Arroz branco",
      "Arroz integral",
      "Farinha de arroz",
    ]);
  });

  it("ordena por relevância", () => {
    const [primeiro] = buscarFuzzy(nomes, "arrint", (n) => n);
    expect(primeiro).toBe("Arroz integral");
  });

  it("termo vazio devolve tudo, na ordem de entrada", () => {
    expect(buscarFuzzy(nomes, "", (n) => n)).toEqual(nomes);
  });

  it("empate preserva a ordem de entrada (desempate é do chamador)", () => {
    const iguais = ["Arroz b", "Arroz a"];
    expect(buscarFuzzy(iguais, "arroz", (n) => n)).toEqual(iguais);
  });

  it("não muta a entrada", () => {
    const entrada = [...nomes];
    buscarFuzzy(entrada, "a", (n) => n);
    expect(entrada).toEqual(nomes);
  });
});

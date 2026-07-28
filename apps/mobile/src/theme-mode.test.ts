import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getMode,
  isDark,
  parseThemeMode,
  setMode,
  subscribe,
} from "./theme-mode";

// O store é estado de MÓDULO (é o ponto: uma verdade para o app inteiro), então
// cada caso devolve o default — senão a ordem dos testes vira parte do resultado.
afterEach(() => setMode("system"));

describe("isDark", () => {
  it("no automático, quem manda é o sistema", () => {
    expect(isDark("system", "dark")).toBe(true);
    expect(isDark("system", "light")).toBe(false);
  });

  // São TRÊS jeitos de o sistema não dizer "escuro": `null` (o nativo ainda não
  // respondeu), `undefined` e `'unspecified'` — este último é um valor real que
  // a RN 0.85 devolve, e o `tsc` foi quem apontou que ele existia. Claro é o
  // default certo nos três: é o papel.
  it("automático sem resposta do sistema cai no claro", () => {
    expect(isDark("system", null)).toBe(false);
    expect(isDark("system", undefined)).toBe(false);
    expect(isDark("system", "unspecified")).toBe(false);
  });

  it("a escolha da pessoa vence o sistema, nos dois sentidos", () => {
    expect(isDark("light", "dark")).toBe(false);
    expect(isDark("dark", "light")).toBe(true);
  });

  it("a escolha da pessoa não depende de o sistema ter respondido", () => {
    expect(isDark("dark", null)).toBe(true);
    expect(isDark("light", null)).toBe(false);
  });
});

describe("parseThemeMode", () => {
  it("aceita os três modos", () => {
    expect(parseThemeMode("system")).toBe("system");
    expect(parseThemeMode("light")).toBe("light");
    expect(parseThemeMode("dark")).toBe("dark");
  });

  // O valor vem do disco, que é fora do programa. Um `as ThemeMode` faria disco
  // corrompido (ou de uma versão antiga) virar modo inválido em silêncio.
  it("recusa qualquer outra coisa", () => {
    expect(parseThemeMode(null)).toBeNull();
    expect(parseThemeMode(undefined)).toBeNull();
    expect(parseThemeMode("")).toBeNull();
    expect(parseThemeMode("Dark")).toBeNull();
    expect(parseThemeMode("escuro")).toBeNull();
  });
});

describe("store", () => {
  it("começa no automático", () => {
    expect(getMode()).toBe("system");
  });

  it("setMode grava e avisa quem está inscrito", () => {
    const avisar = vi.fn();
    subscribe(avisar);
    setMode("dark");
    expect(getMode()).toBe("dark");
    expect(avisar).toHaveBeenCalledTimes(1);
  });

  // Sem esta guarda, tocar "Escuro" já estando no escuro re-renderizaria as 9
  // telas por nada.
  it("setMode para o mesmo modo não avisa ninguém", () => {
    const avisar = vi.fn();
    setMode("dark");
    subscribe(avisar);
    setMode("dark");
    expect(avisar).not.toHaveBeenCalled();
  });

  it("cancelar a inscrição para de avisar", () => {
    const avisar = vi.fn();
    subscribe(avisar)();
    setMode("dark");
    expect(avisar).not.toHaveBeenCalled();
  });
});

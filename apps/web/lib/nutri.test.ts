import { describe, expect, it } from "vitest";
import { ApiError } from "@bamboo/api-client";
import { API_URL, ConfigError, explicarFalha } from "./nutri";

// A tela de falha é a que ninguém testa até ela falhar. Este arquivo existe
// porque ela FALHOU: a página passava a instância de `Error` como prop de
// componente e o render explodia em 500 — no caminho que só existe para não
// haver 500. A assinatura de `Falha` hoje só aceita string (o compilador segura
// a reincidência); aqui trava a outra metade: o texto tem de DIAGNOSTICAR.

const apiErr = (init: Partial<ConstructorParameters<typeof ApiError>[0]>) =>
  new ApiError({
    message: "boom",
    status: 500,
    isNetworkError: false,
    url: "http://x/y",
    method: "GET",
    body: undefined,
    ...init,
  });

describe("explicarFalha", () => {
  it("credencial ausente: diz QUAL env falta", () => {
    const r = explicarFalha(new ConfigError("NUTRI_API_KEY não está definida"));
    expect(r.titulo).toBe("Falta configurar a credencial");
    expect(r.detalhe).toContain("NUTRI_API_KEY");
  });

  it("não conectou: diz o endereço tentado E as duas portas que os scripts usam", () => {
    const r = explicarFalha(apiErr({ isNetworkError: true, status: 0 }));
    expect(r.titulo).toBe("A API não respondeu");
    expect(r.detalhe).toContain(API_URL);
    // O tropeço real: `pnpm --filter api dev` sobe na 3333, e a mensagem antes
    // mandava rodar isso citando a 3000. Seguir a instrução não resolvia.
    expect(r.detalhe).toContain("3333");
    expect(r.detalhe).toContain("API_URL");
  });

  it("403: aponta a divergência de chave, não repete o status cru", () => {
    const r = explicarFalha(apiErr({ status: 403 }));
    expect(r.titulo).toBe("Credencial recusada");
    expect(r.detalhe).toContain("NUTRI_API_KEY");
  });

  it("outro status: nomeia o status no título", () => {
    expect(explicarFalha(apiErr({ status: 502 })).titulo).toBe(
      "A API respondeu 502",
    );
  });

  it("erro fora do contrato não vira tela branca", () => {
    expect(explicarFalha(new Error("qualquer")).titulo).toBe("Erro inesperado");
    expect(explicarFalha("string solta").detalhe).toBe("string solta");
  });
});

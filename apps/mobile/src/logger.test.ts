import { ApiError } from "@bamboo/api-client";
import { describe, expect, it } from "vitest";
import { describeError, formatLog } from "./logger";

describe("describeError", () => {
  it("ApiError de rede → marca [rede] e mantém a mensagem (a causa que sumia)", () => {
    const e = new ApiError({
      message:
        "getToday — falha de rede: não conectou em http://localhost:3002",
      status: 0,
      isNetworkError: true,
      url: "http://localhost:3002",
      method: "GET",
      body: undefined,
    });
    const out = describeError(e);
    expect(out).toContain("[rede]");
    expect(out).toContain("não conectou");
  });

  it("ApiError HTTP → marca [HTTP <status>] e serializa o corpo de erro da API", () => {
    const e = new ApiError({
      message: "postCombine — HTTP 422 Unprocessable Entity",
      status: 422,
      isNetworkError: false,
      url: "http://x/combine",
      method: "POST",
      body: { statusCode: 422, message: "alimento fora do grupo" },
    });
    const out = describeError(e);
    expect(out).toContain("[HTTP 422]");
    expect(out).toContain("alimento fora do grupo");
  });

  it("Error comum → name: message", () => {
    expect(describeError(new TypeError("boom"))).toBe("TypeError: boom");
  });

  it("valor não-Error → String(valor)", () => {
    expect(describeError("xpto")).toBe("xpto");
    expect(describeError(42)).toBe("42");
  });
});

describe("formatLog", () => {
  it("prefixa nível e tag", () => {
    expect(formatLog("error", "HomeScreen", "boom")).toBe(
      "ERROR [HomeScreen] boom",
    );
  });
});

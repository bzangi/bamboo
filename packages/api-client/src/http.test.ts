import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, requestJson } from "./http.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

const okResponse = (data: unknown) => ({
  ok: true,
  status: 200,
  statusText: "OK",
  json: async () => data,
});

describe("requestJson", () => {
  it("devolve o JSON parseado quando a resposta é 2xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(okResponse({ hello: "world" })),
    );
    const out = await requestJson<{ hello: string }>("http://x/y");
    expect(out).toEqual({ hello: "world" });
  });

  it("falha de rede (fetch lança) → ApiError com isNetworkError=true e status 0", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Network request failed")),
    );
    const err = await requestJson("http://localhost:3002/today", {
      label: "getToday",
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err).toBeInstanceOf(Error); // os catches do app usam `e instanceof Error`
    const e = err as ApiError;
    expect(e.isNetworkError).toBe(true);
    expect(e.status).toBe(0);
    expect(e.message).toContain("getToday");
    expect(e.message).toContain("http://localhost:3002/today");
  });

  it("erro HTTP (não-ok) → ApiError com status e o corpo de erro da API anexado", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        statusText: "Unprocessable Entity",
        json: async () => ({
          statusCode: 422,
          message: "alimento fora do grupo",
        }),
      }),
    );
    const err = await requestJson("http://x/combine", {
      method: "POST",
      label: "postCombine",
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    const e = err as ApiError;
    expect(e.isNetworkError).toBe(false);
    expect(e.status).toBe(422);
    expect(e.body).toEqual({
      statusCode: 422,
      message: "alimento fora do grupo",
    });
    expect(e.message).toContain("422");
  });

  it("erro HTTP sem corpo JSON não quebra (body fica indefinido)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        json: async () => {
          throw new SyntaxError("Unexpected end of JSON input");
        },
      }),
    );
    const err = await requestJson("http://x/y").catch((e: unknown) => e);
    const e = err as ApiError;
    expect(e.status).toBe(500);
    expect(e.body).toBeUndefined();
  });
});

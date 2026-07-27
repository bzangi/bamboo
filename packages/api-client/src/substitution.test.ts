import { afterEach, describe, expect, it, vi } from "vitest";
import { getSubstitutions } from "./substitution.js";

// A montagem da query é a parte com decisão: o que entra, o que fica de fora e
// como o id é escapado. O resto do client é `requestJson`, já testado.
function espiarFetch() {
  const spy = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ alternatives: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", spy);
  return spy;
}

afterEach(() => vi.unstubAllGlobals());

describe("getSubstitutions", () => {
  const ID = "d5efbc96-9aa8-4d33-a92f-ecf2f0b81b2d";
  const url = (spy: ReturnType<typeof espiarFetch>) =>
    String(spy.mock.calls[0]![0]);

  it("sem query, a URL é a de sempre — o cliente antigo é este aqui", async () => {
    const spy = espiarFetch();
    await getSubstitutions("http://api", ID);
    expect(url(spy)).toBe(`http://api/meal-items/${ID}/substitutions`);
  });

  it("manda só o que foi pedido", async () => {
    const spy = espiarFetch();
    await getSubstitutions("http://api", ID, { limit: 20, offset: 40 });
    expect(url(spy)).toBe(
      `http://api/meal-items/${ID}/substitutions?limit=20&offset=40`,
    );
  });

  it("offset 0 e busca vazia ficam de fora — são o default do servidor", async () => {
    const spy = espiarFetch();
    await getSubstitutions("http://api", ID, { q: "", limit: 20, offset: 0 });
    expect(url(spy)).toBe(`http://api/meal-items/${ID}/substitutions?limit=20`);
  });

  it("escapa o termo — acento e espaço não podem quebrar a URL", async () => {
    const spy = espiarFetch();
    await getSubstitutions("http://api", ID, { q: "açaí polpa" });
    expect(url(spy)).toContain("?q=a%C3%A7a%C3%AD+polpa");
  });
});

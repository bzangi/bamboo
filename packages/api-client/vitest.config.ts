import { defineConfig } from "vitest/config";

// Testes da camada de rede tipada (http.ts) — fetch mockado, ambiente node.
// Sem RN/DOM: o client é fetch puro. Os arquivos *.test.ts ficam fora do build
// (tsconfig.build.json os exclui de dist/).
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});

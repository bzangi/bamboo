import { defineConfig } from "vitest/config";

// O construtor de cenário fala com o banco, então o .env da RAIZ tem de ser
// carregado ANTES de qualquer import de ./src/client.ts (que lê DATABASE_URL no
// momento do import e lança se faltar). Mesmo padrão de apps/api/test/setup-env.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["./src/testing/setup-env.ts"],
    // Banco compartilhado: sem paralelismo entre arquivos (padrão do apps/api).
    fileParallelism: false,
    hookTimeout: 30000,
    testTimeout: 30000,
  },
});

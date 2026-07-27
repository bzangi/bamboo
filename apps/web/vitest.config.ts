import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Módulos puros de apresentação (`lib/`) + a lógica do editor de plano (o diff
// da revisão e a mecânica das linhas repetidas), que são lógica de verdade.
//
// Continua NÃO havendo harness de componente (mesma decisão consciente do
// apps/mobile): nada aqui renderiza React. O `happy-dom` entra só onde o
// arquivo pede (`@vitest-environment` no topo do teste) — esses dois módulos
// leem e mexem no DOM do formulário, então testá-los sem DOM seria testar
// outra coisa.
export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "app/**/*.test.ts"],
  },
  // O `@/` do tsconfig do Next: o Vitest não lê `paths` sozinho.
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
});

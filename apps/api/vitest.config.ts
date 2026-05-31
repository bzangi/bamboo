import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// Vitest + NestJS: o plugin do SWC transpila os decorators do Nest
// (emitDecoratorMetadata) — sem ele, a DI quebra nos testes.
// O setupFile carrega o .env da raiz ANTES de qualquer import de @bamboo/db
// (que lê DATABASE_URL no momento do import).
export default defineConfig({
  // O SWC plugin (abaixo) cuida da transformação dos decorators do Nest. O
  // Vitest 4 emite um aviso cosmético ("esbuild option is set to false") porque
  // o unplugin-swc desliga o transform default — sem efeito nos testes.
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.e2e-spec.ts"],
    setupFiles: ["./test/setup-env.ts"],
    // Banco compartilhado entre suites: roda sem paralelismo entre arquivos.
    fileParallelism: false,
    hookTimeout: 30000,
    testTimeout: 30000,
  },
  plugins: [
    swc.vite({
      module: { type: "es6" },
    }),
  ],
});

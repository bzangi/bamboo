import { defineConfig } from "vitest/config";

// Roda só o módulo puro de apresentação (lib/format.ts). Sem jsdom: não há
// harness de componente no repo (mesma decisão consciente do apps/mobile) — as
// páginas são Server Components de layout, e o que elas DERIVAM está aqui.
export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
});

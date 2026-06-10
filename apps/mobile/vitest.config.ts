import { defineConfig } from "vitest/config";

// Roda só o módulo puro de estado de sessão (swaps.ts). Sem RN/jsdom: o reducer
// não importa nada de react-native, então o ambiente node basta. Componentes RN
// (HomeScreen, sheets, snackbar) NÃO são testados aqui — não há harness de
// componente no app (decisão consciente no plan.md / Complexity Tracking).
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});

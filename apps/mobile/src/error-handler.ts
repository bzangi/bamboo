import { type ErrorUtils } from "react-native";
import { API_URL, PATIENT_ID } from "./config";
import { log } from "./logger";

// Rede de segurança: captura erros JS NÃO tratados (fora de qualquer try/catch e
// fora da árvore React) e os loga no console — antes ficavam invisíveis. Encadeia
// o handler anterior do RN pra preservar o redbox/relatório padrão em dev.
let installed = false;

export function installGlobalErrorHandler(): void {
  if (installed) return;
  installed = true;

  // Boot: a 1ª coisa a checar quando "nada funciona" — qual URL o app chama e se
  // o paciente está configurado. (No emulador Android, localhost ≠ a máquina:
  // use 10.0.2.2; a API sobe em 3000 sem PORT, o app aponta p/ 3002 por default.)
  log.info(
    "boot",
    `API_URL=${API_URL} · PATIENT_ID=${PATIENT_ID ? "configurado" : "NÃO CONFIGURADO"}`,
  );

  const g = globalThis as unknown as { ErrorUtils?: ErrorUtils };
  const handler = g.ErrorUtils;
  if (!handler?.setGlobalHandler) return;

  const previous = handler.getGlobalHandler?.();
  handler.setGlobalHandler((error: unknown, isFatal?: boolean) => {
    log.error(
      "global",
      `erro JS não tratado${isFatal ? " (FATAL)" : ""}`,
      error,
    );
    previous?.(error, isFatal); // preserva o comportamento padrão do RN.
  });
}

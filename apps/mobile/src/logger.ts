// Logger fino do app: padroniza o que vai pro console (Metro). O ponto central
// é `describeError` — transforma um erro qualquer numa linha legível que SEPARA
// falha de rede (não conectou: API_URL/porta) de erro HTTP (status + corpo da
// API). Era exatamente o que sumia: os catches mostravam só uma mensagem fina e
// nada no console. Sem dependência de react-native — roda no Vitest (node).
import { ApiError } from "@bamboo/api-client";

export type LogLevel = "debug" | "info" | "warn" | "error";

/** Descreve um erro de forma acionável (rede vs HTTP vs Error vs valor cru). */
export function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.isNetworkError) return `[rede] ${err.message}`;
    const body =
      err.body !== undefined ? ` body=${JSON.stringify(err.body)}` : "";
    return `[HTTP ${err.status}] ${err.message}${body}`;
  }
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}

/** Formata a linha de log (puro): `NÍVEL [tag] mensagem`. */
export function formatLog(
  level: LogLevel,
  tag: string,
  message: string,
): string {
  return `${level.toUpperCase()} [${tag}] ${message}`;
}

function emit(
  level: LogLevel,
  sink: (msg: string) => void,
  tag: string,
  message: string,
  err?: unknown,
): void {
  const detail = err !== undefined ? ` — ${describeError(err)}` : "";
  sink(formatLog(level, tag, `${message}${detail}`));
}

// Wrappers por nível. `tag` = origem (ex.: "HomeScreen"), `message` = o que
// estava acontecendo, `err` (opcional) = o erro capturado.
export const log = {
  debug: (tag: string, message: string, err?: unknown) =>
    emit("debug", console.log, tag, message, err),
  info: (tag: string, message: string, err?: unknown) =>
    emit("info", console.log, tag, message, err),
  warn: (tag: string, message: string, err?: unknown) =>
    emit("warn", console.warn, tag, message, err),
  error: (tag: string, message: string, err?: unknown) =>
    emit("error", console.error, tag, message, err),
};

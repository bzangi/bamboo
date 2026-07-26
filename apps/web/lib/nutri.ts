// Acesso à via /nutri da API. **Só roda no servidor** (Server Components): a
// credencial da nutri nunca pode chegar ao navegador (FR-006).
//
// A garantia não é um comentário: o app não tem NENHUM componente client
// ("use client" não aparece em arquivo algum), e a chave é lida de
// `process.env.NUTRI_API_KEY` — sem prefixo `NEXT_PUBLIC_`, ela simplesmente não
// existe no bundle do browser. Se um dia alguém importar isto de um componente
// client, `process.env` vem vazio e o fetch falha fechado, com a mensagem de
// configuração abaixo. Fail-closed do mesmo jeito que o guard do lado da API.
//
// Reusa o `requestJson` do @bamboo/api-client (D6): ele separa "não conectou" de
// "a API respondeu erro", que é exatamente a distinção que a tela precisa dizer.
import { ApiError, requestJson } from "@bamboo/api-client";
import type { CycleReportResponse, NutriPatientsResponse } from "@bamboo/types";

export const API_URL = process.env.API_URL ?? "http://localhost:3000";

/** Erro de CONFIGURAÇÃO (não de rede, não da API): a env não está no lugar. */
export class ConfigError extends Error {}

function nutriHeaders(): Record<string, string> {
  const key = process.env.NUTRI_API_KEY;
  if (!key) {
    throw new ConfigError(
      "NUTRI_API_KEY não está definida no ambiente do servidor web. " +
        "Copie o .env.example para .env na raiz do monorepo (a mesma chave que a API usa) e reinicie o `next dev`.",
    );
  }
  return { "x-nutri-key": key };
}

const get = <T>(path: string, label: string): Promise<T> =>
  requestJson<T>(`${API_URL}${path}`, {
    label,
    headers: nutriHeaders(),
    // A nutri está lendo acompanhamento: nada de resposta cacheada.
    cache: "no-store",
  });

/** A roster. Também é a fonte de nome + ciclo atual da tela do paciente (D1). */
export const listPatients = (): Promise<NutriPatientsResponse> =>
  get<NutriPatientsResponse>("/nutri/patients", "listPatients");

/** O relatório de ciclo da 011, consumido sem alteração. */
export const getCycleReport = (
  patientId: string,
  cycleId: string,
): Promise<CycleReportResponse> =>
  get<CycleReportResponse>(
    `/nutri/patients/${encodeURIComponent(patientId)}/cycles/${encodeURIComponent(cycleId)}/report`,
    "getCycleReport",
  );

/** Diagnóstico em uma frase, com o próximo passo (US3). Sem stack trace na tela. */
export function explicarFalha(e: unknown): {
  readonly titulo: string;
  readonly detalhe: string;
} {
  if (e instanceof ConfigError) {
    return { titulo: "Falta configurar a credencial", detalhe: e.message };
  }
  if (e instanceof ApiError && e.isNetworkError) {
    return {
      titulo: "A API não respondeu",
      detalhe: `Não foi possível conectar em ${API_URL}. Suba a API (\`pnpm --filter api dev\`) ou ajuste API_URL.`,
    };
  }
  if (e instanceof ApiError && e.status === 403) {
    return {
      titulo: "Credencial recusada",
      detalhe:
        "A API respondeu 403: o valor de NUTRI_API_KEY no web não é o mesmo que o da API.",
    };
  }
  if (e instanceof ApiError) {
    return {
      titulo: `A API respondeu ${e.status}`,
      detalhe: e.message,
    };
  }
  return {
    titulo: "Erro inesperado",
    detalhe: e instanceof Error ? e.message : String(e),
  };
}

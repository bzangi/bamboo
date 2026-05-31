// Client tipado do endpoint GET /patients/:id/today.
import type { TodayResponse } from "@bamboo/types";

/**
 * Busca o plano do dia ("o agora") de um paciente.
 * @param baseUrl base da API (ex.: "http://localhost:3000")
 * @param patientId uuid do paciente
 */
export async function getToday(
  baseUrl: string,
  patientId: string,
): Promise<TodayResponse> {
  const res = await fetch(
    `${baseUrl}/patients/${encodeURIComponent(patientId)}/today`,
  );
  if (!res.ok) {
    throw new Error(`getToday failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as TodayResponse;
}

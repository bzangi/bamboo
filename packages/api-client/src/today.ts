// Client tipado do endpoint GET /patients/:id/today.
import type { TodayResponse } from "@bamboo/types";

/**
 * Busca o plano do dia ("o agora") de um paciente.
 * @param baseUrl base da API (ex.: "http://localhost:3000")
 * @param patientId uuid do paciente
 * @param dayTypeId (opcional) força a exibição de outro tipo-de-dia (Fase 2 —
 *   troca de cardápio, só exibição; re-ancora "o agora").
 */
export async function getToday(
  baseUrl: string,
  patientId: string,
  dayTypeId?: string,
): Promise<TodayResponse> {
  const qs = dayTypeId ? `?dayTypeId=${encodeURIComponent(dayTypeId)}` : "";
  const res = await fetch(
    `${baseUrl}/patients/${encodeURIComponent(patientId)}/today${qs}`,
  );
  if (!res.ok) {
    throw new Error(`getToday failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as TodayResponse;
}

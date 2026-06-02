// Client tipado do endpoint POST /patients/:id/registro (US1/US2/US3 —
// registrar / corrigir / desfazer o estado de uma refeição num dia).
import type { RegistroRequest, RegistroResponse } from "@bamboo/types";

/**
 * Registra (feito/pulei), corrige ou desfaz o estado de uma refeição no dia.
 * Upsert idempotente, "nunca barra": o servidor responde 200 mesmo em no-op.
 * O cliente NUNCA envia "troquei" — é derivado no servidor a partir da opção
 * escolhida / itens consumidos.
 * @param baseUrl base da API (ex.: "http://localhost:3000")
 * @param patientId uuid do paciente
 * @param body intent + mealId (+ consumo/dayTypeId opcionais)
 */
export async function postRegistro(
  baseUrl: string,
  patientId: string,
  body: RegistroRequest,
): Promise<RegistroResponse> {
  const res = await fetch(
    `${baseUrl}/patients/${encodeURIComponent(patientId)}/registro`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    throw new Error(`postRegistro failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as RegistroResponse;
}

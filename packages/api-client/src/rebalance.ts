// Client tipado do endpoint POST /patients/:id/rebalance/option-choice (US1).
import type { OptionChoiceRequest, OptionChoiceResponse } from "@bamboo/types";
import { requestJson } from "./http.js";

/**
 * Pede a prévia do rebalanceamento ao escolher uma opção desigual (gatilho P1).
 * Não persiste nada (estado local no app). recusa-orientada vem como 200.
 */
export async function postOptionChoice(
  baseUrl: string,
  patientId: string,
  body: OptionChoiceRequest,
): Promise<OptionChoiceResponse> {
  return requestJson<OptionChoiceResponse>(
    `${baseUrl}/patients/${encodeURIComponent(patientId)}/rebalance/option-choice`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      label: "postOptionChoice",
    },
  );
}

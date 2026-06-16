// Client tipado do endpoint POST /meal-items/:id/combine (US2 — combinação 1→2).
import type { CombineRequest, CombineResponse } from "@bamboo/types";
import { requestJson } from "./http.js";

/**
 * Combina um item flexível em DOIS alvos do mesmo grupo, preservando o
 * nutriente-base (split ajustável). Não persiste (estado local no app).
 */
export async function postCombine(
  baseUrl: string,
  mealItemId: string,
  body: CombineRequest,
): Promise<CombineResponse> {
  return requestJson<CombineResponse>(
    `${baseUrl}/meal-items/${encodeURIComponent(mealItemId)}/combine`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      label: "postCombine",
    },
  );
}

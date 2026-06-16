// Client tipado do endpoint GET /meal-items/:id/substitutions.
import type { SubstitutionsResponse } from "@bamboo/types";
import { requestJson } from "./http.js";

/**
 * Lista as alternativas de troca de um item flexível (já com gramas + medida caseira).
 * @param baseUrl base da API (ex.: "http://localhost:3000")
 * @param mealItemId uuid do meal_item
 */
export async function getSubstitutions(
  baseUrl: string,
  mealItemId: string,
): Promise<SubstitutionsResponse> {
  return requestJson<SubstitutionsResponse>(
    `${baseUrl}/meal-items/${encodeURIComponent(mealItemId)}/substitutions`,
    { label: "getSubstitutions" },
  );
}

// Client tipado do endpoint GET /meal-items/:id/substitutions.
import type { SubstitutionsResponse } from "@bamboo/types";

/**
 * Lista as alternativas de troca de um item flexível (já com gramas + medida caseira).
 * @param baseUrl base da API (ex.: "http://localhost:3000")
 * @param mealItemId uuid do meal_item
 */
export async function getSubstitutions(
  baseUrl: string,
  mealItemId: string,
): Promise<SubstitutionsResponse> {
  const res = await fetch(
    `${baseUrl}/meal-items/${encodeURIComponent(mealItemId)}/substitutions`,
  );
  if (!res.ok) {
    throw new Error(`getSubstitutions failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as SubstitutionsResponse;
}

// Client tipado do endpoint GET /meal-items/:id/substitutions.
import type { SubstitutionsResponse } from "@bamboo/types";
import { requestJson } from "./http.js";

/** Busca + página (019). Omitir tudo devolve o grupo inteiro, como sempre. */
export interface SubstitutionsQuery {
  /** Trecho do nome. Busca fuzzy no servidor: subsequência, sem acento/caixa. */
  readonly q?: string;
  readonly limit?: number;
  readonly offset?: number;
  /** 021: inclui o food de origem entre os candidatos (uso do combinar). */
  readonly includeSelf?: boolean;
}

/**
 * Lista as alternativas de troca de um item flexível (já com gramas + medida caseira).
 * @param baseUrl base da API (ex.: "http://localhost:3000")
 * @param mealItemId uuid do meal_item
 * @param query busca e página; a última página é a que volta com menos de `limit`
 */
export async function getSubstitutions(
  baseUrl: string,
  mealItemId: string,
  query: SubstitutionsQuery = {},
): Promise<SubstitutionsResponse> {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  if (query.offset) params.set("offset", String(query.offset));
  if (query.includeSelf) params.set("includeSelf", "true");
  const qs = params.toString();

  return requestJson<SubstitutionsResponse>(
    `${baseUrl}/meal-items/${encodeURIComponent(mealItemId)}/substitutions${
      qs ? `?${qs}` : ""
    }`,
    { label: "getSubstitutions" },
  );
}

// DTOs do contrato POST /patients/:id/registro (US1/US2/US3 — registrar /
// corrigir / desfazer o estado de uma refeição num dia). Tipos puros
// compartilhados entre a casca (apps/api) e os clientes (api-client / mobile).
// Nenhuma dependência de Drizzle/Nest aqui.

// O cliente nunca envia "troquei": ele é DERIVADO no servidor (FR-003) a partir
// da opção escolhida / itens consumidos.
export type RegistroIntent = "feito" | "pulei" | "desfazer";

export type RegistroConsumo = {
  // Opcional: ausente → o servidor assume a opção default da refeição.
  readonly chosenOptionId?: string;
  // Opcional: presente só quando houve substituição/combinação. Os itens
  // efetivamente consumidos, já materializados (foodId + gramas).
  readonly items?: ReadonlyArray<{
    readonly itemId: string;
    readonly foodId: string;
    readonly quantityGrams: number;
  }>;
};

export type RegistroRequest = {
  readonly mealId: string;
  readonly intent: RegistroIntent;
  // Opcional: override de tipo-de-dia da sessão; senão o servidor resolve o default.
  readonly dayTypeId?: string;
  // Opcional mesmo em intent="feito"; ausente em pulei/desfazer.
  readonly consumo?: RegistroConsumo;
};

export type RegistroResponse = {
  readonly mealId: string;
  readonly loggedDate: string;
  // Estado vigente após a operação; null = não-registrada (após desfazer).
  readonly vigente: { readonly state: "feito" | "troquei" | "pulei" } | null;
  // 1ª refeição não-registrada após a operação; null se dia concluído.
  readonly currentMealId: string | null;
  readonly diaConcluido: boolean;
};

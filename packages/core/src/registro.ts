// Registro pendurado na consulta (Fase 3). Funções puras: sem I/O, sem throw,
// sem mutação; entradas readonly; erro como Result. A casca (apps/api) alimenta
// o core com valores JÁ RESOLVIDOS no banco (grupos de equivalência, is_default
// da opção, seq) — o core nunca recebe nem confia em ids de grupo do cliente.
// Ver contracts/core-registro.md.

import { type Result, err, ok } from "./result.js";

/* ============ Tipos de domínio ============ */

export type EstadoRegistro = "feito" | "troquei" | "pulei";

// Item efetivamente consumido. groupIdEsperado e groupId são RESOLVIDOS NO BANCO
// pela casca (meal_item.substitutionGroupId e food_substitution_group), NUNCA do
// payload.
export type ItemConsumido = {
  readonly groupIdEsperado: string; // grupo do item do plano substituído (DB)
  readonly groupId: string; // grupo do alimento consumido (DB)
  readonly gramas: number;
};

// Adequação no momento do "feito" (deriva troquei, FR-003). A casca MONTA esta DU:
//  - resolve is_default da chosenOptionId → se não-default emite "opcao-nao-default";
//  - resolve grupos dos itens no banco → emite "substituicao-combinacao" (itens não-vazio);
//  - sem opção não-default e sem itens → passa adequacao = null (→ feito).
export type Adequacao =
  | {
      readonly kind: "substituicao-combinacao";
      readonly itens: ReadonlyArray<ItemConsumido>;
    }
  | { readonly kind: "opcao-nao-default"; readonly mealOptionId: string };

export type ClassificacaoError =
  | { readonly kind: "consumo-fora-do-grupo" }
  | { readonly kind: "consumo-invalido" };

// Evento append-only já materializado pela casca. `seq` = ordem total
// estritamente crescente por (paciente, refeição, dia). state null = anulação
// (desfazer).
export type EventoRegistro = {
  readonly seq: number;
  readonly state: EstadoRegistro | null;
};

export type AlvoRegistro =
  | { readonly kind: "marcar"; readonly estado: EstadoRegistro }
  | { readonly kind: "desfazer" };

export type DecisaoRegistro =
  | { readonly kind: "inserir"; readonly state: EstadoRegistro | null } // null = anulação
  | { readonly kind: "no-op" };

export type OAgora =
  | { readonly kind: "refeicao"; readonly mealId: string }
  | { readonly kind: "dia-concluido" };

/* ============ classificarEstado (FR-002, FR-003, FR-004) ============ */

/**
 * Deriva feito/troquei/pulei a partir da marcação e da adequação montada pela
 * casca. Pura; retorna Result, nunca lança.
 *
 * - nao-consumiu → pulei (adequação ignorada).
 * - consumiu + adequacao null → feito.
 * - consumiu + opcao-nao-default → troquei.
 * - consumiu + substituicao-combinacao:
 *     itens vazio → consumo-invalido;
 *     por item, GRUPO ANTES DE GRAMAS: fora do grupo → consumo-fora-do-grupo;
 *       senão gramas <= 0 → consumo-invalido;
 *     todos válidos → troquei.
 */
export function classificarEstado(input: {
  readonly marcacao: "consumiu" | "nao-consumiu";
  readonly adequacao: Adequacao | null;
}): Result<EstadoRegistro, ClassificacaoError> {
  if (input.marcacao === "nao-consumiu") return ok("pulei");

  const { adequacao } = input;
  if (adequacao === null) return ok("feito");
  if (adequacao.kind === "opcao-nao-default") return ok("troquei");

  // substituicao-combinacao
  if (adequacao.itens.length === 0) return err({ kind: "consumo-invalido" });

  for (const item of adequacao.itens) {
    if (item.groupId !== item.groupIdEsperado)
      return err({ kind: "consumo-fora-do-grupo" });
    if (item.gramas <= 0) return err({ kind: "consumo-invalido" });
  }

  return ok("troquei");
}

/* ============ estadoVigente (FR-010, FR-011) ============ */

/**
 * Last-wins por `seq` + tombstone. Total (nunca falha), robusto a array fora de
 * ordem. Lista vazia → null. Estado do evento de maior seq; se esse state é null
 * (anulação) → null (não-registrada).
 */
export function estadoVigente(
  eventos: ReadonlyArray<EventoRegistro>,
): EstadoRegistro | null {
  if (eventos.length === 0) return null;

  const ultimo = eventos.reduce((maior, e) => (e.seq > maior.seq ? e : maior));

  return ultimo.state;
}

/* ============ decidirRegistro (FR-012) ============ */

/**
 * Idempotência alvo-vs-vigente. Pura, total.
 * - marcar E: vigente === E → no-op; senão inserir(E).
 * - desfazer: vigente === null → no-op; senão inserir(null).
 */
export function decidirRegistro(input: {
  readonly vigente: EstadoRegistro | null;
  readonly alvo: AlvoRegistro;
}): DecisaoRegistro {
  const { vigente, alvo } = input;

  if (alvo.kind === "desfazer") {
    return vigente === null
      ? { kind: "no-op" }
      : { kind: "inserir", state: null };
  }

  // alvo.kind === "marcar"
  return vigente === alvo.estado
    ? { kind: "no-op" }
    : { kind: "inserir", state: alvo.estado };
}

/* ============ derivarOAgora (FR-006, FR-007, FR-008, FR-013) ============ */

/**
 * Invariante "o agora": 1ª refeição não-registrada na ordem do plano.
 * - Ordena `refeicoes` por `ordem`; retorna a 1ª cujo estado vigente é null.
 * - Ausência em `vigentes` (refeição sem evento) ≡ estado null (não-registrada);
 *   normaliza `estado ?? null` (nunca compara `=== null` sobre lookup undefined).
 * - Todas com estado → dia-concluido. Lista vazia → dia-concluido (sem erro).
 */
export function derivarOAgora(input: {
  readonly refeicoes: ReadonlyArray<{
    readonly mealId: string;
    readonly ordem: number;
  }>;
  readonly vigentes: ReadonlyArray<{
    readonly mealId: string;
    readonly estado: EstadoRegistro | null;
  }>;
}): OAgora {
  const estadoPorMealId = new Map(
    input.vigentes.map((v) => [v.mealId, v.estado] as const),
  );

  const ordenadas = [...input.refeicoes].sort((a, b) => a.ordem - b.ordem);

  for (const refeicao of ordenadas) {
    const estado = estadoPorMealId.get(refeicao.mealId) ?? null;
    if (estado === null) return { kind: "refeicao", mealId: refeicao.mealId };
  }

  return { kind: "dia-concluido" };
}

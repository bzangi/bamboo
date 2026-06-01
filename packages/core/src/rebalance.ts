// rebalance.ts — o motor de rebalanceamento (Fase 2). Um primitivo puro
// `rebalancearPorKcal` + dois adaptadores por gatilho: `previewTrocaOpcao` (P1)
// e `previewTrocaTipoDia` (P3, engine-level). Ancorado em kcal, distribuição
// proporcional à contribuição de kcal, respeitando o piso; recusa orientada é
// desfecho `ok` ("nunca barra"). Sem I/O, sem throw, sem mutação de entrada.
// Decisões D1–D4. Ver contracts/core-rebalancear.md.

import {
  type FoodMacros,
  type ItemNutricional,
  type Nutrientes,
  alvoDoDia,
  avaliarFaixa,
  nutrientesDaPorcao,
  somaNutrientes,
} from "./nutrition.js";
import { type HouseholdMeasure, medidaMaisProxima } from "./substitution.js";
import { type ParametrosAdaptacao } from "./params.js";
import { type Result, err, ok } from "./result.js";

const EPS = 1e-6;

export interface Alavanca {
  readonly itemId: string;
  readonly refeicaoPosition: number;
  readonly macros: FoodMacros;
  readonly gramasPlanejado: number; // baseline do piso
  readonly gramasAtual: number;
  readonly medidas: readonly HouseholdMeasure[];
}

export interface AlavancaAjustada {
  readonly itemId: string;
  readonly refeicaoPosition: number;
  readonly gramasNovo: number;
  readonly medidaCaseira: HouseholdMeasure | null;
}

export type RebalanceOutcome =
  | { readonly kind: "sem-acao" } // dentro da faixa (FR-002)
  | {
      readonly kind: "rebalanceado";
      readonly alavancas: readonly AlavancaAjustada[];
      readonly totalDepois: Nutrientes;
    }
  | {
      readonly kind: "recusa-orientada"; // FR-009 — "nunca barra" (é ok, não erro)
      readonly motivo: "estoura-piso" | "sem-alavanca";
    };

export type RebalanceError = { readonly kind: "entrada-invalida" };

const kcalPorGrama = (m: FoodMacros): number => m.kcalPer100g / 100;

const somaVetores = (a: Nutrientes, b: Nutrientes): Nutrientes => ({
  kcal: a.kcal + b.kcal,
  carb: a.carb + b.carb,
  protein: a.protein + b.protein,
  fat: a.fat + b.fat,
});

const TODOS_DENTRO = (
  faixa: Record<keyof Nutrientes, "dentro" | "acima" | "abaixo">,
): boolean => Object.values(faixa).every((s) => s === "dentro");

/**
 * Primitivo: absorve `deltaKcal` reescalando as alavancas, proporcional à
 * contribuição de kcal de cada uma, respeitando o piso (`gramasPlanejado ×
 * pisoPct/100`). `deltaKcal > 0` = REDUZIR o resto do dia; `< 0` = AUMENTAR.
 * Desfecho de produto é `ok`; só entrada estruturalmente inválida vira `err`.
 */
export function rebalancearPorKcal(input: {
  readonly alavancas: readonly Alavanca[];
  readonly deltaKcal: number;
  readonly pisoPct: number;
  readonly totalAtual: Nutrientes;
}): Result<RebalanceOutcome, RebalanceError> {
  const { alavancas, deltaKcal, pisoPct, totalAtual } = input;

  if (
    pisoPct < 0 ||
    pisoPct > 100 ||
    alavancas.some((a) => a.gramasAtual < 0 || a.gramasPlanejado < 0)
  ) {
    return err({ kind: "entrada-invalida" });
  }

  if (Math.abs(deltaKcal) < EPS) return ok({ kind: "sem-acao" });
  if (alavancas.length === 0)
    return ok({ kind: "recusa-orientada", motivo: "sem-alavanca" });

  // Estado de scratch local por alavanca (não muta a entrada; iteramos por
  // elemento pra não esbarrar em noUncheckedIndexedAccess).
  const estado = alavancas.map((a) => ({
    a,
    kpg: kcalPorGrama(a.macros),
    floor: a.gramasPlanejado * (pisoPct / 100),
    gramas: a.gramasAtual,
  }));

  if (deltaKcal > 0) {
    // REDUZIR: proporcional à kcal atual, clamp no piso, transborda em passes.
    let restante = deltaKcal;
    const maxPasses = estado.length + 2;
    for (let pass = 0; pass < maxPasses && restante > EPS; pass++) {
      const ativos = estado.filter((s) => s.kpg > 0 && s.gramas - s.floor > EPS);
      if (ativos.length === 0) break;
      const somaPesos = ativos.reduce((acc, s) => acc + s.gramas * s.kpg, 0);
      if (somaPesos < EPS) break;
      let removido = 0;
      for (const s of ativos) {
        const cap = (s.gramas - s.floor) * s.kpg;
        const removeKcal = Math.min(
          restante * ((s.gramas * s.kpg) / somaPesos),
          cap,
        );
        s.gramas -= removeKcal / s.kpg;
        removido += removeKcal;
      }
      restante -= removido;
      if (removido < EPS) break;
    }
    if (restante > EPS)
      return ok({ kind: "recusa-orientada", motivo: "estoura-piso" });
  } else {
    // AUMENTAR: proporcional à kcal atual, sem teto rígido (o saldo do dia é o
    // limite — deltaKcal já é exatamente o que falta). Um passe.
    const adicionar = -deltaKcal;
    const somaPesos = estado.reduce((acc, s) => acc + s.gramas * s.kpg, 0);
    if (somaPesos < EPS)
      return ok({ kind: "recusa-orientada", motivo: "sem-alavanca" });
    for (const s of estado) {
      if (s.kpg <= 0) continue;
      s.gramas += (adicionar * ((s.gramas * s.kpg) / somaPesos)) / s.kpg;
    }
  }

  // Monta alavancas ajustadas + totalDepois (totalAtual + Σ deltas dos itens).
  const ajustadas: AlavancaAjustada[] = estado.map((s) => ({
    itemId: s.a.itemId,
    refeicaoPosition: s.a.refeicaoPosition,
    gramasNovo: s.gramas,
    medidaCaseira: medidaMaisProxima(s.gramas, s.a.medidas),
  }));
  const deltaTotal = estado.reduce<Nutrientes>((acc, s) => {
    const antes = nutrientesDaPorcao(s.a.macros, s.a.gramasAtual);
    const depois = nutrientesDaPorcao(s.a.macros, s.gramas);
    return somaVetores(acc, {
      kcal: depois.kcal - antes.kcal,
      carb: depois.carb - antes.carb,
      protein: depois.protein - antes.protein,
      fat: depois.fat - antes.fat,
    });
  }, { kcal: 0, carb: 0, protein: 0, fat: 0 });

  return ok({
    kind: "rebalanceado",
    alavancas: ajustadas,
    totalDepois: somaVetores(totalAtual, deltaTotal),
  });
}

/* ============================================================
 * Itens do dia (entrada dos adaptadores) e seleção de alavancas.
 * ============================================================ */

export interface ItemDia {
  readonly itemId: string;
  readonly macros: FoodMacros;
  readonly gramas: number; // atual (na opção escolhida / no planejado)
  readonly gramasPlanejado: number; // baseline do piso
  readonly isLocked: boolean;
  readonly groupId: string | null;
  readonly medidas: readonly HouseholdMeasure[];
}

export interface RefeicaoDia {
  readonly position: number;
  readonly itens: readonly ItemDia[];
}

// Item flexível = não travado e com grupo de substituição (FR-006).
const ehAlavanca = (i: ItemDia): boolean => !i.isLocked && i.groupId != null;

const toAlavanca = (i: ItemDia, position: number): Alavanca => ({
  itemId: i.itemId,
  refeicaoPosition: position,
  macros: i.macros,
  gramasPlanejado: i.gramasPlanejado,
  gramasAtual: i.gramas,
  medidas: i.medidas,
});

type RefeicaoDefault = { readonly itens: ReadonlyArray<ItemNutricional> };

/* ============================================================
 * Adaptador P1 — escolher outra opção (FR-005–FR-009).
 * ============================================================ */

export function previewTrocaOpcao(input: {
  readonly refeicoesDefault: readonly RefeicaoDefault[]; // pro alvo do dia
  readonly diaComEscolha: readonly RefeicaoDia[]; // dia com a opção escolhida
  readonly triggerPosition: number;
  readonly parametros: ParametrosAdaptacao;
}): Result<RebalanceOutcome, RebalanceError> {
  const { refeicoesDefault, diaComEscolha, triggerPosition, parametros } = input;

  const alvo = alvoDoDia(refeicoesDefault);
  const totalAtual = somaNutrientes(diaComEscolha.flatMap((r) => r.itens));

  if (TODOS_DENTRO(avaliarFaixa(totalAtual, alvo, parametros.toleranciaPct))) {
    return ok({ kind: "sem-acao" });
  }

  const deltaKcal = totalAtual.kcal - alvo.kcal;
  const alavancas = diaComEscolha
    .filter((r) => r.position > triggerPosition)
    .flatMap((r) => r.itens.filter(ehAlavanca).map((i) => toAlavanca(i, r.position)));

  return rebalancearPorKcal({
    alavancas,
    deltaKcal,
    pisoPct: parametros.pisoPct,
    totalAtual,
  });
}

/* ============================================================
 * Adaptador P3 — troca de tipo-de-dia (FR-020). Engine-level: sem consumidor
 * no app v0 (FR-021), mas a regra existe e é testada.
 * ============================================================ */

export function previewTrocaTipoDia(input: {
  readonly consumido: Nutrientes; // o que já foi consumido (fonte = registro, fora de escopo v0)
  readonly refeicoesRestantesNovoTipo: readonly RefeicaoDia[];
  readonly refeicoesDefaultNovoTipo: readonly RefeicaoDefault[];
  readonly parametros: ParametrosAdaptacao;
}): Result<RebalanceOutcome, RebalanceError> {
  const {
    consumido,
    refeicoesRestantesNovoTipo,
    refeicoesDefaultNovoTipo,
    parametros,
  } = input;

  const alvoNovo = alvoDoDia(refeicoesDefaultNovoTipo);
  const restantePlanejado = somaNutrientes(
    refeicoesRestantesNovoTipo.flatMap((r) => r.itens),
  );
  const totalProjetado = somaVetores(consumido, restantePlanejado);

  if (
    TODOS_DENTRO(avaliarFaixa(totalProjetado, alvoNovo, parametros.toleranciaPct))
  ) {
    return ok({ kind: "sem-acao" });
  }

  const deltaKcal = totalProjetado.kcal - alvoNovo.kcal;
  const alavancas = refeicoesRestantesNovoTipo.flatMap((r) =>
    r.itens.filter(ehAlavanca).map((i) => toAlavanca(i, r.position)),
  );

  return rebalancearPorKcal({
    alavancas,
    deltaKcal,
    pisoPct: parametros.pisoPct,
    totalAtual: totalProjetado,
  });
}

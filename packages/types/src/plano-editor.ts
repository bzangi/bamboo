// DTOs do editor de plano (Feature 017 — a nutri monta o plano pela tela).
// Tipos puros compartilhados entre a casca (apps/api) e a web da nutri; nenhuma
// dependência de Drizzle/Nest/@bamboo/core aqui.
//
// O grafo do plano tem profundidade FIXA e conhecida (plano → tipo-de-dia →
// refeição → opção → item), e `PlanoDto` o carrega inteiro: a tela do editor faz
// UMA requisição (plan.md/D3, spec/FR-008).

/** Base de equivalência de um grupo: dentro dele a troca PRESERVA este nutriente. */
// `EquivalenceBasis` vive em `substitution.ts` desde a Fase 1 — redeclarar aqui
// quebra o barril (TS2308).
export type { EquivalenceBasis } from "./substitution.js";
import type { EquivalenceBasis } from "./substitution.js";

/* ============ o grafo do plano ============ */

/**
 * Composição por 100 g. É a base do sumário do plano na tela da nutri: kcal,
 * macros, fibra e sódio do dia saem de `gramas/100 × isto`, somado sobre os
 * itens — então o valor tem de vir POR 100 g, não já multiplicado: durante a
 * edição as gramas mudam no navegador e a soma é refeita ali.
 *
 * `fiberPer100g`/`sodiumMgPer100g` são nullable porque a base é assim (alimento
 * cadastrado à mão não os tem). Somar `null` como zero mostraria um total menor
 * do que o real com cara de exato — quem exibe conta quantos itens faltaram.
 */
export interface MacrosPer100gDto {
  readonly kcalPer100g: number;
  readonly carbPer100g: number;
  readonly proteinPer100g: number;
  readonly fatPer100g: number;
  readonly fiberPer100g: number | null;
  readonly sodiumMgPer100g: number | null;
}

/** Item de uma opção. `foodName`/`substitutionGroupName` vêm resolvidos porque
 *  a tela precisa exibir texto, não UUID. */
export interface PlanoItemDto {
  readonly id: string;
  readonly foodId: string;
  readonly foodName: string;
  /** Vale `0` quando `adLibitum` — ver a flag abaixo. */
  readonly quantityGrams: number;
  /** Item SEM quantidade prescrita (018): salada, verduras. `quantityGrams` é
   *  `0` nesses itens, e é esta flag que distingue "0 porque à vontade" de
   *  "0 porque bug" — sem ela o editor não consegue nem exibir nem criar o que
   *  o plano real prescreve em 12 das 30 opções. */
  readonly adLibitum: boolean;
  /** Travado = não troca. Mutuamente exclusivo com `substitutionGroupId`. */
  readonly isLocked: boolean;
  readonly substitutionGroupId: string | null;
  readonly substitutionGroupName: string | null;
  /** Do alimento do item, por 100 g — o insumo do sumário do dia. */
  readonly macros: MacrosPer100gDto;
}

export interface PlanoOpcaoDto {
  readonly id: string;
  readonly label: string;
  /** Exatamente uma opção default por refeição (FR-011). */
  readonly isDefault: boolean;
  readonly items: ReadonlyArray<PlanoItemDto>;
}

export interface PlanoRefeicaoDto {
  readonly id: string;
  readonly name: string;
  /** Único dentro do tipo-de-dia (FR-012): é a chave de pareamento entre
   *  tipos-de-dia usada pela troca de tipo-de-dia (009/012). */
  readonly position: number;
  /** Informativo (HH:MM:SS). Não dirige "o agora". */
  readonly horario: string | null;
  readonly options: ReadonlyArray<PlanoOpcaoDto>;
}

export interface PlanoTipoDiaDto {
  readonly id: string;
  readonly name: string;
  readonly meals: ReadonlyArray<PlanoRefeicaoDto>;
}

/** Um dia da programação default da semana. `weekday`: 0=domingo … 6=sábado. */
export interface PlanoSemanaDiaDto {
  readonly weekday: number;
  readonly dayTypeId: string;
}

/** O plano inteiro. `week` vem vazia enquanto a nutri não programou a semana. */
export interface PlanoDto {
  readonly id: string;
  readonly patientId: string;
  readonly name: string;
  readonly isActive: boolean;
  readonly createdAt: string;
  readonly dayTypes: ReadonlyArray<PlanoTipoDiaDto>;
  readonly week: ReadonlyArray<PlanoSemanaDiaDto>;
}

/** Item da listagem de planos do paciente: sem o grafo, com o tamanho dele. */
export interface PlanoResumoDto {
  readonly id: string;
  readonly name: string;
  readonly isActive: boolean;
  readonly createdAt: string;
  readonly dayTypeCount: number;
  readonly mealCount: number;
  /** Programação da semana completa (7 dias). Plano sem isso não serve ao app. */
  readonly semanaCompleta: boolean;
}

export interface PlanosResponse {
  readonly plans: ReadonlyArray<PlanoResumoDto>;
}

/* ============ catálogo: alimentos e grupos ============ */

export interface FoodDto extends MacrosPer100gDto {
  readonly id: string;
  readonly name: string;
  /** 'taco' = base ingerida (008); qualquer outro = cadastrado à mão. */
  readonly source: string;
  readonly tacoCategory: string | null;
}

export interface FoodsResponse {
  readonly foods: ReadonlyArray<FoodDto>;
  /** Quantos casaram a busca no total — a lista devolvida é truncada por `limit`. */
  readonly total: number;
}

/** Vínculo alimento↔grupo: a "1 troca" do exchange. Sem `referencePortionGrams`
 *  a conta de substituição não existe. */
export interface GrupoFoodDto {
  readonly foodId: string;
  readonly foodName: string;
  readonly referencePortionGrams: number;
  /** 'manual' = curadoria humana (a auto-classificação nunca sobrescreve);
   *  'auto' = palpite da 008. */
  readonly origin: string;
}

export interface GrupoDto {
  readonly id: string;
  readonly name: string;
  readonly basis: EquivalenceBasis;
  /** true = grupo de uma nutri específica; false = grupo do sistema (008). */
  readonly custom: boolean;
  readonly foods: ReadonlyArray<GrupoFoodDto>;
}

export interface GruposResponse {
  readonly groups: ReadonlyArray<GrupoDto>;
}

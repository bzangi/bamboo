// Leitura do grafo do plano (017 / FR-008 / plan.md D3).
//
// UMA requisição devolve o plano inteiro. Quatro `select` (tipos + semana,
// refeições, opções, itens ⋈ food ⋈ grupo) e montagem em memória: o grafo tem
// profundidade FIXA e conhecida (4), e um plano real tem dezenas de nós. CTE
// recursiva aqui seria maquinário para um problema que não existe.
//
// A ordenação é toda no SQL e SEMPRE com desempate por `id` — é a lição do `, id`
// da 012: `ORDER BY` sem desempate devolve a ordem que o heap quiser, e a tela
// pisca entre dois renders.
import { asc, desc, eq, inArray, schema } from '@bamboo/db';
import type {
  PlanoDto,
  PlanoItemDto,
  PlanoOpcaoDto,
  PlanoRefeicaoDto,
  PlanoSemanaDiaDto,
  PlanoTipoDiaDto,
} from '@bamboo/types';
import type { Tx } from './cascata';

/* ═══════════ as linhas cruas (a fronteira com o banco) ═══════════ */

export interface PlanRow {
  readonly id: string;
  readonly patientId: string;
  readonly name: string;
  readonly isActive: boolean;
  readonly createdAt: Date;
}

export interface DayTypeRow {
  readonly id: string;
  readonly name: string;
}

export interface WeekRow {
  readonly weekday: number;
  readonly dayTypeId: string;
}

export interface MealRow {
  readonly id: string;
  readonly dayTypeId: string;
  readonly name: string;
  readonly position: number;
  readonly horario: string | null;
}

export interface OptionRow {
  readonly id: string;
  readonly mealId: string;
  readonly label: string;
  readonly isDefault: boolean;
}

export interface ItemRow {
  readonly id: string;
  readonly mealOptionId: string;
  readonly foodId: string;
  readonly foodName: string;
  readonly quantityGrams: number;
  readonly isLocked: boolean;
  readonly substitutionGroupId: string | null;
  readonly substitutionGroupName: string | null;
}

/* ═══════════ a montagem (função PURA — é o que tem teste unitário) ═══════════ */

/** Agrupa por chave de pai preservando a ordem em que as linhas vieram. */
function porPai<T>(
  rows: ReadonlyArray<T>,
  chave: (r: T) => string,
): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = chave(r);
    const atual = m.get(k);
    if (atual) atual.push(r);
    else m.set(k, [r]);
  }
  return m;
}

export function montarPlano(dados: {
  readonly plan: PlanRow;
  readonly dayTypes: ReadonlyArray<DayTypeRow>;
  readonly week: ReadonlyArray<WeekRow>;
  readonly meals: ReadonlyArray<MealRow>;
  readonly options: ReadonlyArray<OptionRow>;
  readonly items: ReadonlyArray<ItemRow>;
}): PlanoDto {
  const itensPorOpcao = porPai(dados.items, (i) => i.mealOptionId);
  const opcoesPorRefeicao = porPai(dados.options, (o) => o.mealId);
  const refeicoesPorTipo = porPai(dados.meals, (m) => m.dayTypeId);

  const item = (r: ItemRow): PlanoItemDto => ({
    id: r.id,
    foodId: r.foodId,
    foodName: r.foodName,
    quantityGrams: r.quantityGrams,
    isLocked: r.isLocked,
    substitutionGroupId: r.substitutionGroupId,
    substitutionGroupName: r.substitutionGroupName,
  });

  const opcao = (r: OptionRow): PlanoOpcaoDto => ({
    id: r.id,
    label: r.label,
    isDefault: r.isDefault,
    items: (itensPorOpcao.get(r.id) ?? []).map(item),
  });

  const refeicao = (r: MealRow): PlanoRefeicaoDto => ({
    id: r.id,
    name: r.name,
    position: r.position,
    horario: r.horario,
    options: (opcoesPorRefeicao.get(r.id) ?? []).map(opcao),
  });

  const tipoDia = (r: DayTypeRow): PlanoTipoDiaDto => ({
    id: r.id,
    name: r.name,
    meals: (refeicoesPorTipo.get(r.id) ?? []).map(refeicao),
  });

  const week: ReadonlyArray<PlanoSemanaDiaDto> = dados.week.map((w) => ({
    weekday: w.weekday,
    dayTypeId: w.dayTypeId,
  }));

  return {
    id: dados.plan.id,
    patientId: dados.plan.patientId,
    name: dados.plan.name,
    isActive: dados.plan.isActive,
    createdAt: dados.plan.createdAt.toISOString(),
    dayTypes: dados.dayTypes.map(tipoDia),
    week,
  };
}

/* ═══════════ as queries (a casca) ═══════════ */

/** `null` = plano não existe. Quem chama traduz para 404. */
export async function carregarPlano(
  tx: Tx,
  planId: string,
): Promise<PlanoDto | null> {
  const [plan] = await tx
    .select({
      id: schema.plan.id,
      patientId: schema.plan.patientId,
      name: schema.plan.name,
      isActive: schema.plan.isActive,
      createdAt: schema.plan.createdAt,
    })
    .from(schema.plan)
    .where(eq(schema.plan.id, planId))
    .limit(1);

  if (!plan) return null;

  const dayTypes = await tx
    .select({ id: schema.dayType.id, name: schema.dayType.name })
    .from(schema.dayType)
    .where(eq(schema.dayType.planId, planId))
    .orderBy(asc(schema.dayType.name), asc(schema.dayType.id));

  const week = await tx
    .select({
      weekday: schema.daySchedule.weekday,
      dayTypeId: schema.daySchedule.dayTypeId,
    })
    .from(schema.daySchedule)
    .where(eq(schema.daySchedule.planId, planId))
    .orderBy(asc(schema.daySchedule.weekday));

  const dayTypeIds = dayTypes.map((d) => d.id);
  if (dayTypeIds.length === 0) {
    return montarPlano({
      plan,
      dayTypes,
      week,
      meals: [],
      options: [],
      items: [],
    });
  }

  const meals = await tx
    .select({
      id: schema.meal.id,
      dayTypeId: schema.meal.dayTypeId,
      name: schema.meal.name,
      position: schema.meal.position,
      horario: schema.meal.horario,
    })
    .from(schema.meal)
    .where(inArray(schema.meal.dayTypeId, dayTypeIds))
    .orderBy(asc(schema.meal.position), asc(schema.meal.id));

  const mealIds = meals.map((m) => m.id);
  if (mealIds.length === 0) {
    return montarPlano({
      plan,
      dayTypes,
      week,
      meals,
      options: [],
      items: [],
    });
  }

  const options = await tx
    .select({
      id: schema.mealOption.id,
      mealId: schema.mealOption.mealId,
      label: schema.mealOption.label,
      isDefault: schema.mealOption.isDefault,
    })
    .from(schema.mealOption)
    .where(inArray(schema.mealOption.mealId, mealIds))
    // A default primeiro: é a que o app mostra, então é a que a nutri lê primeiro.
    .orderBy(
      desc(schema.mealOption.isDefault),
      asc(schema.mealOption.label),
      asc(schema.mealOption.id),
    );

  const optionIds = options.map((o) => o.id);
  if (optionIds.length === 0) {
    return montarPlano({ plan, dayTypes, week, meals, options, items: [] });
  }

  const items = await tx
    .select({
      id: schema.mealItem.id,
      mealOptionId: schema.mealItem.mealOptionId,
      foodId: schema.mealItem.foodId,
      foodName: schema.food.name,
      quantityGrams: schema.mealItem.quantityGrams,
      isLocked: schema.mealItem.isLocked,
      substitutionGroupId: schema.mealItem.substitutionGroupId,
      substitutionGroupName: schema.substitutionGroup.name,
    })
    .from(schema.mealItem)
    .innerJoin(schema.food, eq(schema.food.id, schema.mealItem.foodId))
    .leftJoin(
      schema.substitutionGroup,
      eq(schema.substitutionGroup.id, schema.mealItem.substitutionGroupId),
    )
    .where(inArray(schema.mealItem.mealOptionId, optionIds))
    .orderBy(asc(schema.food.name), asc(schema.mealItem.id));

  return montarPlano({ plan, dayTypes, week, meals, options, items });
}

/* ═══════════ subir o grafo: de um nó qualquer até o plano ═══════════ */
//
// Toda escrita responde com o nó já na forma do grafo, e a forma tem UMA fonte:
// `carregarPlano`. Então o service resolve o `planId` do nó (uma query), relê o
// plano e acha o nó. Custa 5 leituras por escrita — e escrita no editor é rara,
// enquanto duas maneiras de montar a mesma resposta é uma divergência garantida.

export async function planIdDaRefeicao(
  tx: Tx,
  mealId: string,
): Promise<string | null> {
  const [r] = await tx
    .select({ planId: schema.dayType.planId })
    .from(schema.meal)
    .innerJoin(schema.dayType, eq(schema.dayType.id, schema.meal.dayTypeId))
    .where(eq(schema.meal.id, mealId))
    .limit(1);
  return r?.planId ?? null;
}

export async function planIdDaOpcao(
  tx: Tx,
  optionId: string,
): Promise<string | null> {
  const [r] = await tx
    .select({ planId: schema.dayType.planId })
    .from(schema.mealOption)
    .innerJoin(schema.meal, eq(schema.meal.id, schema.mealOption.mealId))
    .innerJoin(schema.dayType, eq(schema.dayType.id, schema.meal.dayTypeId))
    .where(eq(schema.mealOption.id, optionId))
    .limit(1);
  return r?.planId ?? null;
}

export async function planIdDoItem(
  tx: Tx,
  itemId: string,
): Promise<string | null> {
  const [r] = await tx
    .select({ planId: schema.dayType.planId })
    .from(schema.mealItem)
    .innerJoin(
      schema.mealOption,
      eq(schema.mealOption.id, schema.mealItem.mealOptionId),
    )
    .innerJoin(schema.meal, eq(schema.meal.id, schema.mealOption.mealId))
    .innerJoin(schema.dayType, eq(schema.dayType.id, schema.meal.dayTypeId))
    .where(eq(schema.mealItem.id, itemId))
    .limit(1);
  return r?.planId ?? null;
}

/* ═══════════ achar o nó no grafo carregado (puro) ═══════════ */

const refeicoes = (p: PlanoDto): ReadonlyArray<PlanoRefeicaoDto> =>
  p.dayTypes.flatMap((d) => d.meals);

export const acharRefeicao = (
  p: PlanoDto,
  mealId: string,
): PlanoRefeicaoDto | undefined => refeicoes(p).find((m) => m.id === mealId);

export const acharOpcao = (
  p: PlanoDto,
  optionId: string,
): PlanoOpcaoDto | undefined =>
  refeicoes(p)
    .flatMap((m) => m.options)
    .find((o) => o.id === optionId);

export const acharItem = (
  p: PlanoDto,
  itemId: string,
): PlanoItemDto | undefined =>
  refeicoes(p)
    .flatMap((m) => m.options)
    .flatMap((o) => o.items)
    .find((i) => i.id === itemId);

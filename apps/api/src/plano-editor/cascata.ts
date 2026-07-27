// Exclusão no grafo do plano (017 / FR-005).
//
// A REGRA, em uma frase: **cascata para baixo, 409 para os lados**. Apaga o que
// só existe por causa do nó; recusa quando outro agregado aponta para ele.
//
// `meal_event` e `meal_event_item` NUNCA entram numa cascata. Registro é dado de
// saúde do paciente, não detalhe do plano — o plano pode ser reescrito, o que
// aconteceu no dia não. É o que o R2 da spec mitiga, e o que os testes de 409
// travam.
//
// A ordem de FK aqui é a mesma que o `buildScenario.destroy()` (013) já prova
// funcionar nos dois sentidos; este arquivo é o lado da casca dela.
import { ConflictException } from '@nestjs/common';
import { eq, inArray, schema } from '@bamboo/db';
import type { Db } from '../db/db.module';

/** O executor: `db` ou a transação. Toda função aqui aceita os dois. */
export type Tx = Db | Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * `inArray` com lista vazia não é uma pergunta que valha uma ida ao banco (e em
 * versões do Drizzle já gerou SQL inválido). Um guard, usado por tudo abaixo.
 */
const vazio = (ids: ReadonlyArray<string>): boolean => ids.length === 0;

/* ═══════════ coleta: os ids atingidos por baixo ═══════════ */

export async function dayTypeIdsDosPlanos(
  tx: Tx,
  planIds: ReadonlyArray<string>,
): Promise<string[]> {
  if (vazio(planIds)) return [];
  const rows = await tx
    .select({ id: schema.dayType.id })
    .from(schema.dayType)
    .where(inArray(schema.dayType.planId, planIds));
  return rows.map((r) => r.id);
}

export async function mealIdsDosTipos(
  tx: Tx,
  dayTypeIds: ReadonlyArray<string>,
): Promise<string[]> {
  if (vazio(dayTypeIds)) return [];
  const rows = await tx
    .select({ id: schema.meal.id })
    .from(schema.meal)
    .where(inArray(schema.meal.dayTypeId, dayTypeIds));
  return rows.map((r) => r.id);
}

export async function optionIdsDasRefeicoes(
  tx: Tx,
  mealIds: ReadonlyArray<string>,
): Promise<string[]> {
  if (vazio(mealIds)) return [];
  const rows = await tx
    .select({ id: schema.mealOption.id })
    .from(schema.mealOption)
    .where(inArray(schema.mealOption.mealId, mealIds));
  return rows.map((r) => r.id);
}

/* ═══════════ bloqueadores: 409 para os lados ═══════════ */

/** Existe registro em alguma destas refeições? Bloqueia meal/day_type/plan. */
export async function temRegistroNasRefeicoes(
  tx: Tx,
  mealIds: ReadonlyArray<string>,
): Promise<boolean> {
  if (vazio(mealIds)) return false;
  const [achou] = await tx
    .select({ id: schema.mealEvent.id })
    .from(schema.mealEvent)
    .where(inArray(schema.mealEvent.mealId, mealIds))
    .limit(1);
  return achou !== undefined;
}

/**
 * Recusa com uma frase que diz **o que** bloqueou e **o que fazer**. A tela
 * mostra `message` cru, então ela precisa ser legível por gente.
 */
export function recusar(motivo: string): never {
  throw new ConflictException(motivo);
}

/* ═══════════ apagar: para baixo, em ordem reversa de FK ═══════════ */

/**
 * Apaga tudo ABAIXO das opções dadas (só os itens).
 * Nota: `meal_event_item` aponta para `food`, não para `meal_item` — apagar um
 * item de plano não toca em nada de registro.
 */
async function apagarItens(tx: Tx, optionIds: ReadonlyArray<string>) {
  if (vazio(optionIds)) return;
  await tx
    .delete(schema.mealItem)
    .where(inArray(schema.mealItem.mealOptionId, optionIds));
}

/** Opções + itens. */
export async function apagarOpcoes(tx: Tx, optionIds: ReadonlyArray<string>) {
  if (vazio(optionIds)) return;
  await apagarItens(tx, optionIds);
  await tx
    .delete(schema.mealOption)
    .where(inArray(schema.mealOption.id, optionIds));
}

/** Refeições + opções + itens. NÃO checa registro — quem chama checa. */
export async function apagarRefeicoes(tx: Tx, mealIds: ReadonlyArray<string>) {
  if (vazio(mealIds)) return;
  await apagarOpcoes(tx, await optionIdsDasRefeicoes(tx, mealIds));
  await tx.delete(schema.meal).where(inArray(schema.meal.id, mealIds));
}

/** Tipos-de-dia + refeições + opções + itens. */
export async function apagarTiposDeDia(
  tx: Tx,
  dayTypeIds: ReadonlyArray<string>,
) {
  if (vazio(dayTypeIds)) return;
  await apagarRefeicoes(tx, await mealIdsDosTipos(tx, dayTypeIds));
  await tx.delete(schema.dayType).where(inArray(schema.dayType.id, dayTypeIds));
}

/**
 * O grafo inteiro dos planos dados — inclusive `day_schedule`, que referencia
 * plano E tipo-de-dia e por isso sai ANTES dos tipos. NÃO apaga a linha de
 * `plan` nem checa bloqueadores: quem chama decide, porque os bloqueadores de
 * "excluir plano" e de "excluir paciente" são diferentes.
 */
export async function apagarGrafoDosPlanos(
  tx: Tx,
  planIds: ReadonlyArray<string>,
) {
  if (vazio(planIds)) return;
  const dayTypeIds = await dayTypeIdsDosPlanos(tx, planIds);
  await tx
    .delete(schema.daySchedule)
    .where(inArray(schema.daySchedule.planId, planIds));
  await apagarTiposDeDia(tx, dayTypeIds);
}

/** Ciclos do paciente + as vigências que penduram neles. */
export async function apagarCiclosDoPaciente(tx: Tx, patientId: string) {
  const ciclos = await tx
    .select({ id: schema.cycle.id })
    .from(schema.cycle)
    .where(eq(schema.cycle.patientId, patientId));
  const ids = ciclos.map((c) => c.id);
  if (!vazio(ids)) {
    await tx
      .delete(schema.cyclePlanVigencia)
      .where(inArray(schema.cyclePlanVigencia.cycleId, ids));
  }
  await tx.delete(schema.cycle).where(eq(schema.cycle.patientId, patientId));
}

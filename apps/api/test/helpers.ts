// Helpers compartilhados das suítes e2e. O isolamento de estado do DIA é o que
// torna as suítes idempotentes: elas compartilham o paciente semeado e a data
// de hoje, então quem registra meal_event PRECISA limpar os eventos do dia no
// beforeAll — senão resíduo de uma rodada/suíte anterior vaza e quebra
// asserções de "estado inicial" (flakiness dependente de ordem/execução).
import { and, asc, db, eq, inArray, schema } from '@bamboo/db';

// Data-calendário local do servidor "YYYY-MM-DD" — MESMA fonte do service
// (local-date.localToday) e do registro. Não usar UTC (divergiria na virada).
export const localTodayStr = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Remove TODOS os meal_event (+ filhas) de HOJE do paciente+plano (filhas → pais
// por FK). Chame no beforeAll de qualquer suíte que registre/leia consumo do dia.
export async function limparEventosDeHoje(
  patientId: string,
  planId: string,
): Promise<void> {
  const loggedDate = localTodayStr();
  const eventos = await db
    .select({ id: schema.mealEvent.id })
    .from(schema.mealEvent)
    .where(
      and(
        eq(schema.mealEvent.patientId, patientId),
        eq(schema.mealEvent.planId, planId),
        eq(schema.mealEvent.loggedDate, loggedDate),
      ),
    );
  const ids = eventos.map((e) => e.id);
  if (ids.length === 0) return;
  await db
    .delete(schema.mealEventItem)
    .where(inArray(schema.mealEventItem.mealEventId, ids));
  await db.delete(schema.mealEvent).where(inArray(schema.mealEvent.id, ids));
}

/**
 * O paciente do SEED — nunca "um paciente qualquer".
 *
 * Antes da 016 as suítes faziam `select().from(patient).limit(1)` sem `where` e
 * dava certo por sorte: só existia o paciente semeado. Com o cadastro pela tela,
 * qualquer paciente criado à mão (sem plano) passou a poder ser sorteado, e a
 * suíte quebra num `undefined` a 6 frames de distância da causa. É o risco que a
 * 013 catalogou como I-3 e que agora é real.
 *
 * Determinístico: escolhe o paciente que TEM plano ativo, com `ORDER BY`
 * explícito; e lança com mensagem se não houver nenhum (banco sem seed).
 */
export async function pacienteSemeado(): Promise<{
  readonly id: string;
  readonly name: string;
  readonly nutritionistId: string;
  readonly exposure: (typeof schema.patient.$inferSelect)['exposure'];
  readonly bandTolerancePct: number | null;
  readonly floorPct: number | null;
  readonly planId: string;
}> {
  const [row] = await db
    // Campos listados um a um (e não `getTableColumns`): os operadores do Drizzle
    // entram pelo re-export de `@bamboo/db` por causa da divergência de tipos
    // ESM/CJS, e não vale acrescentar mais um só para encurtar isto.
    .select({
      id: schema.patient.id,
      name: schema.patient.name,
      nutritionistId: schema.patient.nutritionistId,
      exposure: schema.patient.exposure,
      bandTolerancePct: schema.patient.bandTolerancePct,
      floorPct: schema.patient.floorPct,
      planId: schema.plan.id,
    })
    .from(schema.patient)
    .innerJoin(schema.plan, eq(schema.plan.patientId, schema.patient.id))
    .where(eq(schema.plan.isActive, true))
    .orderBy(asc(schema.patient.createdAt), asc(schema.patient.id))
    .limit(1);

  if (!row) {
    throw new Error(
      'nenhum paciente com plano ativo no banco — rode o seed (packages/db/scripts/seed.ts) antes das suítes e2e',
    );
  }
  return row;
}

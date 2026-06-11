// Helpers compartilhados das suítes e2e. O isolamento de estado do DIA é o que
// torna as suítes idempotentes: elas compartilham o paciente semeado e a data
// de hoje, então quem registra meal_event PRECISA limpar os eventos do dia no
// beforeAll — senão resíduo de uma rodada/suíte anterior vaza e quebra
// asserções de "estado inicial" (flakiness dependente de ordem/execução).
import { and, db, eq, inArray, schema } from '@bamboo/db';

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

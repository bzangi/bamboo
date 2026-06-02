// Data-calendário local do servidor em "YYYY-MM-DD", da MESMA fonte (new Date())
// que resolve o weekday do dia corrente. Usada tanto para gravar
// meal_event.logged_date (registro) quanto para filtrá-lo no /today — as DUAS
// pontas DEVEM usar esta função para não divergirem na virada de meia-noite.
//
// Dívida de timezone (consciente, v0): usa o relógio do servidor, não o fuso do
// paciente. Fix nomeado: derivar o tz do perfil do paciente quando existir.
export function localToday(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

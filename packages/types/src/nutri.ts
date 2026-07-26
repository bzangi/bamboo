// DTOs do contrato GET /nutri/patients (Feature 015 — visão da nutri). Tipos
// puros compartilhados entre a casca (apps/api) e a web da nutri (apps/web);
// nenhuma dependência de Drizzle/Nest/@bamboo/core aqui.
//
// Minimização de dado (LGPD / FR-004): a listagem carrega nome e o ciclo atual.
// E-mail, telefone, peso e altura NÃO entram — a tela não os usa.

/** O ciclo que a nutri quer ler: o aberto; se não houver, o fechado mais
 *  recente (D2). `null` no paciente que nunca teve ciclo. */
export interface CicloAtualDto {
  readonly id: string;
  readonly startedOn: string; // YYYY-MM-DD
  readonly closedOn: string | null; // null = aberto
  readonly expectedDurationDays: number;
  readonly aberto: boolean;
}

export interface NutriPatientDto {
  readonly id: string;
  readonly name: string;
  readonly cicloAtual: CicloAtualDto | null;
}

export interface NutriPatientsResponse {
  readonly patients: ReadonlyArray<NutriPatientDto>;
}

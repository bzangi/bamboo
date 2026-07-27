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

// `ExposureLevel` vive em `today.ts` desde a Fase 1 — reexportado aqui para quem
// importa o módulo direto. Redeclarar quebra o barril (TS2308).
export type { ExposureLevel } from "./today.js";
import type { ExposureLevel } from "./today.js";

/** A ficha de UM paciente (Feature 017): o que o formulário de edição precisa
 *  preencher. A minimização da 015 vale para a LISTAGEM; a ficha do paciente que
 *  a nutri está editando é justamente o dado que ela mantém.
 *
 *  Sem `cicloAtual` de propósito: a regra de "qual ciclo mostrar" (015/D2) mora
 *  na roster e em nenhum outro lugar. */
export interface NutriPatientDetalheDto {
  readonly id: string;
  readonly name: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly heightCm: number | null;
  readonly weightKg: number | null;
  readonly exposure: ExposureLevel;
}

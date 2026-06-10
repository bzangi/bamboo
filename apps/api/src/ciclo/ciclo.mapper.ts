// Mapper puro dos DTOs de ciclo (contracts/http-ciclo.md). Nunca serializa
// entidade do Drizzle. Única superfície que expõe ciclo é a via /nutri.
import type { EstadoRegistro } from '@bamboo/core';

export interface VigenciaDto {
  readonly planId: string;
  readonly validFrom: string;
  readonly validTo: string | null;
}

export interface CicloDto {
  readonly id: string;
  readonly startedOn: string;
  readonly expectedDurationDays: number;
  readonly closedOn: string | null;
  readonly ativo: boolean;
  readonly vigencias: readonly VigenciaDto[];
}

export interface AberturaResponse extends Omit<CicloDto, 'ativo'> {
  readonly fechouAnterior: {
    readonly id: string;
    readonly closedOn: string;
  } | null;
}

export type FechamentoResponse =
  | CicloDto
  | { readonly kind: 'no-op-orientado'; readonly motivo: 'sem-ciclo-ativo' };

export interface RegistroDoPeriodoDto {
  readonly date: string;
  readonly mealId: string;
  readonly position: number;
  readonly state: EstadoRegistro;
}

export interface CicloDetalheResponse extends CicloDto {
  readonly registros: readonly RegistroDoPeriodoDto[];
}

export interface AtribuicaoResponse {
  readonly date: string;
  readonly cycleId: string | null;
}

interface CicloRow {
  readonly id: string;
  readonly startedOn: string;
  readonly expectedDurationDays: number;
  readonly closedOn: string | null;
}

export const toVigenciaDto = (v: {
  readonly planId: string;
  readonly validFrom: string;
  readonly validTo: string | null;
}): VigenciaDto => ({
  planId: v.planId,
  validFrom: v.validFrom,
  validTo: v.validTo,
});

export const toCicloDto = (
  c: CicloRow,
  vigencias: readonly VigenciaDto[],
): CicloDto => ({
  id: c.id,
  startedOn: c.startedOn,
  expectedDurationDays: c.expectedDurationDays,
  closedOn: c.closedOn,
  ativo: c.closedOn === null,
  vigencias,
});

export const toAberturaResponse = (
  c: CicloRow,
  vigencias: readonly VigenciaDto[],
  fechouAnterior: { readonly id: string; readonly closedOn: string } | null,
): AberturaResponse => ({
  id: c.id,
  startedOn: c.startedOn,
  expectedDurationDays: c.expectedDurationDays,
  closedOn: c.closedOn,
  vigencias,
  fechouAnterior,
});

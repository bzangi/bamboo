// Mapper puro do response da adesão (contracts/http-adesao.md). Nunca
// serializa entidade do Drizzle — recebe valores do núcleo e monta o DTO.
// É a ÚNICA superfície do sistema que serializa adesão (FR-013/FR-016).
import type { AdesaoDia, AdesaoFlags } from '@bamboo/core';

export interface AdesaoDiaDto {
  readonly date: string; // YYYY-MM-DD
  readonly status: 'com-dado' | 'sem-dado';
  readonly valorPct?: number;
  readonly dentroFaixa?: boolean;
  readonly flags?: AdesaoFlags;
  readonly cobertura?: number;
}

export interface SerieAdesaoResponse {
  readonly patientId: string;
  readonly from: string;
  readonly to: string;
  readonly days: readonly AdesaoDiaDto[];
  readonly media: number | null; // média aritmética dos com-dado; null se nenhum
}

export const diaComDado = (date: string, adesao: AdesaoDia): AdesaoDiaDto => ({
  date,
  status: 'com-dado',
  valorPct: adesao.valorPct,
  dentroFaixa: adesao.dentroFaixa,
  flags: adesao.flags,
  cobertura: adesao.cobertura,
});

export const diaSemDado = (date: string): AdesaoDiaDto => ({
  date,
  status: 'sem-dado', // nunca 0% (SC-006)
});

export const toSerieAdesaoResponse = (args: {
  readonly patientId: string;
  readonly from: string;
  readonly to: string;
  readonly days: readonly AdesaoDiaDto[];
  readonly media: number | null;
}): SerieAdesaoResponse => ({
  patientId: args.patientId,
  from: args.from,
  to: args.to,
  days: args.days,
  media: args.media,
});

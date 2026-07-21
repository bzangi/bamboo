// Mapper puro do response do relatório (contracts/http-relatorio.md). Nunca
// serializa entidade Drizzle nem os tipos internos do core direto — monta o
// DTO compartilhado (packages/types) campo a campo.
import type {
  AdesaoAgregada as CoreAdesaoAgregada,
  DeltasComparativo,
  RegistroAgregado as CoreRegistroAgregado,
  RegistroTotais as CoreRegistroTotais,
  SemanaSlice,
} from '@bamboo/core';
import type {
  AdesaoAgregadaDto,
  ComparativoDto,
  CycleReportResponse,
  CycleWindowDto,
  RegistroAgregadoDto,
  RegistroTotaisDto,
  SemanaDoCicloDto,
} from '@bamboo/types';

export const toAdesaoAgregadaDto = (
  a: CoreAdesaoAgregada,
): AdesaoAgregadaDto => ({
  media: a.media,
  diasComDado: a.diasComDado,
  diasSemDado: a.diasSemDado,
  coberturaMedia: a.coberturaMedia,
  diasDentroFaixa: a.diasDentroFaixa,
  flagsFrequencia: a.flagsFrequencia,
});

export const toRegistroTotaisDto = (
  t: CoreRegistroTotais,
): RegistroTotaisDto => ({
  feito: t.feito,
  troquei: t.troquei,
  pulei: t.pulei,
  semRegistro: t.semRegistro,
});

export const toRegistroAgregadoDto = (
  r: CoreRegistroAgregado,
): RegistroAgregadoDto => ({
  totais: toRegistroTotaisDto(r.totais),
  porRefeicao: r.porRefeicao.map((p) => ({
    position: p.position,
    nome: p.nome,
    feito: p.feito,
    troquei: p.troquei,
    pulei: p.pulei,
    semRegistro: p.semRegistro,
  })),
});

export const toCycleWindowDto = (c: {
  readonly id: string;
  readonly startedOn: string;
  readonly closedOn: string | null;
  readonly expectedDurationDays: number;
  readonly from: string;
  readonly to: string;
}): CycleWindowDto => ({
  id: c.id,
  startedOn: c.startedOn,
  closedOn: c.closedOn,
  expectedDurationDays: c.expectedDurationDays,
  aberto: c.closedOn === null,
  janelaEfetiva: { from: c.from, to: c.to },
});

export const toSemanaDto = (
  s: SemanaSlice,
  adesao: CoreAdesaoAgregada,
  registroTotais: CoreRegistroTotais,
): SemanaDoCicloDto => ({
  indice: s.indice,
  from: s.from,
  to: s.to,
  parcial: s.parcial,
  adesao: toAdesaoAgregadaDto(adesao),
  registro: toRegistroTotaisDto(registroTotais),
});

export const toComparativoDto = (args: {
  readonly cicloAnterior: {
    readonly id: string;
    readonly startedOn: string;
    readonly closedOn: string;
  };
  readonly adesaoAnterior: CoreAdesaoAgregada;
  readonly registroTotaisAnterior: CoreRegistroTotais;
  readonly deltas: DeltasComparativo;
}): ComparativoDto => ({
  cicloAnterior: {
    id: args.cicloAnterior.id,
    startedOn: args.cicloAnterior.startedOn,
    closedOn: args.cicloAnterior.closedOn,
    adesao: toAdesaoAgregadaDto(args.adesaoAnterior),
    registroTotais: toRegistroTotaisDto(args.registroTotaisAnterior),
  },
  deltas: args.deltas,
});

export const toCycleReportResponse = (args: {
  readonly cycle: CycleWindowDto;
  readonly adesao: CoreAdesaoAgregada;
  readonly registro: CoreRegistroAgregado;
  readonly semanas: ReadonlyArray<SemanaDoCicloDto>;
  readonly comparativo: ComparativoDto | null;
}): CycleReportResponse => ({
  cycle: args.cycle,
  adesao: toAdesaoAgregadaDto(args.adesao),
  registro: toRegistroAgregadoDto(args.registro),
  semanas: args.semanas,
  comparativo: args.comparativo,
});

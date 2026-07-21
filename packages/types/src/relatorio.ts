// DTOs do contrato GET /nutri/patients/:patientId/cycles/:cycleId/report
// (Feature 011 — relatório de ciclo). Tipos puros compartilhados entre a
// casca (apps/api) e futuros clientes (web da nutri, EP-6); nenhuma
// dependência de Drizzle/Nest/@bamboo/core aqui. Ver contracts/http-relatorio.md.

export interface FlagsFrequenciaDto {
  readonly carb?: { readonly acima?: number; readonly abaixo?: number };
  readonly protein?: { readonly acima?: number; readonly abaixo?: number };
  readonly fat?: { readonly acima?: number; readonly abaixo?: number };
}

export interface AdesaoAgregadaDto {
  readonly media: number | null; // média dos dias com-dado; null se nenhum
  readonly diasComDado: number;
  readonly diasSemDado: number;
  readonly coberturaMedia: number | null;
  readonly diasDentroFaixa: number;
  readonly flagsFrequencia: FlagsFrequenciaDto;
}

export interface RegistroTotaisDto {
  readonly feito: number;
  readonly troquei: number;
  readonly pulei: number;
  readonly semRegistro: number;
}

export interface RegistroPorRefeicaoDto extends RegistroTotaisDto {
  readonly position: number;
  readonly nome: string;
}

export interface RegistroAgregadoDto {
  readonly totais: RegistroTotaisDto;
  readonly porRefeicao: ReadonlyArray<RegistroPorRefeicaoDto>;
}

export interface SemanaDoCicloDto {
  readonly indice: number; // 1-based, relativa ao início do ciclo (A1)
  readonly from: string; // YYYY-MM-DD
  readonly to: string; // YYYY-MM-DD (inclusive)
  readonly parcial: boolean; // fatia < 7 dias
  readonly adesao: AdesaoAgregadaDto;
  readonly registro: RegistroTotaisDto; // só totais — sem quebra por refeição na semana
}

export interface DeltasComparativoDto {
  readonly media: number | null;
  readonly coberturaMedia: number | null;
  readonly taxaFeito: number | null;
  readonly taxaTroquei: number | null;
  readonly taxaPulei: number | null;
}

export interface CicloAnteriorDto {
  readonly id: string;
  readonly startedOn: string;
  readonly closedOn: string;
  readonly adesao: AdesaoAgregadaDto;
  readonly registroTotais: RegistroTotaisDto;
}

export interface ComparativoDto {
  readonly cicloAnterior: CicloAnteriorDto;
  readonly deltas: DeltasComparativoDto;
}

export interface CycleWindowDto {
  readonly id: string;
  readonly startedOn: string;
  readonly closedOn: string | null; // null = ciclo aberto
  readonly expectedDurationDays: number;
  readonly aberto: boolean;
  readonly janelaEfetiva: { readonly from: string; readonly to: string }; // aberto: to = hoje (A2)
}

export interface CycleReportResponse {
  readonly cycle: CycleWindowDto;
  readonly adesao: AdesaoAgregadaDto; // do ciclo inteiro
  readonly registro: RegistroAgregadoDto; // do ciclo inteiro (com quebra por refeição)
  readonly semanas: ReadonlyArray<SemanaDoCicloDto>; // ordem cronológica (A1)
  readonly comparativo: ComparativoDto | null; // null = sem ciclo anterior (A3)
}

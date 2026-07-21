// relatorio.ts — agregações puras do relatório de ciclo (Feature 011).
// Composição, nenhuma régua nova: reusa mediaAdesao (006) pra média do ciclo;
// a fórmula de adesão em si (adesaoDoDia) não é chamada aqui — o service
// consome a série já pronta de AdesaoService.serie() (FR-003/FR-009/D4).
// Pura: sem I/O, sem throw, sem mutação, sem Date.now — janelas e "hoje"
// entram por parâmetro (string YYYY-MM-DD) resolvidos pela casca.
// Ver contracts/http-relatorio.md e research.md D1–D9.

import type { AdesaoFlags } from "./adesao.js";
import { mediaAdesao } from "./adesao.js";
import type { EstadoRegistro } from "./registro.js";
import { type Result, err, ok } from "./result.js";

/* ============ fatiarSemanas (D1/A1) ============ */

export type RelatorioError = { readonly kind: "janela-invalida" };

export interface SemanaSlice {
  readonly indice: number; // 1-based
  readonly from: string; // YYYY-MM-DD
  readonly to: string; // YYYY-MM-DD (inclusive)
  readonly parcial: boolean; // fatia < 7 dias
}

const parseISO = (iso: string): Date => {
  const partes = iso.split("-");
  const y = Number(partes[0]);
  const m = Number(partes[1]);
  const d = Number(partes[2]);
  return new Date(y, m - 1, d);
};

const toISO = (d: Date): string => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const addDias = (d: Date, n: number): Date => {
  const copia = new Date(d);
  copia.setDate(copia.getDate() + n);
  return copia;
};

/**
 * Semana N do ciclo = dias [início + 7(N−1), início + 7N) — relativa ao
 * startedOn, nunca semana-calendário (D1). Última fatia pode ter < 7 dias
 * (marcada parcial). Aritmética por incremento de calendário (setDate), sem
 * diff de milissegundos — seguro em virada de mês/ano e DST.
 */
export function fatiarSemanas(
  startedOn: string,
  fimEfetivo: string,
): Result<ReadonlyArray<SemanaSlice>, RelatorioError> {
  if (fimEfetivo < startedOn) return err({ kind: "janela-invalida" });

  const slices: SemanaSlice[] = [];
  let cursor = parseISO(startedOn);
  let indice = 1;
  while (toISO(cursor) <= fimEfetivo) {
    const from = toISO(cursor);
    let fimFatia = cursor;
    let dias = 1;
    while (dias < 7) {
      const proximo = addDias(fimFatia, 1);
      if (toISO(proximo) > fimEfetivo) break;
      fimFatia = proximo;
      dias++;
    }
    slices.push({ indice, from, to: toISO(fimFatia), parcial: dias < 7 });
    indice++;
    cursor = addDias(fimFatia, 1);
  }
  return ok(slices);
}

/* ============ agregarAdesao ============ */

export interface DiaAdesaoEntrada {
  readonly status: "com-dado" | "sem-dado";
  readonly valorPct?: number;
  readonly dentroFaixa?: boolean;
  readonly flags?: AdesaoFlags;
  readonly cobertura?: number;
}

export interface AdesaoAgregada {
  readonly media: number | null; // média dos dias com-dado (régua da 006); null se nenhum
  readonly diasComDado: number;
  readonly diasSemDado: number;
  readonly coberturaMedia: number | null;
  readonly diasDentroFaixa: number; // entre os com-dado
  readonly flagsFrequencia: {
    readonly carb?: { readonly acima?: number; readonly abaixo?: number };
    readonly protein?: { readonly acima?: number; readonly abaixo?: number };
    readonly fat?: { readonly acima?: number; readonly abaixo?: number };
  };
}

const MACROS = ["carb", "protein", "fat"] as const;

const contarFlags = (
  comDado: ReadonlyArray<DiaAdesaoEntrada>,
): AdesaoAgregada["flagsFrequencia"] => {
  const resultado: Record<string, { acima?: number; abaixo?: number }> = {};
  for (const macro of MACROS) {
    let acima = 0;
    let abaixo = 0;
    for (const dia of comDado) {
      const lado = dia.flags?.[macro];
      if (lado === "acima") acima++;
      else if (lado === "abaixo") abaixo++;
    }
    if (acima > 0 || abaixo > 0) {
      resultado[macro] = {
        ...(acima > 0 ? { acima } : {}),
        ...(abaixo > 0 ? { abaixo } : {}),
      };
    }
  }
  return resultado;
};

/**
 * Agrega uma janela de dias de adesão (ciclo inteiro ou semana) — recebe os
 * dias JÁ RESOLVIDOS pela casca via AdesaoService.serie() (uma régua só,
 * FR-003/FR-009). Dias sem-dado nunca diluem média/cobertura (nunca 0%).
 */
export function agregarAdesao(
  dias: ReadonlyArray<DiaAdesaoEntrada>,
): AdesaoAgregada {
  const comDado = dias.filter((d) => d.status === "com-dado");
  const media = mediaAdesao(comDado.map((d) => d.valorPct as number));
  const coberturaMedia =
    comDado.length === 0
      ? null
      : comDado.reduce((soma, d) => soma + (d.cobertura as number), 0) /
        comDado.length;
  const diasDentroFaixa = comDado.filter((d) => d.dentroFaixa === true).length;

  return {
    media,
    diasComDado: comDado.length,
    diasSemDado: dias.length - comDado.length,
    coberturaMedia,
    diasDentroFaixa,
    flagsFrequencia: contarFlags(comDado),
  };
}

/* ============ agregarEstados (D9) ============ */

export interface SlotRegistro {
  readonly position: number;
  readonly nome: string;
  readonly state: EstadoRegistro | null; // null = sem-registro (esperado, sem vigente — D9)
}

export interface RegistroTotais {
  readonly feito: number;
  readonly troquei: number;
  readonly pulei: number;
  readonly semRegistro: number;
}

export interface RegistroPorRefeicao extends RegistroTotais {
  readonly position: number;
  readonly nome: string;
}

export interface RegistroAgregado {
  readonly totais: RegistroTotais;
  readonly porRefeicao: ReadonlyArray<RegistroPorRefeicao>;
}

/**
 * Padrão de registro de uma janela: cada slot é uma refeição ESPERADA num
 * dia; state null = sem-registro (nunca registrada OU anulada — D9, sem
 * distinção no v0). Nome por position: melhor esforço — mantém o 1º visto.
 */
export function agregarEstados(
  slots: ReadonlyArray<SlotRegistro>,
): RegistroAgregado {
  const totais = { feito: 0, troquei: 0, pulei: 0, semRegistro: 0 };
  const porPosition = new Map<
    number,
    {
      nome: string;
      feito: number;
      troquei: number;
      pulei: number;
      semRegistro: number;
    }
  >();

  for (const slot of slots) {
    const chave = slot.state ?? "semRegistro";
    totais[chave] += 1;
    const entry = porPosition.get(slot.position) ?? {
      nome: slot.nome,
      feito: 0,
      troquei: 0,
      pulei: 0,
      semRegistro: 0,
    };
    entry[chave] += 1;
    porPosition.set(slot.position, entry);
  }

  const porRefeicao = [...porPosition.entries()]
    .sort(([a], [b]) => a - b)
    .map(([position, v]) => ({ position, ...v }));

  return { totais, porRefeicao };
}

/* ============ encontrarCicloAnterior (A3/D3) ============ */

export interface CicloCandidato {
  readonly id: string;
  readonly startedOn: string;
  readonly closedOn: string; // só ciclos fechados são candidatos
}

/**
 * Ciclo anterior = entre os candidatos com closedOn ≤ startedOn do atual, o
 * de closedOn mais recente; desempate (mesmo closedOn): startedOn mais
 * recente (o aberto mais recentemente — coerente com atribuirCiclo da 007).
 * Sem candidato válido (primeiro ciclo do paciente) → null, nunca erro.
 */
export function encontrarCicloAnterior(
  candidatos: ReadonlyArray<CicloCandidato>,
  startedOnAtual: string,
  idAtual: string,
): CicloCandidato | null {
  const validos = candidatos.filter(
    (c) => c.id !== idAtual && c.closedOn <= startedOnAtual,
  );
  if (validos.length === 0) return null;

  return validos.reduce((melhor, c) => {
    if (c.closedOn > melhor.closedOn) return c;
    if (c.closedOn === melhor.closedOn && c.startedOn > melhor.startedOn)
      return c;
    return melhor;
  });
}

/* ============ compararCiclos ============ */

export interface AgregadoParaComparacao {
  readonly media: number | null;
  readonly coberturaMedia: number | null;
  readonly totais: RegistroTotais;
}

export interface DeltasComparativo {
  readonly media: number | null;
  readonly coberturaMedia: number | null;
  readonly taxaFeito: number | null;
  readonly taxaTroquei: number | null;
  readonly taxaPulei: number | null;
}

const SEM_DELTA: DeltasComparativo = {
  media: null,
  coberturaMedia: null,
  taxaFeito: null,
  taxaTroquei: null,
  taxaPulei: null,
};

const taxasDe = (
  t: RegistroTotais,
): { feito: number; troquei: number; pulei: number } => {
  const total = t.feito + t.troquei + t.pulei + t.semRegistro;
  return total === 0
    ? { feito: 0, troquei: 0, pulei: 0 }
    : { feito: t.feito / total, troquei: t.troquei / total, pulei: t.pulei / total };
};

/**
 * Deltas (atual − anterior). Um dos lados sem dado (media null) → os 5
 * campos vêm null (nunca cálculo parcial — data-model.md: "null quando um
 * dos lados é sem-dado" governa o bloco inteiro, não campo a campo).
 */
export function compararCiclos(
  atual: AgregadoParaComparacao,
  anterior: AgregadoParaComparacao,
): DeltasComparativo {
  if (atual.media === null || anterior.media === null) return SEM_DELTA;

  const taxaAtual = taxasDe(atual.totais);
  const taxaAnterior = taxasDe(anterior.totais);

  return {
    media: atual.media - anterior.media,
    coberturaMedia:
      (atual.coberturaMedia as number) - (anterior.coberturaMedia as number),
    taxaFeito: taxaAtual.feito - taxaAnterior.feito,
    taxaTroquei: taxaAtual.troquei - taxaAnterior.troquei,
    taxaPulei: taxaAtual.pulei - taxaAnterior.pulei,
  };
}

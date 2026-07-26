// Loader de CASCA (Feature 011) — "refeições esperadas por dia" (D6): pra
// cada dia da janela, resolve o tipo-de-dia ALVO pela MESMA regra Q3-B da 006
// (snapshot uniforme dos registros vigentes do dia; senão fallback
// day_schedule) e devolve as refeições (position+nome) daquele tipo + o
// estado vigente por position. Batch: poucas queries pro range inteiro.
//
// Deliberadamente DUPLICADO em vez de extraído de adesao.service.ts (D6,
// research.md — "Plano B"): zero risco à suíte da 006. Diferença consciente:
// aqui o fallback é VIGÊNCIA-AWARE (usa o plano vigente NAQUELE DIA, via
// cycle_plan_vigencia, não só o plano ativo hoje) — mais correto pro padrão
// de registro sem tocar a régua de adesão em si (que segue vindo, intocada,
// de AdesaoService.serie()).
import { type EstadoRegistro } from '@bamboo/core';
import { asc, inArray, schema } from '@bamboo/db';
import type { Db } from '../db/db.module';
import { carregarRegistroVigente } from '../registro-vigente.loader';

export interface RefeicaoEsperada {
  readonly position: number;
  readonly nome: string;
}

export interface DiaRegistro {
  readonly refeicoesEsperadas: ReadonlyArray<RefeicaoEsperada>;
  readonly vigentesPorPosition: ReadonlyMap<number, EstadoRegistro>;
}

export interface VigenciaDeJanela {
  readonly planId: string;
  readonly validFrom: string;
  readonly validTo: string | null;
}

const enumerarDias = (from: string, to: string): string[] => {
  const [y, m, d] = from.split('-').map(Number);
  const cursor = new Date(y, m - 1, d);
  const dias: string[] = [];
  for (;;) {
    const mm = String(cursor.getMonth() + 1).padStart(2, '0');
    const dd = String(cursor.getDate()).padStart(2, '0');
    const iso = `${cursor.getFullYear()}-${mm}-${dd}`;
    dias.push(iso);
    if (iso >= to) break;
    cursor.setDate(cursor.getDate() + 1);
  }
  return dias;
};

const weekdayOf = (iso: string): number => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
};

// Plano vigente numa data, a partir das vigências do ciclo (bordas inclusivas;
// vigência aberta cobre até "hoje" — mesma convenção do restante do sistema).
const planoVigenteEm = (
  vigencias: ReadonlyArray<VigenciaDeJanela>,
  data: string,
  hoje: string,
): string | undefined =>
  vigencias.find(
    (v) =>
      v.validFrom <= data &&
      (v.validTo === null ? data <= hoje : data <= v.validTo),
  )?.planId;

export async function carregarRegistroDaJanela(
  db: Db,
  args: {
    readonly patientId: string;
    readonly from: string;
    readonly to: string;
    readonly vigencias: ReadonlyArray<VigenciaDeJanela>;
    readonly hoje: string;
  },
): Promise<ReadonlyMap<string, DiaRegistro>> {
  const { patientId, from, to, vigencias, hoje } = args;
  const dias = enumerarDias(from, to);

  // 1-2. Registro vigente do paciente na janela — plan-agnostic (012/D2:
  //      `qualquer-plano`, mesma convenção da via do ciclo), anulado não aparece
  //      (D9). Agrupa por dia PRESERVANDO a ordem de primeira aparição de cada
  //      (dia, refeição): é ela que o último-ganha do passo 5 consome numa
  //      colisão de position, e trocá-la mudaria o vencedor.
  const vigentes = await carregarRegistroVigente(db, {
    patientId,
    from,
    to,
    escopo: { kind: 'qualquer-plano' },
  });
  const vigentesPorDia = new Map<
    string,
    { position: number; dayTypeId: string; state: EstadoRegistro }[]
  >();
  for (const v of vigentes) {
    const lista = vigentesPorDia.get(v.date) ?? [];
    lista.push({
      position: v.position,
      dayTypeId: v.dayTypeId,
      state: v.state,
    });
    vigentesPorDia.set(v.date, lista);
  }

  // 3. Tipo-de-dia alvo por dia (Q3-B): snapshot uniforme; senão fallback
  //    day_schedule do plano vigente naquele dia.
  const planoPorDiaFallback = new Map<string, string | undefined>(
    dias.map((date) => [date, planoVigenteEm(vigencias, date, hoje)]),
  );
  const planIdsFallback = [
    ...new Set(
      [...planoPorDiaFallback.values()].filter(
        (p): p is string => p !== undefined,
      ),
    ),
  ];
  const schedules =
    planIdsFallback.length === 0
      ? []
      : await db
          .select({
            planId: schema.daySchedule.planId,
            weekday: schema.daySchedule.weekday,
            dayTypeId: schema.daySchedule.dayTypeId,
          })
          .from(schema.daySchedule)
          .where(inArray(schema.daySchedule.planId, planIdsFallback));
  const schedulePorPlano = new Map<string, Map<number, string>>();
  for (const s of schedules) {
    const mapa = schedulePorPlano.get(s.planId) ?? new Map<number, string>();
    mapa.set(s.weekday, s.dayTypeId);
    schedulePorPlano.set(s.planId, mapa);
  }

  const tipoAlvoPorDia = new Map<string, string | undefined>();
  for (const date of dias) {
    const vigentes = vigentesPorDia.get(date) ?? [];
    const tipos = new Set(vigentes.map((v) => v.dayTypeId));
    if (tipos.size === 1) {
      tipoAlvoPorDia.set(date, [...tipos][0]);
      continue;
    }
    const plano = planoPorDiaFallback.get(date);
    const tipo = plano
      ? schedulePorPlano.get(plano)?.get(weekdayOf(date))
      : undefined;
    tipoAlvoPorDia.set(date, tipo);
  }

  // 4. Refeições (position+nome) dos tipos-de-dia alvo usados, em lote.
  const dayTypeIds = [
    ...new Set(
      [...tipoAlvoPorDia.values()].filter((t): t is string => t !== undefined),
    ),
  ];
  const meals =
    dayTypeIds.length === 0
      ? []
      : await db
          .select({
            dayTypeId: schema.meal.dayTypeId,
            position: schema.meal.position,
            nome: schema.meal.name,
          })
          .from(schema.meal)
          .where(inArray(schema.meal.dayTypeId, dayTypeIds))
          .orderBy(asc(schema.meal.position));
  const refeicoesPorTipo = new Map<string, RefeicaoEsperada[]>();
  for (const m of meals) {
    const lista = refeicoesPorTipo.get(m.dayTypeId) ?? [];
    lista.push({ position: m.position, nome: m.nome });
    refeicoesPorTipo.set(m.dayTypeId, lista);
  }

  // 5. Monta o resultado por dia.
  const resultado = new Map<string, DiaRegistro>();
  for (const date of dias) {
    const tipoAlvo = tipoAlvoPorDia.get(date);
    const refeicoesEsperadas = tipoAlvo
      ? (refeicoesPorTipo.get(tipoAlvo) ?? [])
      : [];
    const vigentesPorPosition = new Map(
      (vigentesPorDia.get(date) ?? []).map(
        (v) => [v.position, v.state] as const,
      ),
    );
    resultado.set(date, { refeicoesEsperadas, vigentesPorPosition });
  }
  return resultado;
}

// Casca da Feature 006 — orquestra a métrica de adesão: valida a query na
// borda, carrega plano ativo/tolerâncias/consumo do período (I/O), resolve o
// tipo-de-dia que define o alvo por data (Q3-B/D3), pareia por position (D4)
// e delega a fórmula ao núcleo puro (adesaoDoDia/mediaAdesao). Régua corrente
// (D8): plano ativo + tolerância vigentes na consulta, inclusive pro passado.
// SÓ LEITURA: nenhuma escrita em nenhum caminho (FR-009/FR-014).
import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  PARAMETROS_SISTEMA,
  adesaoDoDia,
  alvoDoDia,
  mediaAdesao,
  resolverParametros,
  somaNutrientes,
  type ItemNutricional,
  type Nutrientes,
} from '@bamboo/core';
import { and, asc, eq, inArray, schema } from '@bamboo/db';
import { DB, type Db } from '../db/db.module';
import { localToday } from '../local-date';
import { carregarConsumoPorPeriodo } from './adesao-consumo';
import {
  diaComDado,
  diaSemDado,
  toSerieAdesaoResponse,
  type AdesaoDiaDto,
  type SerieAdesaoResponse,
} from './adesao.mapper';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DIAS = 366; // bound das queries (plan / Technical Context)

// Enumera os dias-calendário [from..to] (inclusive) como YYYY-MM-DD.
const enumerarDias = (from: string, to: string): string[] => {
  const [y, m, d] = from.split('-').map(Number);
  const cursor = new Date(y, m - 1, d);
  const dias: string[] = [];
  for (;;) {
    const mm = String(cursor.getMonth() + 1).padStart(2, '0');
    const dd = String(cursor.getDate()).padStart(2, '0');
    const iso = `${cursor.getFullYear()}-${mm}-${dd}`;
    dias.push(iso);
    if (iso >= to || dias.length > MAX_DIAS) break;
    cursor.setDate(cursor.getDate() + 1);
  }
  return dias;
};

const weekdayOf = (iso: string): number => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
};

// Alvo de um tipo-de-dia: refeições (positions) + alvoDoDia das opções default.
interface TipoAlvo {
  readonly positions: ReadonlySet<number>;
  readonly refeicoes: number;
  readonly alvo: Nutrientes;
}

@Injectable()
export class AdesaoService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async serie(
    patientId: string,
    fromRaw: unknown,
    toRaw: unknown,
  ): Promise<SerieAdesaoResponse> {
    // Validação estrutural na borda (sem estado) — padrão da casca.
    const from = typeof fromRaw === 'string' ? fromRaw : '';
    const to = typeof toRaw === 'string' ? toRaw : '';
    if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
      throw new BadRequestException(
        'from/to obrigatórios no formato YYYY-MM-DD',
      );
    }
    if (from > to) {
      throw new BadRequestException('from deve ser ≤ to');
    }
    const dias = enumerarDias(from, to);
    if (dias.length > MAX_DIAS) {
      throw new BadRequestException(`período máximo de ${MAX_DIAS} dias`);
    }

    // Paciente (404 se não existe) + tolerância (régua corrente, 3 níveis).
    const [pat] = await this.db
      .select({
        id: schema.patient.id,
        nutritionistId: schema.patient.nutritionistId,
        bandTolerancePct: schema.patient.bandTolerancePct,
        floorPct: schema.patient.floorPct,
      })
      .from(schema.patient)
      .where(eq(schema.patient.id, patientId))
      .limit(1);
    if (!pat) throw new NotFoundException('paciente não encontrado');

    const [nutri] = await this.db
      .select({
        defaultBandTolerancePct: schema.nutritionist.defaultBandTolerancePct,
        defaultFloorPct: schema.nutritionist.defaultFloorPct,
      })
      .from(schema.nutritionist)
      .where(eq(schema.nutritionist.id, pat.nutritionistId))
      .limit(1);

    const parametros = resolverParametros({
      sistema: PARAMETROS_SISTEMA,
      nutri: {
        toleranciaPct: nutri?.defaultBandTolerancePct ?? undefined,
        pisoPct: nutri?.defaultFloorPct ?? undefined,
      },
      paciente: {
        toleranciaPct: pat.bandTolerancePct ?? undefined,
        pisoPct: pat.floorPct ?? undefined,
      },
    });

    // Plano ativo na consulta (régua corrente). Sem plano → tudo sem-dado
    // (FR-012: estado do paciente, não erro).
    const [plan] = await this.db
      .select({ id: schema.plan.id })
      .from(schema.plan)
      .where(
        and(
          eq(schema.plan.patientId, patientId),
          eq(schema.plan.isActive, true),
        ),
      )
      .limit(1);
    if (!plan) {
      return toSerieAdesaoResponse({
        patientId,
        from,
        to,
        days: dias.map(diaSemDado),
        media: null,
      });
    }

    const consumoPorDia = await carregarConsumoPorPeriodo(this.db, {
      patientId,
      planId: plan.id,
      from,
      to,
    });

    // Programação default (fallback do tipo do alvo — Q3-B).
    const schedule = await this.db
      .select({
        weekday: schema.daySchedule.weekday,
        dayTypeId: schema.daySchedule.dayTypeId,
      })
      .from(schema.daySchedule)
      .where(eq(schema.daySchedule.planId, plan.id));
    const tipoPorWeekday = new Map(
      schedule.map((s) => [s.weekday, s.dayTypeId]),
    );

    const hoje = localToday();
    const alvoCache = new Map<string, TipoAlvo | null>();
    const days: AdesaoDiaDto[] = [];

    for (const date of dias) {
      if (date > hoje) {
        days.push(diaSemDado(date)); // futuro nunca tem dado (D7)
        continue;
      }
      const consumo = consumoPorDia.get(date);
      if (!consumo || consumo.porMeal.size === 0) {
        days.push(diaSemDado(date)); // cobertura zero = sem dado (Q2-B)
        continue;
      }
      const registradas = [...consumo.porMeal.values()];

      // Tipo-de-dia do alvo: snapshot uniforme dos registros; senão fallback.
      const tipos = new Set(registradas.map((r) => r.dayTypeId));
      const tipoAlvo =
        tipos.size === 1
          ? [...tipos][0]
          : tipoPorWeekday.get(weekdayOf(date));
      if (!tipoAlvo) {
        days.push(diaSemDado(date)); // sem programação pro weekday (defensivo)
        continue;
      }
      const info = await this.carregarTipoAlvo(tipoAlvo, alvoCache);
      if (!info || info.refeicoes === 0) {
        days.push(diaSemDado(date)); // tipo sem refeições (seed degenerado)
        continue;
      }

      // Pareamento por position (D4): cada slot do tipo do alvo conta uma vez.
      const pareadas = new Set(
        registradas
          .filter((r) => info.positions.has(r.position))
          .map((r) => r.position),
      ).size;
      // Consumo real do dia: TODAS as registradas (pareadas ou não — D4).
      const itens: ItemNutricional[] = registradas.flatMap((r) => [...r.itens]);
      const consumido = somaNutrientes(itens);

      const r = adesaoDoDia({
        alvo: info.alvo,
        consumido,
        toleranciaPct: parametros.toleranciaPct,
        refeicoesDoTipo: info.refeicoes,
        refeicoesRegistradas: pareadas,
      });
      if (!r.ok) {
        // Estruturalmente inalcançável (entradas derivadas e validadas acima).
        throw new InternalServerErrorException('adesão: entrada inválida');
      }
      days.push(diaComDado(date, r.value));
    }

    const media = mediaAdesao(
      days
        .filter((d) => d.status === 'com-dado')
        .map((d) => d.valorPct as number),
    );

    return toSerieAdesaoResponse({ patientId, from, to, days, media });
  }

  // Refeições + alvo (opções default) de um tipo-de-dia, com cache por consulta.
  private async carregarTipoAlvo(
    dayTypeId: string,
    cache: Map<string, TipoAlvo | null>,
  ): Promise<TipoAlvo | null> {
    const cached = cache.get(dayTypeId);
    if (cached !== undefined) return cached;

    const meals = await this.db
      .select({ id: schema.meal.id, position: schema.meal.position })
      .from(schema.meal)
      .where(eq(schema.meal.dayTypeId, dayTypeId))
      .orderBy(asc(schema.meal.position));
    if (meals.length === 0) {
      cache.set(dayTypeId, null);
      return null;
    }

    const defaults = await this.db
      .select({ id: schema.mealOption.id })
      .from(schema.mealOption)
      .where(
        and(
          inArray(
            schema.mealOption.mealId,
            meals.map((m) => m.id),
          ),
          eq(schema.mealOption.isDefault, true),
        ),
      );
    const itens =
      defaults.length === 0
        ? []
        : await this.db
            .select({
              quantityGrams: schema.mealItem.quantityGrams,
              carbPer100g: schema.food.carbPer100g,
              proteinPer100g: schema.food.proteinPer100g,
              fatPer100g: schema.food.fatPer100g,
              kcalPer100g: schema.food.kcalPer100g,
            })
            .from(schema.mealItem)
            .innerJoin(schema.food, eq(schema.mealItem.foodId, schema.food.id))
            .where(
              inArray(
                schema.mealItem.mealOptionId,
                defaults.map((o) => o.id),
              ),
            );

    const info: TipoAlvo = {
      positions: new Set(meals.map((m) => m.position)),
      refeicoes: meals.length,
      alvo: alvoDoDia([
        {
          itens: itens.map((i) => ({
            macros: {
              carbPer100g: i.carbPer100g,
              proteinPer100g: i.proteinPer100g,
              fatPer100g: i.fatPer100g,
              kcalPer100g: i.kcalPer100g,
            },
            gramas: i.quantityGrams,
          })),
        },
      ]),
    };
    cache.set(dayTypeId, info);
    return info;
  }
}

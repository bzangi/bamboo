import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray, schema } from '@bamboo/db';
import { estadoVigente, type EstadoRegistro } from '@bamboo/core';
import type { TodayResponse } from '@bamboo/types';
import { DB, type Db } from '../db/db.module';
import { localToday } from '../local-date';
import { toTodayResponse, type MealRow, type OptionRow } from './today.mapper';

// Casca imperativa: faz I/O (Drizzle), orquestra o mapper puro, converte
// ausências em HttpException na borda. Sem estado mutável (singleton do Nest).
@Injectable()
export class PlanService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async getToday(
    patientId: string,
    dayTypeId?: string,
  ): Promise<TodayResponse> {
    // 1. Paciente (exposure).
    const [pat] = await this.db
      .select({
        id: schema.patient.id,
        exposure: schema.patient.exposure,
      })
      .from(schema.patient)
      .where(eq(schema.patient.id, patientId))
      .limit(1);
    if (!pat) throw new NotFoundException('paciente não encontrado');

    // 2. Plano ativo do paciente.
    const [pln] = await this.db
      .select({ id: schema.plan.id })
      .from(schema.plan)
      .where(
        and(
          eq(schema.plan.patientId, patientId),
          eq(schema.plan.isActive, true),
        ),
      )
      .limit(1);
    if (!pln) throw new NotFoundException('plano ativo não encontrado');

    // 3. day_type: override explícito (Fase 2 — troca de tipo-de-dia, só
    //    exibição) OU resolução pela programação semanal (weekday do servidor).
    let resolved: { dayTypeId: string; dayTypeName: string };
    if (dayTypeId) {
      const [dt] = await this.db
        .select({ id: schema.dayType.id, name: schema.dayType.name })
        .from(schema.dayType)
        .where(
          and(
            eq(schema.dayType.id, dayTypeId),
            eq(schema.dayType.planId, pln.id),
          ),
        )
        .limit(1);
      if (!dt)
        throw new NotFoundException(
          'tipo-de-dia não encontrado no plano do paciente',
        );
      resolved = { dayTypeId: dt.id, dayTypeName: dt.name };
    } else {
      const weekday = new Date().getDay(); // 0=domingo .. 6=sábado
      const [sched] = await this.db
        .select({
          dayTypeId: schema.dayType.id,
          dayTypeName: schema.dayType.name,
        })
        .from(schema.daySchedule)
        .innerJoin(
          schema.dayType,
          eq(schema.daySchedule.dayTypeId, schema.dayType.id),
        )
        .where(
          and(
            eq(schema.daySchedule.planId, pln.id),
            eq(schema.daySchedule.weekday, weekday),
          ),
        )
        .limit(1);
      if (!sched)
        throw new NotFoundException('sem programação para o dia corrente');
      resolved = {
        dayTypeId: sched.dayTypeId,
        dayTypeName: sched.dayTypeName,
      };
    }

    // 4. Refeições do day_type (ordenadas por position).
    const meals = await this.db
      .select({
        id: schema.meal.id,
        name: schema.meal.name,
        position: schema.meal.position,
        horario: schema.meal.horario,
      })
      .from(schema.meal)
      .where(eq(schema.meal.dayTypeId, resolved.dayTypeId))
      .orderBy(asc(schema.meal.position));
    if (meals.length === 0)
      throw new NotFoundException('sem refeições para o dia corrente');

    // Fase 3: estado vigente do registro de cada refeição HOJE. Carrega TODOS os
    // eventos do dia (paciente, plano, logged_date de hoje, mealId IN ids) numa
    // query e reduz por refeição com estadoVigente (last-wins/tombstone) do core
    // — mesmo padrão agregado de measureRows→measuresByFood; o core é robusto à
    // ordem (usa `seq`), então não precisa de DISTINCT ON nem ORDER BY.
    const loggedDate = localToday();
    const mealIds = meals.map((m) => m.id);
    const eventRows = await this.db
      .select({
        mealId: schema.mealEvent.mealId,
        state: schema.mealEvent.state,
        createdAt: schema.mealEvent.createdAt,
      })
      .from(schema.mealEvent)
      .where(
        and(
          eq(schema.mealEvent.patientId, patientId),
          eq(schema.mealEvent.planId, pln.id),
          eq(schema.mealEvent.loggedDate, loggedDate),
          inArray(schema.mealEvent.mealId, mealIds),
        ),
      );
    const eventsByMeal = new Map<
      string,
      { seq: number; state: EstadoRegistro | null }[]
    >();
    for (const ev of eventRows) {
      const list = eventsByMeal.get(ev.mealId) ?? [];
      // seq = ordem total por created_at (microssegundo); o advisory lock no
      // INSERT garante estritamente crescente por (paciente, refeição, dia).
      list.push({ seq: ev.createdAt.getTime(), state: ev.state });
      eventsByMeal.set(ev.mealId, list);
    }
    const estadoPorMeal = new Map<string, EstadoRegistro | null>();
    for (const m of meals) {
      estadoPorMeal.set(m.id, estadoVigente(eventsByMeal.get(m.id) ?? []));
    }

    // Medidas caseiras de todos os alimentos (1 query; agrupa em memória) — pra
    // exibir o planejado em unidade/fatia (o mapper escolhe a preferida).
    const measureRows = await this.db
      .select({
        foodId: schema.foodHouseholdMeasure.foodId,
        label: schema.foodHouseholdMeasure.label,
        grams: schema.foodHouseholdMeasure.grams,
      })
      .from(schema.foodHouseholdMeasure);
    const measuresByFood = new Map<
      string,
      { label: string; grams: number }[]
    >();
    for (const mr of measureRows) {
      const list = measuresByFood.get(mr.foodId) ?? [];
      list.push({ label: mr.label, grams: mr.grams });
      measuresByFood.set(mr.foodId, list);
    }

    // 5. Para cada refeição: TODAS as opções + itens (com food). (Fase 2: o
    //    paciente pode ver/escolher outra opção — gatilho P1.)
    const mealRows: MealRow[] = [];
    for (const m of meals) {
      const options = await this.db
        .select({
          id: schema.mealOption.id,
          label: schema.mealOption.label,
          isDefault: schema.mealOption.isDefault,
        })
        .from(schema.mealOption)
        .where(eq(schema.mealOption.mealId, m.id));
      if (options.length === 0)
        throw new NotFoundException(`refeição ${m.id} sem opções`);

      const optionRows: OptionRow[] = [];
      for (const opt of options) {
        const items = await this.db
          .select({
            id: schema.mealItem.id,
            quantityGrams: schema.mealItem.quantityGrams,
            isLocked: schema.mealItem.isLocked,
            substitutionGroupId: schema.mealItem.substitutionGroupId,
            foodId: schema.food.id,
            foodName: schema.food.name,
            kcalPer100g: schema.food.kcalPer100g,
            carbPer100g: schema.food.carbPer100g,
            proteinPer100g: schema.food.proteinPer100g,
            fatPer100g: schema.food.fatPer100g,
          })
          .from(schema.mealItem)
          .innerJoin(schema.food, eq(schema.mealItem.foodId, schema.food.id))
          .where(eq(schema.mealItem.mealOptionId, opt.id));

        optionRows.push({
          id: opt.id,
          label: opt.label,
          isDefault: opt.isDefault,
          items: items.map((it) => ({
            id: it.id,
            quantityGrams: it.quantityGrams,
            isLocked: it.isLocked,
            substitutionGroupId: it.substitutionGroupId,
            food: {
              id: it.foodId,
              name: it.foodName,
              kcalPer100g: it.kcalPer100g,
              carbPer100g: it.carbPer100g,
              proteinPer100g: it.proteinPer100g,
              fatPer100g: it.fatPer100g,
            },
            measures: measuresByFood.get(it.foodId) ?? [],
          })),
        });
      }

      mealRows.push({
        id: m.id,
        name: m.name,
        position: m.position,
        horario: m.horario,
        options: optionRows,
        estadoVigente: estadoPorMeal.get(m.id) ?? null,
      });
    }

    // 6. "O agora" é derivado no mapper (1ª refeição não-registrada na ordem do
    //    plano) a partir de mealRows[].estadoVigente — não mais estático.

    // 6b. Tipos-de-dia do plano (habilita a troca de cardápio no app — US3).
    const dayTypes = await this.db
      .select({ id: schema.dayType.id, name: schema.dayType.name })
      .from(schema.dayType)
      .where(eq(schema.dayType.planId, pln.id));

    // 7. Monta o DTO puro (gate de exposição + derivação de "o agora" lá).
    return toTodayResponse({
      patientId: pat.id,
      exposure: pat.exposure,
      dayType: { id: resolved.dayTypeId, label: resolved.dayTypeName },
      availableDayTypes: dayTypes.map((d) => ({ id: d.id, label: d.name })),
      meals: mealRows,
    });
  }
}

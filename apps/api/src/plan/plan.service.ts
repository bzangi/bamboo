import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, schema } from '@bamboo/db';
import type { TodayResponse } from '@bamboo/types';
import { DB, type Db } from '../db/db.module';
import { toTodayResponse, type MealRow, type OptionRow } from './today.mapper';

// Casca imperativa: faz I/O (Drizzle), orquestra o mapper puro, converte
// ausências em HttpException na borda. Sem estado mutável (singleton do Nest).
@Injectable()
export class PlanService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async getToday(patientId: string): Promise<TodayResponse> {
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

    // 3. day_type do dia corrente via day_schedule (weekday do servidor).
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

    // 4. Refeições do day_type (ordenadas por position).
    const meals = await this.db
      .select({
        id: schema.meal.id,
        name: schema.meal.name,
        position: schema.meal.position,
        horario: schema.meal.horario,
      })
      .from(schema.meal)
      .where(eq(schema.meal.dayTypeId, sched.dayTypeId))
      .orderBy(asc(schema.meal.position));
    if (meals.length === 0)
      throw new NotFoundException('sem refeições para o dia corrente');

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
          })),
        });
      }

      mealRows.push({
        id: m.id,
        name: m.name,
        position: m.position,
        horario: m.horario,
        options: optionRows,
      });
    }

    // 6. "O agora" no v0: 1ª refeição por position (já ordenadas).
    const currentMealId = mealRows[0].id;

    // 7. Monta o DTO puro (gate de exposição aplicado lá).
    return toTodayResponse({
      patientId: pat.id,
      exposure: pat.exposure,
      dayType: { id: sched.dayTypeId, label: sched.dayTypeName },
      currentMealId,
      meals: mealRows,
    });
  }
}

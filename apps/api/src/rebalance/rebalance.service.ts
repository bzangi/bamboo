import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { match } from 'ts-pattern';
import {
  PARAMETROS_SISTEMA,
  previewTrocaOpcao,
  resolverParametros,
  type FoodMacros,
  type HouseholdMeasure,
  type ItemDia,
  type RefeicaoDia,
} from '@bamboo/core';
import { and, asc, eq, schema } from '@bamboo/db';
import type { OptionChoiceRequest, OptionChoiceResponse } from '@bamboo/types';
import { DB, type Db } from '../db/db.module';
import { carregarConsumoDoDia } from '../registro-consumo';
import {
  toOptionChoiceResponse,
  type FoodRef,
  type MealRef,
} from './rebalance.mapper';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface LoadedItem {
  readonly id: string;
  readonly foodId: string;
  readonly foodName: string;
  readonly macros: FoodMacros;
  readonly quantityGrams: number;
  readonly isLocked: boolean;
  readonly groupId: string | null;
  readonly medidas: readonly HouseholdMeasure[];
}
interface LoadedOption {
  readonly id: string;
  readonly isDefault: boolean;
  readonly items: readonly LoadedItem[];
}
interface LoadedMeal {
  readonly id: string;
  readonly name: string;
  readonly position: number;
  readonly options: readonly LoadedOption[];
}

// Casca imperativa (US1): I/O via Drizzle, resolve os parâmetros de 3 níveis,
// orquestra o núcleo puro (previewTrocaOpcao) e monta DTO com gate de exposição.
// Não persiste nada (FR-026). recusa-orientada vira 200 (D4 — "nunca barra").
@Injectable()
export class RebalanceService {
  private readonly logger = new Logger(RebalanceService.name);

  constructor(@Inject(DB) private readonly db: Db) {}

  async optionChoice(
    patientId: string,
    body: OptionChoiceRequest,
  ): Promise<OptionChoiceResponse> {
    this.logger.log(
      `optionChoice patient=${patientId} trigger=${body?.triggerMealId} chosen=${body?.chosenOptionId}`,
    );
    // Validação estrutural do corpo (sem class-validator: checagem na borda).
    if (
      !UUID_RE.test(body?.triggerMealId ?? '') ||
      !UUID_RE.test(body?.chosenOptionId ?? '')
    ) {
      throw new BadRequestException(
        'triggerMealId e chosenOptionId devem ser UUIDs',
      );
    }

    // 1. Paciente (exposure + config nível 1).
    const [pat] = await this.db
      .select({
        id: schema.patient.id,
        exposure: schema.patient.exposure,
        bandTolerancePct: schema.patient.bandTolerancePct,
        floorPct: schema.patient.floorPct,
        nutritionistId: schema.patient.nutritionistId,
      })
      .from(schema.patient)
      .where(eq(schema.patient.id, patientId))
      .limit(1);
    if (!pat) throw new NotFoundException('paciente não encontrado');

    // 2. Nutri (config nível 2).
    const [nutri] = await this.db
      .select({
        defaultBandTolerancePct: schema.nutritionist.defaultBandTolerancePct,
        defaultFloorPct: schema.nutritionist.defaultFloorPct,
      })
      .from(schema.nutritionist)
      .where(eq(schema.nutritionist.id, pat.nutritionistId))
      .limit(1);

    // Resolução de 3 níveis (paciente > nutri > sistema). null → próximo nível.
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

    // 3. Plano ativo.
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

    // 4. day_type do dia corrente (weekday do servidor; mesma resolução do /today).
    const weekday = new Date().getDay();
    const [sched] = await this.db
      .select({ dayTypeId: schema.dayType.id })
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

    // 5. Medidas caseiras (1 query; agrupa em memória).
    const measureRows = await this.db
      .select({
        foodId: schema.foodHouseholdMeasure.foodId,
        label: schema.foodHouseholdMeasure.label,
        grams: schema.foodHouseholdMeasure.grams,
      })
      .from(schema.foodHouseholdMeasure);
    const measuresByFood = new Map<string, HouseholdMeasure[]>();
    for (const r of measureRows) {
      const list = measuresByFood.get(r.foodId) ?? [];
      list.push({ label: r.label, grams: r.grams });
      measuresByFood.set(r.foodId, list);
    }

    // 6. Refeições + opções + itens (com macros) do dia.
    const mealRows = await this.db
      .select({
        id: schema.meal.id,
        name: schema.meal.name,
        position: schema.meal.position,
      })
      .from(schema.meal)
      .where(eq(schema.meal.dayTypeId, sched.dayTypeId))
      .orderBy(asc(schema.meal.position));
    if (mealRows.length === 0)
      throw new NotFoundException('sem refeições para o dia corrente');

    const meals: LoadedMeal[] = [];
    for (const m of mealRows) {
      const options = await this.db
        .select({
          id: schema.mealOption.id,
          isDefault: schema.mealOption.isDefault,
        })
        .from(schema.mealOption)
        .where(eq(schema.mealOption.mealId, m.id));
      if (options.length === 0)
        throw new NotFoundException(`refeição ${m.id} sem opções`);

      const loadedOptions: LoadedOption[] = [];
      for (const opt of options) {
        const items = await this.db
          .select({
            id: schema.mealItem.id,
            quantityGrams: schema.mealItem.quantityGrams,
            isLocked: schema.mealItem.isLocked,
            groupId: schema.mealItem.substitutionGroupId,
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

        loadedOptions.push({
          id: opt.id,
          isDefault: opt.isDefault,
          items: items.map((it) => ({
            id: it.id,
            foodId: it.foodId,
            foodName: it.foodName,
            macros: {
              carbPer100g: it.carbPer100g,
              proteinPer100g: it.proteinPer100g,
              fatPer100g: it.fatPer100g,
              kcalPer100g: it.kcalPer100g,
            },
            quantityGrams: it.quantityGrams,
            isLocked: it.isLocked,
            groupId: it.groupId,
            medidas: measuresByFood.get(it.foodId) ?? [],
          })),
        });
      }

      meals.push({
        id: m.id,
        name: m.name,
        position: m.position,
        options: loadedOptions,
      });
    }

    // 7. Valida o gatilho: refeição existe no dia e a opção pertence a ela.
    const triggerMeal = meals.find((m) => m.id === body.triggerMealId);
    if (!triggerMeal)
      throw new NotFoundException(
        'refeição do gatilho não está no dia corrente',
      );
    const chosenOption = triggerMeal.options.find(
      (o) => o.id === body.chosenOptionId,
    );
    if (!chosenOption)
      throw new UnprocessableEntityException(
        'opção escolhida não pertence à refeição do gatilho',
      );

    const defaultDe = (m: LoadedMeal): LoadedOption =>
      m.options.find((o) => o.isDefault) ?? m.options[0];

    // 8. Alvo (defaults) + dia com a escolha (trigger usa a chosen; resto default).
    const refeicoesDefault = meals.map((m) => ({
      itens: defaultDe(m).items.map((it) => ({
        macros: it.macros,
        gramas: it.quantityGrams,
      })),
    }));

    // 8b. Consumo real do dia (helper de casca, type-agnostic por paciente+plano+
    // localToday): refeições registradas hoje (feito/troquei/pulei). Usado para
    // (a) excluir as registradas das alavancas (isRegistered:true → o motor não as
    // ajusta — FR-001/002) e (b) alimentar o totalAtual com o CONSUMO REAL (FR-005).
    const { porMeal } = await carregarConsumoDoDia(this.db, {
      patientId,
      planId: pln.id,
    });
    this.logger.debug(
      `consumo do dia: ${porMeal.size} refeição(ões) registrada(s) sai(em) das alavancas`,
    );

    const diaComEscolha: RefeicaoDia[] = meals.map((m) => {
      // gatilho → opção escolhida (não registrada, é alavanca-fixada pela escolha).
      if (m.id === triggerMeal.id) {
        const itens: ItemDia[] = chosenOption.items.map((it) => ({
          itemId: it.id,
          macros: it.macros,
          gramas: it.quantityGrams,
          gramasPlanejado: it.quantityGrams,
          isLocked: it.isLocked,
          groupId: it.groupId,
          medidas: it.medidas,
        }));
        return { position: m.position, isRegistered: false, itens };
      }

      // refeição REGISTRADA (≠ gatilho) → consumo real, isRegistered:true. Os
      // ItemNutricional só têm {macros, gramas}; como a refeição sai das alavancas
      // (filtro !isRegistered no core), os demais campos do ItemDia não viram
      // alavanca nem aparecem na resposta — só macros+gramas entram no totalAtual.
      // pulei → itens:[] → contribui 0 ao total.
      const consumo = porMeal.get(m.id);
      if (consumo) {
        const itens: ItemDia[] = consumo.itens.map((it, idx) => ({
          itemId: `reg-${m.id}-${idx}`, // id sintético (não é alavanca; não aparece)
          macros: it.macros,
          gramas: it.gramas,
          gramasPlanejado: it.gramas,
          isLocked: true,
          groupId: null,
          medidas: [],
        }));
        return { position: m.position, isRegistered: true, itens };
      }

      // refeição NÃO registrada → opção default planejada, isRegistered:false.
      const itens: ItemDia[] = defaultDe(m).items.map((it) => ({
        itemId: it.id,
        macros: it.macros,
        gramas: it.quantityGrams,
        gramasPlanejado: it.quantityGrams,
        isLocked: it.isLocked,
        groupId: it.groupId,
        medidas: it.medidas,
      }));
      return { position: m.position, isRegistered: false, itens };
    });

    // 9. Núcleo puro.
    const resultado = previewTrocaOpcao({
      refeicoesDefault,
      diaComEscolha,
      triggerPosition: triggerMeal.position,
      parametros,
    });

    if (!resultado.ok) {
      this.logger.warn(`preview recusado pelo motor: ${resultado.error.kind}`);
      throw match(resultado.error)
        .with(
          { kind: 'entrada-invalida' },
          () =>
            new UnprocessableEntityException('entrada inválida para o motor'),
        )
        .exhaustive();
    }

    // 10. Lookups + DTO (gate de exposição no mapper).
    const mealByPosition = new Map<number, MealRef>(
      meals.map((m) => [m.position, { id: m.id, name: m.name }]),
    );
    const foodByItemId = new Map<string, FoodRef>(
      meals.flatMap((m) =>
        m.options.flatMap((o) =>
          o.items.map(
            (it) => [it.id, { id: it.foodId, name: it.foodName }] as const,
          ),
        ),
      ),
    );

    return toOptionChoiceResponse({
      patientId: pat.id,
      exposure: pat.exposure,
      outcome: resultado.value,
      mealByPosition,
      foodByItemId,
    });
  }
}

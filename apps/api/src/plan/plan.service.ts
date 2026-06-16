import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray, schema } from '@bamboo/db';
import {
  PARAMETROS_SISTEMA,
  estadoVigente,
  previewTrocaTipoDia,
  resolverParametros,
  type EstadoRegistro,
  type ItemDia,
  type RefeicaoDia,
} from '@bamboo/core';
import type { TodayResponse } from '@bamboo/types';
import { DB, type Db } from '../db/db.module';
import { localToday } from '../local-date';
import { carregarConsumoDoDia } from '../registro-consumo';
import { toTodayResponse, type MealRow, type OptionRow } from './today.mapper';

// Casca imperativa: faz I/O (Drizzle), orquestra o mapper puro, converte
// ausências em HttpException na borda. Sem estado mutável (singleton do Nest).
@Injectable()
export class PlanService {
  private readonly logger = new Logger(PlanService.name);

  constructor(@Inject(DB) private readonly db: Db) {}

  async getToday(
    patientId: string,
    dayTypeId?: string,
  ): Promise<TodayResponse> {
    this.logger.log(
      `getToday patient=${patientId}${dayTypeId ? ` override=${dayTypeId}` : ''}`,
    );
    // 1. Paciente (exposure + config de adaptação nível 1, p/ a troca de
    //    tipo-de-dia recalcular pelo consumido — US3).
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
    this.logger.debug(
      `dia resolvido: dayType=${resolved.dayTypeId} (${resolved.dayTypeName}), ${meals.length} refeição(ões)`,
    );

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

    // 7. US3 (Fase 4) — recalcular pelo CONSUMIDO na troca de tipo-de-dia. SÓ
    //    quando há `dayTypeId` (override ativo) E consumo registrado hoje. O tipo
    //    padrão por weekday (sem override) NUNCA auto-ajusta (Q1/FR-013a).
    // (009) Com override ativo, além do ajuste (alavancas recalculadas) vem o
    //    registro pareado por POSIÇÃO (o badge da refeição comida segue pro novo
    //    tipo). Ambos derivam do MESMO consumo do dia (uma leitura).
    const troca = dayTypeId
      ? await this.calcularTrocaTipoDia(patientId, pln.id, pat, mealRows)
      : undefined;
    if (troca?.ajuste) {
      this.logger.debug(
        `troca de tipo-de-dia: ${troca.ajuste.size} alavanca(s) recalculada(s) pelo consumo`,
      );
    }

    // 8. Monta o DTO puro (gate de exposição + "o agora" lá; ajuste aplicado só
    //    aos itens flexíveis da default — US3; registro por posição + flag
    //    `rebalanceado` — 009).
    return toTodayResponse(
      {
        patientId: pat.id,
        exposure: pat.exposure,
        dayType: { id: resolved.dayTypeId, label: resolved.dayTypeName },
        availableDayTypes: dayTypes.map((d) => ({ id: d.id, label: d.name })),
        meals: mealRows,
      },
      troca?.ajuste,
      troca?.registroPorPosition,
    );
  }

  // US3 (Fase 4) — calcula o mapa itemId→gramasNovo das alavancas recalculadas
  // pela troca de tipo-de-dia, lendo o CONSUMO REAL do dia. Casca de leitura:
  // I/O + orquestra o núcleo puro (previewTrocaTipoDia). Não lança — "nunca
  // barra": qualquer desfecho ≠ rebalanceado devolve undefined (mostra planejado;
  // /today não tem superfície de recusa). Decisões D5/D7, contracts/http-motor.md.
  private async calcularTrocaTipoDia(
    patientId: string,
    planId: string,
    pat: {
      readonly bandTolerancePct: number | null;
      readonly floorPct: number | null;
      readonly nutritionistId: string;
    },
    mealRows: readonly MealRow[],
  ): Promise<{
    readonly ajuste?: ReadonlyMap<string, number>;
    readonly registroPorPosition?: ReadonlyMap<number, EstadoRegistro>;
  }> {
    // 1. Parâmetros de adaptação (resolução de 3 níveis: paciente > nutri >
    //    sistema), mesmo padrão do rebalance.service.
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

    // 2. Consumo real do dia (helper de casca, type-agnostic por paciente+plano+
    //    localToday). Sem consumo → nada a ajustar (mostra o planejado).
    const consumoDia = await carregarConsumoDoDia(this.db, {
      patientId,
      planId,
    });
    if (consumoDia.porMeal.size === 0) return {};

    // (009/US1) Estado de registro por POSIÇÃO (type-agnostic): o badge da
    //    refeição comida segue pro slot de mesma posição no novo tipo. Derivado
    //    sempre que há consumo — independente de o motor produzir ajuste.
    const registroPorPosition = new Map<number, EstadoRegistro>(
      [...consumoDia.porMeal.values()].map((c) => [c.position, c.state]),
    );

    // 3. Slots JÁ registrados hoje, por position (type-agnostic). Pareia os slots
    //    entre tipos-de-dia: a refeição já comida entra via `consumido`; sua
    //    posição correspondente no NOVO tipo SAI das restantes (evita double-count
    //    — FR-013b).
    const registeredPositions = new Set(
      [...consumoDia.porMeal.values()].map((c) => c.position),
    );

    // 4. Cardápio do NOVO tipo (= mealRows já carregados): opção default de cada
    //    refeição. `refeicoesDefaultNovoTipo` = alvo (todas); `restantes` = só os
    //    slots NÃO registrados (alavancas vivem aqui).
    const defaultDe = (m: MealRow): OptionRow =>
      m.options.find((o) => o.isDefault) ?? m.options[0];

    const refeicoesDefaultNovoTipo = mealRows.map((m) => ({
      itens: defaultDe(m).items.map((it) => ({
        macros: {
          carbPer100g: it.food.carbPer100g,
          proteinPer100g: it.food.proteinPer100g,
          fatPer100g: it.food.fatPer100g,
          kcalPer100g: it.food.kcalPer100g,
        },
        gramas: it.quantityGrams,
      })),
    }));

    const refeicoesRestantesNovoTipo: RefeicaoDia[] = mealRows
      .filter((m) => !registeredPositions.has(m.position))
      .map((m) => {
        const itens: ItemDia[] = defaultDe(m).items.map((it) => ({
          itemId: it.id,
          macros: {
            carbPer100g: it.food.carbPer100g,
            proteinPer100g: it.food.proteinPer100g,
            fatPer100g: it.food.fatPer100g,
            kcalPer100g: it.food.kcalPer100g,
          },
          gramas: it.quantityGrams,
          gramasPlanejado: it.quantityGrams,
          isLocked: it.isLocked,
          groupId: it.substitutionGroupId,
          medidas: it.measures,
        }));
        return { position: m.position, isRegistered: false, itens };
      });

    // 5. Núcleo puro. Só 'rebalanceado' produz ajuste; qualquer outro desfecho
    //    (sem-acao / recusa-orientada / entrada-invalida) → sem ajuste (mostra
    //    planejado). O registro pareado por posição vai junto nos dois casos —
    //    o badge da refeição comida aparece mesmo quando não houve recálculo.
    const r = previewTrocaTipoDia({
      consumido: consumoDia.consumido,
      refeicoesRestantesNovoTipo,
      refeicoesDefaultNovoTipo,
      parametros,
    });
    if (!r.ok || r.value.kind !== 'rebalanceado')
      return { registroPorPosition };

    return {
      ajuste: new Map(r.value.alavancas.map((a) => [a.itemId, a.gramasNovo])),
      registroPorPosition,
    };
  }
}

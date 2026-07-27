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
import { and, asc, eq, inArray, schema } from '@bamboo/db';
import type { OptionChoiceRequest, OptionChoiceResponse } from '@bamboo/types';
import {
  carregarConsumoReal,
  type RefeicaoConsumida,
} from '../consumo-real.loader';
import { DB, type Db } from '../db/db.module';
import { localToday } from '../local-date';
import { carregarRegistroVigente } from '../registro-vigente.loader';
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
  readonly adLibitum: boolean;
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
    // (020) Validação estrutural do overlay da edição em lote. A forma espelha
    // `RegistroRequest.consumo.items` de propósito (D2): o que a prévia avalia
    // é o que o registro vai gravar. Ausente ⇒ comportamento de sempre.
    if (body.items !== undefined) {
      // O isArray roda num alias `unknown`: narrowing direto em `body.items`
      // degradaria ReadonlyArray para `any[]` no resto da função.
      const raw: unknown = body.items;
      if (!Array.isArray(raw) || raw.length === 0) {
        throw new BadRequestException('items deve ser uma lista não vazia');
      }
      for (const it of body.items) {
        if (
          !UUID_RE.test(it?.itemId ?? '') ||
          !UUID_RE.test(it?.foodId ?? '')
        ) {
          throw new BadRequestException(
            'items[].itemId e items[].foodId devem ser UUIDs',
          );
        }
        if (
          typeof it.quantityGrams !== 'number' ||
          !Number.isFinite(it.quantityGrams) ||
          it.quantityGrams <= 0
        ) {
          throw new BadRequestException(
            'items[].quantityGrams deve ser um número > 0',
          );
        }
      }
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

    // 4. (014) day_type em vigor: override do corpo (validado pertencer ao plano
    //    ativo) OU o default do weekday. MESMA resolução do `/today` e do
    //    `POST /registro` — a assimetria entre os três é a causa raiz do KI-005:
    //    o app manda o `triggerMealId` do cardápio EXIBIDO, então sob override
    //    todo gatilho caía fora do roster do weekday e virava 404.
    let dayTypeId: string;
    if (body.dayTypeId) {
      const [dt] = await this.db
        .select({ id: schema.dayType.id })
        .from(schema.dayType)
        .where(
          and(
            eq(schema.dayType.id, body.dayTypeId),
            eq(schema.dayType.planId, pln.id),
          ),
        )
        .limit(1);
      if (!dt)
        throw new NotFoundException(
          'tipo-de-dia não encontrado no plano do paciente',
        );
      dayTypeId = dt.id;
    } else {
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
      dayTypeId = sched.dayTypeId;
    }

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
      .where(eq(schema.meal.dayTypeId, dayTypeId))
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
            adLibitum: schema.mealItem.adLibitum,
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
            adLibitum: it.adLibitum,
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

    // 7b. (020) Overlay da edição em lote: pertencimento à opção escolhida
    // (404), item travado/sem grupo não é editável (422) e macros dos foods
    // editados (404 se algum não existir). Agrupado por itemId — múltiplas
    // entradas do mesmo item somam (combinação, como no snapshot do troquei).
    const overlayPorItem = new Map<
      string,
      { readonly foodId: string; readonly gramas: number }[]
    >();
    const macrosOverlay = new Map<string, FoodMacros>();
    if (body.items && body.items.length > 0) {
      const itensDaOpcao = new Map(chosenOption.items.map((it) => [it.id, it]));
      for (const e of body.items) {
        const alvo = itensDaOpcao.get(e.itemId);
        if (!alvo) {
          throw new NotFoundException(
            'item do overlay não pertence à opção escolhida',
          );
        }
        if (alvo.isLocked || alvo.groupId == null) {
          throw new UnprocessableEntityException(
            'item travado (ou sem grupo de substituição) não é editável',
          );
        }
        const entradas = overlayPorItem.get(e.itemId) ?? [];
        entradas.push({ foodId: e.foodId, gramas: e.quantityGrams });
        overlayPorItem.set(e.itemId, entradas);
      }
      // ponytail: o grupo de substituição do food do overlay NÃO é re-validado
      // aqui — a prévia é efêmera e o POST /registro é o enforcement
      // (consumo-fora-do-grupo → 422); o app só produz troca dentro do grupo,
      // com gramas calculadas pelo servidor. Validar na prévia se surgir
      // cliente que monte overlay à mão.
      const foodIds = [...new Set(body.items.map((e) => e.foodId))];
      const foods = await this.db
        .select({
          id: schema.food.id,
          kcalPer100g: schema.food.kcalPer100g,
          carbPer100g: schema.food.carbPer100g,
          proteinPer100g: schema.food.proteinPer100g,
          fatPer100g: schema.food.fatPer100g,
        })
        .from(schema.food)
        .where(inArray(schema.food.id, foodIds));
      for (const f of foods) {
        macrosOverlay.set(f.id, {
          carbPer100g: f.carbPer100g,
          proteinPer100g: f.proteinPer100g,
          fatPer100g: f.fatPer100g,
          kcalPer100g: f.kcalPer100g,
        });
      }
      if (foodIds.some((id) => !macrosOverlay.has(id))) {
        throw new NotFoundException('alimento do overlay não encontrado');
      }
    }
    const macrosDoOverlay = (foodId: string): FoodMacros => {
      const m = macrosOverlay.get(foodId);
      // Inalcançável: presença validada acima. Lançar > cast silencioso.
      if (!m) throw new NotFoundException('alimento do overlay não encontrado');
      return m;
    };

    const defaultDe = (m: LoadedMeal): LoadedOption =>
      m.options.find((o) => o.isDefault) ?? m.options[0];

    // 8. Alvo (defaults) + dia com a escolha (trigger usa a chosen; resto default).
    const refeicoesDefault = meals.map((m) => ({
      itens: defaultDe(m).items.map((it) => ({
        macros: it.macros,
        gramas: it.quantityGrams,
      })),
    }));

    // 8b. Consumo real do dia (registro vigente + consumo empilhado, 012),
    // type-agnostic por paciente+plano+`localToday`: refeições registradas hoje
    // (feito/troquei/pulei). Usado para (a) excluir as registradas das alavancas
    // (isRegistered:true → o motor não as ajusta — FR-001/002) e (b) alimentar o
    // totalAtual com o CONSUMO REAL (FR-005). Sem agregado aqui: o total sai do
    // núcleo, via `diaComEscolha`.
    // `localToday` (não `new Date().toISOString()`): a data-calendário LOCAL é a
    // mesma fonte do `logged_date`; UTC deslocaria a janela na virada do dia.
    const hoje = localToday();
    const vigentesHoje = await carregarRegistroVigente(this.db, {
      patientId,
      from: hoje,
      to: hoje,
      escopo: { kind: 'plano', planId: pln.id },
    });
    const consumoPorDia = await carregarConsumoReal(this.db, vigentesHoje);
    // Pareamento por `mealId` — NÃO por position (ADR-0001/KI-002). O consumo
    // agora traz `position` no mesmo objeto; não "consistentificar" aqui.
    const porMeal =
      consumoPorDia.get(hoje) ?? new Map<string, RefeicaoConsumida>();
    this.logger.debug(
      `consumo do dia: ${porMeal.size} refeição(ões) registrada(s) sai(em) das alavancas`,
    );

    const diaComEscolha: RefeicaoDia[] = meals.map((m) => {
      // gatilho → opção escolhida (não registrada, é alavanca-fixada pela escolha).
      // (020) Item com overlay contribui com o food/gramas EDITADOS, com ids
      // sintéticos `ed-` (mesmo padrão dos `reg-` das registradas): o gatilho
      // inteiro já sai das alavancas por `position`, então só os macros+gramas
      // entram no totalAtual — e o que o paciente escolheu comer nunca é
      // reescalado nem aparece na resposta.
      if (m.id === triggerMeal.id) {
        const itens: ItemDia[] = chosenOption.items.flatMap((it) => {
          const overlay = overlayPorItem.get(it.id);
          if (!overlay) {
            return [
              {
                itemId: it.id,
                macros: it.macros,
                gramas: it.quantityGrams,
                gramasPlanejado: it.quantityGrams,
                isLocked: it.isLocked,
                adLibitum: it.adLibitum,
                groupId: it.groupId,
                medidas: it.medidas,
              },
            ];
          }
          return overlay.map((e, idx) => ({
            itemId: `ed-${it.id}-${idx}`,
            macros: macrosDoOverlay(e.foodId),
            gramas: e.gramas,
            gramasPlanejado: e.gramas,
            isLocked: true,
            adLibitum: false,
            groupId: null,
            medidas: [],
          }));
        });
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
          adLibitum: false, // item de refeição registrada: nunca alavanca, por outro motivo
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
        adLibitum: it.adLibitum,
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

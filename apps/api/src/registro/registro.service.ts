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
  classificarEstado,
  decidirRegistro,
  derivarOAgora,
  estadoVigente,
  type Adequacao,
  type AlvoRegistro,
  type EventoRegistro,
  type ItemConsumido,
} from '@bamboo/core';
import { and, asc, eq, inArray, schema, sql } from '@bamboo/db';
import type { RegistroRequest, RegistroResponse } from '@bamboo/types';
import { DB, type Db } from '../db/db.module';
import { localToday } from '../local-date';
import { toRegistroResponse } from './registro.mapper';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const INTENTS = ['feito', 'pulei', 'desfazer'] as const;

// Casca imperativa: I/O via Drizzle dentro de db.transaction + advisory lock por
// (paciente, refeição, dia), orquestra o núcleo puro (classificarEstado,
// estadoVigente, decidirRegistro, derivarOAgora), persiste append-only e converte
// Result/ausências → HttpException na borda (opção 1). Sem serializar entidade
// crua (mapper puro). Trata feito|pulei|desfazer (US1) e deriva troquei (US2)
// resolvendo opção não-default / substituição within-group NO BANCO (nunca do
// payload), gravando chosen_meal_option_id + meal_event_item na mesma transação.
@Injectable()
export class RegistroService {
  private readonly logger = new Logger(RegistroService.name);

  constructor(@Inject(DB) private readonly db: Db) {}

  async registrar(
    patientId: string,
    body: RegistroRequest,
  ): Promise<RegistroResponse> {
    this.logger.log(
      `registrar patient=${patientId} meal=${body?.mealId} intent=${body?.intent}`,
    );
    // 1. Validação estrutural do corpo (sem class-validator: checagem na borda).
    if (!UUID_RE.test(body?.mealId ?? '')) {
      throw new BadRequestException('mealId deve ser UUID');
    }
    if (!INTENTS.includes(body?.intent)) {
      throw new BadRequestException('intent deve ser feito, pulei ou desfazer');
    }
    if (body.dayTypeId !== undefined && !UUID_RE.test(body.dayTypeId)) {
      throw new BadRequestException('dayTypeId deve ser UUID');
    }
    // consumo só faz sentido em "feito" (deriva troquei). Em pulei/desfazer é
    // ignorado pelo core; aqui só validamos a estrutura quando presente.
    if (body.consumo) {
      const { chosenOptionId, items } = body.consumo;
      if (chosenOptionId !== undefined && !UUID_RE.test(chosenOptionId)) {
        throw new BadRequestException('consumo.chosenOptionId deve ser UUID');
      }
      if (items !== undefined) {
        for (const it of items) {
          if (!UUID_RE.test(it?.itemId ?? '')) {
            throw new BadRequestException(
              'consumo.items[].itemId deve ser UUID',
            );
          }
          if (!UUID_RE.test(it?.foodId ?? '')) {
            throw new BadRequestException(
              'consumo.items[].foodId deve ser UUID',
            );
          }
          // gramas ≤ 0 / não-número é integridade de payload (400); o core ainda
          // reconfirma como consumo-invalido (422) na borda do negócio.
          if (typeof it.quantityGrams !== 'number' || it.quantityGrams <= 0) {
            throw new BadRequestException(
              'consumo.items[].quantityGrams deve ser número > 0',
            );
          }
        }
      }
    }

    // weekday e loggedDate vêm da MESMA fonte que o /today (localToday) — sem isso,
    // gravar em UTC e filtrar em local divergiriam na virada de meia-noite e o
    // registro sumiria do /today. Dívida de timezone (relógio do servidor, não o
    // fuso do paciente) documentada em local-date.ts.
    const weekday = new Date().getDay(); // 0=domingo .. 6=sábado
    const loggedDate = localToday();

    return this.db.transaction(async (tx) => {
      // 2. Advisory lock por escopo (paciente, refeição, dia): serializa os
      //    INSERTs do mesmo escopo → created_at estritamente crescente (seq sem
      //    empate). Liberado no fim da transação.
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${patientId} || '|' || ${body.mealId} || '|' || ${loggedDate}))`,
      );

      // 3. Plano ATIVO do paciente.
      const [pln] = await tx
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

      // 4. dayTypeId em vigor: override do corpo (validado pertencer ao plano)
      //    OU o default do weekday (mesma resolução do /today).
      let dayTypeId: string;
      if (body.dayTypeId) {
        const [dt] = await tx
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
        const [sched] = await tx
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

      // 5. PERTENCIMENTO (LGPD FR-017): a refeição-alvo pertence à cadeia
      //    meal → day_type → plan(ativo) → patient. Senão 404 (IDOR cross-patient).
      const [alvoMeal] = await tx
        .select({ id: schema.meal.id })
        .from(schema.meal)
        .innerJoin(schema.dayType, eq(schema.meal.dayTypeId, schema.dayType.id))
        .where(
          and(
            eq(schema.meal.id, body.mealId),
            eq(schema.dayType.planId, pln.id),
          ),
        )
        .limit(1);
      if (!alvoMeal)
        throw new NotFoundException(
          'refeição não pertence ao plano do paciente',
        );

      // 6. Histórico de meal_event do escopo (paciente, refeição, dia),
      //    ordenado por created_at; materializa seq pela ordem → estadoVigente.
      const eventosAlvo = await tx
        .select({
          state: schema.mealEvent.state,
          createdAt: schema.mealEvent.createdAt,
        })
        .from(schema.mealEvent)
        .where(
          and(
            eq(schema.mealEvent.patientId, patientId),
            eq(schema.mealEvent.planId, pln.id),
            eq(schema.mealEvent.mealId, body.mealId),
            eq(schema.mealEvent.loggedDate, loggedDate),
          ),
        )
        .orderBy(asc(schema.mealEvent.createdAt));
      const eventos: EventoRegistro[] = eventosAlvo.map((e, i) => ({
        seq: i,
        state: e.state,
      }));
      const vigente = estadoVigente(eventos);
      this.logger.debug(
        `plano=${pln.id} dayType=${dayTypeId} vigente=${vigente ?? 'nenhum'}`,
      );

      // 7. Resolução de adequação NO BANCO (deriva troquei, FR-003). Só em
      //    intent="feito" com sinais de adequação: opção não-default OU items.
      //    Tudo resolvido no banco (jamais confiar no payload). Resolve também a
      //    opção cumprida (chosenMealOptionId) p/ gravar no evento.
      //
      //    adequacao=null            → feito (US1 intacto: opção default / sem items)
      //    opcao-nao-default         → troquei (chosenOptionId resolve p/ is_default=false)
      //    substituicao-combinacao   → troquei (items resolvidos por grupo no banco)
      let adequacao: Adequacao | null = null;
      // Opção cumprida gravada no evento: default em feito/troquei-por-subst.;
      //   a própria opção não-default em troquei-por-opção.
      let cumpridaMealOptionId: string | null = null;
      // Overlay de consumo por itemId (troquei por substituição/combinação):
      //   o que o paciente comeu NO LUGAR de cada item do plano. Mantém o itemId
      //   p/ casar com os meal_item da opção cumprida no snapshot completo (D3b).
      //   foodId+gramas já validados estruturalmente; vazio = sem substituição.
      let consumoOverlay: ReadonlyArray<{
        readonly itemId: string;
        readonly foodId: string;
        readonly quantityGrams: number;
      }> = [];

      if (body.intent === 'feito' && body.consumo) {
        const { chosenOptionId, items } = body.consumo;

        // 7a. chosenOptionId → carrega is_default validando pertencer à refeição.
        if (chosenOptionId) {
          const [opt] = await tx
            .select({
              id: schema.mealOption.id,
              isDefault: schema.mealOption.isDefault,
            })
            .from(schema.mealOption)
            .where(
              and(
                eq(schema.mealOption.id, chosenOptionId),
                eq(schema.mealOption.mealId, body.mealId),
              ),
            )
            .limit(1);
          if (!opt)
            throw new NotFoundException(
              'opção não pertence à refeição do plano',
            );
          cumpridaMealOptionId = opt.id; // opção cumprida = a escolhida (default ou não)
          if (!opt.isDefault) {
            adequacao = { kind: 'opcao-nao-default', mealOptionId: opt.id };
          }
        }

        // 7b. items → resolve grupos no banco (grupo esperado do item do plano +
        //     grupo do food consumido). Substituição/combinação ⇒ troquei.
        if (items && items.length > 0) {
          const itens: ItemConsumido[] = [];
          for (const it of items) {
            // groupIdEsperado = meal_item.substitutionGroupId, validando que o
            //   item pertence à refeição-alvo (meal_item→meal_option→meal). 404
            //   se não pertence OU se o item do plano não tem grupo (não-trocável).
            const [mi] = await tx
              .select({
                substitutionGroupId: schema.mealItem.substitutionGroupId,
              })
              .from(schema.mealItem)
              .innerJoin(
                schema.mealOption,
                eq(schema.mealItem.mealOptionId, schema.mealOption.id),
              )
              .where(
                and(
                  eq(schema.mealItem.id, it.itemId),
                  eq(schema.mealOption.mealId, body.mealId),
                ),
              )
              .limit(1);
            if (!mi || mi.substitutionGroupId == null)
              throw new NotFoundException(
                'item do plano não pertence à refeição ou não é trocável',
              );

            // groupId do food consumido via food_substitution_group. 404 se o
            //   food não tem grupo (não dá p/ classificar pertencimento).
            const [fsg] = await tx
              .select({ groupId: schema.foodSubstitutionGroup.groupId })
              .from(schema.foodSubstitutionGroup)
              .where(eq(schema.foodSubstitutionGroup.foodId, it.foodId))
              .limit(1);
            if (!fsg)
              throw new NotFoundException(
                'alimento consumido não pertence a nenhum grupo',
              );

            itens.push({
              groupIdEsperado: mi.substitutionGroupId,
              groupId: fsg.groupId,
              gramas: it.quantityGrams,
            });
          }
          adequacao = { kind: 'substituicao-combinacao', itens };
          consumoOverlay = items.map((it) => ({
            itemId: it.itemId,
            foodId: it.foodId,
            quantityGrams: it.quantityGrams,
          }));
        }
      }

      // 8. Monta o alvo (núcleo): desfazer; senão classificarEstado com a
      //    adequação DB-resolvida (deriva feito/troquei/pulei).
      let alvo: AlvoRegistro;
      if (body.intent === 'desfazer') {
        alvo = { kind: 'desfazer' };
      } else {
        const classificado = classificarEstado({
          marcacao: body.intent === 'feito' ? 'consumiu' : 'nao-consumiu',
          adequacao,
        });
        if (!classificado.ok) {
          throw match(classificado.error)
            .with(
              { kind: 'consumo-fora-do-grupo' },
              () =>
                new UnprocessableEntityException(
                  'alimento consumido fora do grupo do item',
                ),
            )
            .with(
              { kind: 'consumo-invalido' },
              () => new UnprocessableEntityException('consumo inválido'),
            )
            .exhaustive();
        }
        alvo = { kind: 'marcar', estado: classificado.value };
      }

      // 9. Idempotência alvo-vs-vigente (núcleo). no-op → não insere.
      const decisao = decidirRegistro({ vigente, alvo });
      this.logger.debug(
        `decisão=${decisao.kind}${decisao.kind === 'inserir' ? ` state=${decisao.state}` : ' (no-op idempotente)'}`,
      );
      if (decisao.kind === 'inserir') {
        // chosen_meal_option_id: a opção cumprida (snapshot auto-contido),
        //   gravada em feito E troquei; NULL em pulei/desfazer.
        //   - troquei-por-opção → a própria opção não-default (cumpridaMealOptionId).
        //   - feito / troquei-por-substituição → a opção default da refeição.
        let chosenMealOptionId: string | null = null;
        if (decisao.state === 'feito' || decisao.state === 'troquei') {
          if (cumpridaMealOptionId) {
            chosenMealOptionId = cumpridaMealOptionId;
          } else {
            const [defaultOpt] = await tx
              .select({ id: schema.mealOption.id })
              .from(schema.mealOption)
              .where(
                and(
                  eq(schema.mealOption.mealId, body.mealId),
                  eq(schema.mealOption.isDefault, true),
                ),
              )
              .limit(1);
            chosenMealOptionId = defaultOpt?.id ?? null;
          }
        }

        const [evento] = await tx
          .insert(schema.mealEvent)
          .values({
            patientId,
            planId: pln.id,
            mealId: body.mealId,
            dayTypeId,
            chosenMealOptionId,
            state: decisao.state,
            loggedDate,
          })
          .returning({ id: schema.mealEvent.id });

        // troquei: grava o SNAPSHOT COMPLETO do consumo (D3b) — TODOS os itens
        //   da refeição como comidos, não só os trocados. Torna o total do
        //   troquei = soma(meal_event_item) exato. feito/pulei/desfazer não geram
        //   filhas. Carrega na MESMA transação os meal_item da opção cumprida.
        if (decisao.state === 'troquei' && chosenMealOptionId) {
          // Itens planejados da opção cumprida (snapshot base).
          const planItems = await tx
            .select({
              id: schema.mealItem.id,
              foodId: schema.mealItem.foodId,
              quantityGrams: schema.mealItem.quantityGrams,
            })
            .from(schema.mealItem)
            .where(eq(schema.mealItem.mealOptionId, chosenMealOptionId));

          // itemIds com overlay (substituição/combinação). Vazio em troquei por
          //   opção não-default → snapshot = a opção inteira sem overlay.
          const overlaidItemIds = new Set(consumoOverlay.map((o) => o.itemId));

          const snapshotRows = planItems.flatMap((pi) => {
            const overlay = consumoOverlay.filter((o) => o.itemId === pi.id);
            // item trocado → TODAS as entradas de consumo desse itemId (1..N,
            //   combinação 1→2 = 2 linhas); item mantido (travado/flexível
            //   não-trocado) → a linha planejada (foodId + gramas).
            return overlaidItemIds.has(pi.id)
              ? overlay.map((o) => ({
                  foodId: o.foodId,
                  quantityGrams: o.quantityGrams,
                }))
              : [{ foodId: pi.foodId, quantityGrams: pi.quantityGrams }];
          });

          if (snapshotRows.length > 0) {
            await tx.insert(schema.mealEventItem).values(
              snapshotRows.map((r) => ({
                mealEventId: evento.id,
                foodId: r.foodId,
                quantityGrams: r.quantityGrams,
              })),
            );
          }
        }
      }

      // 10. Re-derivar "o agora": todas as refeições do dia (mesma ordem do plano)
      //    + estado vigente de cada uma após a operação.
      const refeicoesDoDia = await tx
        .select({ id: schema.meal.id, position: schema.meal.position })
        .from(schema.meal)
        .where(eq(schema.meal.dayTypeId, dayTypeId))
        .orderBy(asc(schema.meal.position));
      const mealIds = refeicoesDoDia.map((m) => m.id);

      const eventosDoDia =
        mealIds.length === 0
          ? []
          : await tx
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
              )
              .orderBy(asc(schema.mealEvent.createdAt));

      // Agrupa por mealId preservando a ordem por created_at → seq materializado.
      const eventosPorMeal = new Map<string, EventoRegistro[]>();
      eventosDoDia.forEach((e) => {
        const lista = eventosPorMeal.get(e.mealId) ?? [];
        lista.push({ seq: lista.length, state: e.state });
        eventosPorMeal.set(e.mealId, lista);
      });

      const vigentes = refeicoesDoDia.map((m) => ({
        mealId: m.id,
        estado: estadoVigente(eventosPorMeal.get(m.id) ?? []),
      }));

      const oAgora = derivarOAgora({
        refeicoes: refeicoesDoDia.map((m) => ({
          mealId: m.id,
          ordem: m.position,
        })),
        vigentes,
      });

      // 10. Estado vigente do alvo após a operação (para o response).
      const vigenteAlvo =
        vigentes.find((v) => v.mealId === body.mealId)?.estado ?? null;

      // 11. Mapper puro → DTO (sem entidade crua, sem número).
      return toRegistroResponse({
        mealId: body.mealId,
        loggedDate,
        vigente: vigenteAlvo,
        oAgora,
      });
    });
  }
}

import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { match } from 'ts-pattern';
import {
  classificarEstado,
  decidirRegistro,
  derivarOAgora,
  estadoVigente,
  type AlvoRegistro,
  type EventoRegistro,
} from '@bamboo/core';
import { and, asc, eq, inArray, schema, sql } from '@bamboo/db';
import type { RegistroRequest, RegistroResponse } from '@bamboo/types';
import { DB, type Db } from '../db/db.module';
import { localToday } from '../local-date';
import { toRegistroResponse } from './registro.mapper';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const INTENTS = ['feito', 'pulei', 'desfazer'] as const;

// Casca imperativa (US1): I/O via Drizzle dentro de db.transaction + advisory
// lock por (paciente, refeição, dia), orquestra o núcleo puro (classificarEstado,
// estadoVigente, decidirRegistro, derivarOAgora), persiste append-only e converte
// Result/ausências → HttpException na borda (opção 1). Sem serializar entidade
// crua (mapper puro). US1 trata só feito|pulei|desfazer — consumo.items é US2.
@Injectable()
export class RegistroService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async registrar(
    patientId: string,
    body: RegistroRequest,
  ): Promise<RegistroResponse> {
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

      // 7. Monta o alvo (US1: feito|pulei|desfazer). troquei/itens é US2 —
      //    consumo.items é ignorado nesta task.
      let alvo: AlvoRegistro;
      if (body.intent === 'desfazer') {
        alvo = { kind: 'desfazer' };
      } else {
        const classificado = classificarEstado({
          marcacao: body.intent === 'feito' ? 'consumiu' : 'nao-consumiu',
          adequacao: null,
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

      // 8. Idempotência alvo-vs-vigente (núcleo). no-op → não insere.
      const decisao = decidirRegistro({ vigente, alvo });
      if (decisao.kind === 'inserir') {
        // chosen_meal_option_id: a opção default da refeição quando feito
        //   (snapshot da opção cumprida); NULL em pulei/desfazer.
        let chosenMealOptionId: string | null = null;
        if (decisao.state === 'feito') {
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

        await tx.insert(schema.mealEvent).values({
          patientId,
          planId: pln.id,
          mealId: body.mealId,
          dayTypeId,
          chosenMealOptionId,
          state: decisao.state,
          loggedDate,
        });
      }

      // 9. Re-derivar "o agora": todas as refeições do dia (mesma ordem do plano)
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

// Casca da Feature 007 — orquestra o ciclo: carrega estado (I/O), delega as
// regras ao núcleo puro (decidirAbertura/decidirFechamento/atribuirCiclo) e
// executa as ESCRITAS em db.transaction. O ciclo OBSERVA a vigência: trocar o
// plano ativo é o ato (ativarPlano) que flipa is_active e grava a linha do
// tempo no ciclo aberto — uma fonte de verdade sobre o presente (D2).
// Fechar NUNCA toca dado cru (meal_event/meal_event_item intactos — SC-004).
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { decidirAbertura, type CicloJanela } from '@bamboo/core';
import { and, eq, isNull, schema } from '@bamboo/db';
import { DB, type Db } from '../db/db.module';
import { localToday } from '../local-date';
import {
  toAberturaResponse,
  toVigenciaDto,
  type AberturaResponse,
} from './ciclo.mapper';

@Injectable()
export class CicloService {
  constructor(@Inject(DB) private readonly db: Db) {}

  // ───────────── escrita: abrir (US1) ─────────────

  async abrir(
    patientId: string,
    expectedDurationDays: unknown,
  ): Promise<AberturaResponse> {
    // Validação estrutural na borda (padrão da casca).
    const duracaoDias =
      typeof expectedDurationDays === 'number' ? expectedDurationDays : NaN;

    const [pat] = await this.db
      .select({ id: schema.patient.id })
      .from(schema.patient)
      .where(eq(schema.patient.id, patientId))
      .limit(1);
    if (!pat) throw new NotFoundException('paciente não encontrado');

    const [planoAtivo] = await this.db
      .select({ id: schema.plan.id })
      .from(schema.plan)
      .where(
        and(
          eq(schema.plan.patientId, patientId),
          eq(schema.plan.isActive, true),
        ),
      )
      .limit(1);
    if (!planoAtivo) {
      // Abrir ciclo pressupõe consulta + plano (não há o que vincular).
      throw new UnprocessableEntityException(
        'paciente sem plano ativo — defina o plano antes de abrir o ciclo',
      );
    }

    const cicloAtivo = await this.cicloAtivoDe(patientId);
    const hoje = localToday();

    const decisao = decidirAbertura({
      cicloAtivo,
      hoje,
      duracaoDias,
    });
    if (!decisao.ok) {
      throw new BadRequestException(
        'expectedDurationDays obrigatório: inteiro > 0 (em dias)',
      );
    }

    return this.db.transaction(async (tx) => {
      let fechouAnterior: { id: string; closedOn: string } | null = null;
      if (decisao.value.fecharAnteriorEm !== null && cicloAtivo) {
        const em = decisao.value.fecharAnteriorEm;
        await tx
          .update(schema.cycle)
          .set({ closedOn: em })
          .where(eq(schema.cycle.id, cicloAtivo.id));
        await tx
          .update(schema.cyclePlanVigencia)
          .set({ validTo: em })
          .where(
            and(
              eq(schema.cyclePlanVigencia.cycleId, cicloAtivo.id),
              isNull(schema.cyclePlanVigencia.validTo),
            ),
          );
        fechouAnterior = { id: cicloAtivo.id, closedOn: em };
      }

      const [novo] = await tx
        .insert(schema.cycle)
        .values({
          patientId,
          startedOn: hoje,
          expectedDurationDays: duracaoDias,
        })
        .returning({
          id: schema.cycle.id,
          startedOn: schema.cycle.startedOn,
          expectedDurationDays: schema.cycle.expectedDurationDays,
          closedOn: schema.cycle.closedOn,
        });

      // Vigência inicial = plano ativo no ato de abrir (D2).
      const [vig] = await tx
        .insert(schema.cyclePlanVigencia)
        .values({ cycleId: novo.id, planId: planoAtivo.id, validFrom: hoje })
        .returning({
          planId: schema.cyclePlanVigencia.planId,
          validFrom: schema.cyclePlanVigencia.validFrom,
          validTo: schema.cyclePlanVigencia.validTo,
        });

      return toAberturaResponse(novo, [toVigenciaDto(vig)], fechouAnterior);
    });
  }

  // ───────────── helpers ─────────────

  private async cicloAtivoDe(patientId: string): Promise<CicloJanela | null> {
    const [ativo] = await this.db
      .select({
        id: schema.cycle.id,
        startedOn: schema.cycle.startedOn,
        closedOn: schema.cycle.closedOn,
        createdAt: schema.cycle.createdAt,
      })
      .from(schema.cycle)
      .where(
        and(
          eq(schema.cycle.patientId, patientId),
          isNull(schema.cycle.closedOn),
        ),
      )
      .limit(1);
    if (!ativo) return null;
    return {
      id: ativo.id,
      startedOn: ativo.startedOn,
      closedOn: ativo.closedOn,
      createdAtMs: ativo.createdAt.getTime(),
    };
  }
}

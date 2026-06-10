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
import {
  atribuirCiclo,
  decidirAbertura,
  decidirFechamento,
  estadoVigente,
  type CicloJanela,
  type EstadoRegistro,
  type EventoRegistro,
} from '@bamboo/core';
import { and, asc, eq, gte, inArray, isNull, lte, schema } from '@bamboo/db';
import { DB, type Db } from '../db/db.module';
import { localToday } from '../local-date';
import {
  toAberturaResponse,
  toCicloDto,
  toVigenciaDto,
  type AberturaResponse,
  type AtribuicaoResponse,
  type CicloDetalheResponse,
  type CicloDto,
  type FechamentoResponse,
  type RegistroDoPeriodoDto,
} from './ciclo.mapper';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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

  // ───────────── escrita: fechar (US2) ─────────────

  async fechar(patientId: string): Promise<FechamentoResponse> {
    await this.exigirPaciente(patientId);
    const cicloAtivo = await this.cicloAtivoDe(patientId);
    const decisao = decidirFechamento({ cicloAtivo, hoje: localToday() });

    if (decisao.kind === 'no-op-orientado') return decisao;

    const ativo = cicloAtivo as CicloJanela;
    return this.db.transaction(async (tx) => {
      const [fechado] = await tx
        .update(schema.cycle)
        .set({ closedOn: decisao.em })
        .where(eq(schema.cycle.id, ativo.id))
        .returning({
          id: schema.cycle.id,
          startedOn: schema.cycle.startedOn,
          expectedDurationDays: schema.cycle.expectedDurationDays,
          closedOn: schema.cycle.closedOn,
        });
      await tx
        .update(schema.cyclePlanVigencia)
        .set({ validTo: decisao.em })
        .where(
          and(
            eq(schema.cyclePlanVigencia.cycleId, ativo.id),
            isNull(schema.cyclePlanVigencia.validTo),
          ),
        );
      const vigencias = await tx
        .select({
          planId: schema.cyclePlanVigencia.planId,
          validFrom: schema.cyclePlanVigencia.validFrom,
          validTo: schema.cyclePlanVigencia.validTo,
        })
        .from(schema.cyclePlanVigencia)
        .where(eq(schema.cyclePlanVigencia.cycleId, ativo.id))
        .orderBy(asc(schema.cyclePlanVigencia.validFrom));
      return toCicloDto(fechado, vigencias.map(toVigenciaDto));
    });
  }

  // ───────────── escrita: ativar plano — o ato observado (US2/D2) ─────────────

  async ativarPlano(
    patientId: string,
    planIdRaw: unknown,
  ): Promise<{ planId: string; jaAtivo: boolean }> {
    await this.exigirPaciente(patientId);
    const planId = typeof planIdRaw === 'string' ? planIdRaw : '';
    const [alvo] = await this.db
      .select({ id: schema.plan.id, isActive: schema.plan.isActive })
      .from(schema.plan)
      .where(
        and(eq(schema.plan.id, planId), eq(schema.plan.patientId, patientId)),
      )
      .limit(1);
    if (!alvo) throw new NotFoundException('plano não encontrado no paciente');
    if (alvo.isActive) return { planId, jaAtivo: true }; // no-op idempotente

    const cicloAtivo = await this.cicloAtivoDe(patientId);
    const hoje = localToday();

    await this.db.transaction(async (tx) => {
      // Uma fonte de verdade sobre o presente: o plano ativo.
      await tx
        .update(schema.plan)
        .set({ isActive: false })
        .where(
          and(
            eq(schema.plan.patientId, patientId),
            eq(schema.plan.isActive, true),
          ),
        );
      await tx
        .update(schema.plan)
        .set({ isActive: true })
        .where(eq(schema.plan.id, planId));

      // O ciclo OBSERVA: com ciclo aberto, o ato grava a linha do tempo.
      if (cicloAtivo) {
        await tx
          .update(schema.cyclePlanVigencia)
          .set({ validTo: hoje })
          .where(
            and(
              eq(schema.cyclePlanVigencia.cycleId, cicloAtivo.id),
              isNull(schema.cyclePlanVigencia.validTo),
            ),
          );
        await tx.insert(schema.cyclePlanVigencia).values({
          cycleId: cicloAtivo.id,
          planId,
          validFrom: hoje,
        });
      }
    });

    return { planId, jaAtivo: false };
  }

  // ───────────── leituras (US3) ─────────────

  async linhaDoTempo(patientId: string): Promise<{ cycles: CicloDto[] }> {
    await this.exigirPaciente(patientId);
    const ciclos = await this.db
      .select({
        id: schema.cycle.id,
        startedOn: schema.cycle.startedOn,
        expectedDurationDays: schema.cycle.expectedDurationDays,
        closedOn: schema.cycle.closedOn,
      })
      .from(schema.cycle)
      .where(eq(schema.cycle.patientId, patientId))
      .orderBy(asc(schema.cycle.startedOn), asc(schema.cycle.createdAt));
    const vigencias = await this.vigenciasDe(ciclos.map((c) => c.id));
    return {
      cycles: ciclos.map((c) => toCicloDto(c, vigencias.get(c.id) ?? [])),
    };
  }

  async detalhe(
    patientId: string,
    cycleId: string,
  ): Promise<CicloDetalheResponse> {
    await this.exigirPaciente(patientId);
    const [ciclo] = await this.db
      .select({
        id: schema.cycle.id,
        startedOn: schema.cycle.startedOn,
        expectedDurationDays: schema.cycle.expectedDurationDays,
        closedOn: schema.cycle.closedOn,
      })
      .from(schema.cycle)
      .where(
        and(
          eq(schema.cycle.id, cycleId),
          eq(schema.cycle.patientId, patientId),
        ),
      )
      .limit(1);
    if (!ciclo) throw new NotFoundException('ciclo não encontrado no paciente');

    const vigencias = await this.vigenciasDe([ciclo.id]);
    const registros = await this.registrosDaJanela(
      patientId,
      ciclo.startedOn,
      ciclo.closedOn ?? localToday(),
    );
    return {
      ...toCicloDto(ciclo, vigencias.get(ciclo.id) ?? []),
      registros,
    };
  }

  async cicloDoDia(
    patientId: string,
    dateRaw: unknown,
  ): Promise<AtribuicaoResponse> {
    const date = typeof dateRaw === 'string' ? dateRaw : '';
    if (!DATE_RE.test(date)) {
      throw new BadRequestException('date obrigatória no formato YYYY-MM-DD');
    }
    await this.exigirPaciente(patientId);
    const ciclos = await this.db
      .select({
        id: schema.cycle.id,
        startedOn: schema.cycle.startedOn,
        closedOn: schema.cycle.closedOn,
        createdAt: schema.cycle.createdAt,
      })
      .from(schema.cycle)
      .where(eq(schema.cycle.patientId, patientId));
    const janelas: CicloJanela[] = ciclos.map((c) => ({
      id: c.id,
      startedOn: c.startedOn,
      closedOn: c.closedOn,
      createdAtMs: c.createdAt.getTime(),
    }));
    return { date, cycleId: atribuirCiclo(janelas, date) }; // núcleo decide (FR-009)
  }

  // ───────────── helpers ─────────────

  private async exigirPaciente(patientId: string): Promise<void> {
    const [pat] = await this.db
      .select({ id: schema.patient.id })
      .from(schema.patient)
      .where(eq(schema.patient.id, patientId))
      .limit(1);
    if (!pat) throw new NotFoundException('paciente não encontrado');
  }

  private async vigenciasDe(
    cycleIds: readonly string[],
  ): Promise<Map<string, ReturnType<typeof toVigenciaDto>[]>> {
    const mapa = new Map<string, ReturnType<typeof toVigenciaDto>[]>();
    if (cycleIds.length === 0) return mapa;
    const linhas = await this.db
      .select({
        cycleId: schema.cyclePlanVigencia.cycleId,
        planId: schema.cyclePlanVigencia.planId,
        validFrom: schema.cyclePlanVigencia.validFrom,
        validTo: schema.cyclePlanVigencia.validTo,
      })
      .from(schema.cyclePlanVigencia)
      .where(inArray(schema.cyclePlanVigencia.cycleId, [...cycleIds]))
      .orderBy(asc(schema.cyclePlanVigencia.validFrom));
    for (const l of linhas) {
      const lista = mapa.get(l.cycleId) ?? [];
      lista.push(toVigenciaDto(l));
      mapa.set(l.cycleId, lista);
    }
    return mapa;
  }

  // Registros do período (FR-010/D6): estado vigente por (data, refeição) —
  // anulados não aparecem. Type/plan-agnostic: tudo do paciente nas datas.
  private async registrosDaJanela(
    patientId: string,
    from: string,
    to: string,
  ): Promise<RegistroDoPeriodoDto[]> {
    const eventos = await this.db
      .select({
        mealId: schema.mealEvent.mealId,
        position: schema.meal.position,
        state: schema.mealEvent.state,
        loggedDate: schema.mealEvent.loggedDate,
        createdAt: schema.mealEvent.createdAt,
      })
      .from(schema.mealEvent)
      .innerJoin(schema.meal, eq(schema.mealEvent.mealId, schema.meal.id))
      .where(
        and(
          eq(schema.mealEvent.patientId, patientId),
          gte(schema.mealEvent.loggedDate, from),
          lte(schema.mealEvent.loggedDate, to),
        ),
      )
      .orderBy(asc(schema.mealEvent.createdAt));

    type Bruto = (typeof eventos)[number];
    const porDiaMeal = new Map<string, Bruto[]>();
    for (const e of eventos) {
      const key = `${e.loggedDate}|${e.mealId}`;
      const lista = porDiaMeal.get(key) ?? [];
      lista.push(e);
      porDiaMeal.set(key, lista);
    }

    const registros: RegistroDoPeriodoDto[] = [];
    for (const lista of porDiaMeal.values()) {
      const eventosCore: EventoRegistro[] = lista.map((e) => ({
        seq: e.createdAt.getTime(),
        state: e.state,
      }));
      const state: EstadoRegistro | null = estadoVigente(eventosCore);
      if (state === null) continue;
      const ultimo = lista.reduce((maior, e) =>
        e.createdAt.getTime() > maior.createdAt.getTime() ? e : maior,
      );
      registros.push({
        date: ultimo.loggedDate,
        mealId: ultimo.mealId,
        position: ultimo.position,
        state,
      });
    }
    return registros.sort(
      (a, b) => a.date.localeCompare(b.date) || a.position - b.position,
    );
  }

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

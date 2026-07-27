// Casca do editor de plano (017): plano, tipo-de-dia e a semana.
//
// Só I/O + orquestração. A montagem do grafo é pura (`plano.leitura.ts`), a
// validação de borda é pura (`validar.ts`) e a exclusão é uma composição de
// funções de `cascata.ts`. Nada aqui calcula nutrição: `packages/core` não é
// tocado por esta feature (FR-003).
import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNull, schema, sql } from '@bamboo/db';
import type { PlanoDto, PlanoTipoDiaDto, PlanosResponse } from '@bamboo/types';
import { DB, type Db } from '../db/db.module';
import {
  apagarGrafoDosPlanos,
  apagarTiposDeDia,
  mealIdsDosTipos,
  recusar,
  temRegistroNasRefeicoes,
  type Tx,
} from './cascata';
import { carregarPlano } from './plano.leitura';
import { inteiroEntre, presente, texto } from './validar';

export interface DiaDaSemanaBody {
  readonly weekday?: unknown;
  readonly dayTypeId?: unknown;
}

@Injectable()
export class PlanoService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /* ═══════════ plano ═══════════ */

  /**
   * Lista os planos do paciente com o TAMANHO do grafo, não o grafo. A tela de
   * planos precisa saber se o plano tem conteúdo e se a semana está programada
   * (plano sem semana completa não serve ao app do paciente) — e uma listagem
   * que carregasse o grafo de cada plano seria N leituras para exibir N linhas.
   */
  async listarPlanos(patientId: string): Promise<PlanosResponse> {
    await this.exigirPaciente(patientId);

    const rows = await this.db
      .select({
        id: schema.plan.id,
        name: schema.plan.name,
        isActive: schema.plan.isActive,
        createdAt: schema.plan.createdAt,
        dayTypeCount: sql<number>`count(distinct ${schema.dayType.id})::int`,
        mealCount: sql<number>`count(distinct ${schema.meal.id})::int`,
        diasProgramados: sql<number>`count(distinct ${schema.daySchedule.weekday})::int`,
      })
      .from(schema.plan)
      .leftJoin(schema.dayType, eq(schema.dayType.planId, schema.plan.id))
      .leftJoin(schema.meal, eq(schema.meal.dayTypeId, schema.dayType.id))
      .leftJoin(
        schema.daySchedule,
        eq(schema.daySchedule.planId, schema.plan.id),
      )
      .where(eq(schema.plan.patientId, patientId))
      .groupBy(schema.plan.id)
      // Ativo primeiro (é o que importa hoje), depois o mais recente. Desempate
      // por id sempre — a lição do `, id` da 012.
      .orderBy(
        desc(schema.plan.isActive),
        desc(schema.plan.createdAt),
        asc(schema.plan.id),
      );

    return {
      plans: rows.map((r) => ({
        id: r.id,
        name: r.name,
        isActive: r.isActive,
        createdAt: r.createdAt.toISOString(),
        dayTypeCount: r.dayTypeCount,
        mealCount: r.mealCount,
        semanaCompleta: r.diasProgramados === 7,
      })),
    };
  }

  /**
   * Cria o plano VAZIO (FR-004): nem tipo-de-dia, nem refeição, nem semana. É a
   * mesma disciplina da 016 — cadastro que inventa grafo cria plano fantasma.
   *
   * Exceção única e declarada ao FR-004: o PRIMEIRO plano do paciente nasce
   * ativo, porque `plan.is_active` não tem estado "nenhum" e um paciente com
   * plano nenhum ativo é indistinguível de um paciente sem plano. Do segundo em
   * diante nasce inativo: trocar o plano ativo é o ato que o ciclo observa (007)
   * e não pode acontecer como efeito colateral de um cadastro.
   */
  async criarPlano(patientId: string, nameRaw: unknown): Promise<PlanoDto> {
    await this.exigirPaciente(patientId);
    const name = texto(nameRaw, 'name');

    return this.db.transaction(async (tx) => {
      const [existente] = await tx
        .select({ id: schema.plan.id })
        .from(schema.plan)
        .where(eq(schema.plan.patientId, patientId))
        .limit(1);

      const [row] = await tx
        .insert(schema.plan)
        .values({ patientId, name, isActive: existente === undefined })
        .returning({ id: schema.plan.id });

      if (!row) {
        throw new InternalServerErrorException('insert não devolveu o plano');
      }
      return this.exigirPlanoCarregado(tx, row.id);
    });
  }

  detalhePlano(planId: string): Promise<PlanoDto> {
    return this.exigirPlanoCarregado(this.db, planId);
  }

  async atualizarPlano(
    planId: string,
    body: { readonly name?: unknown },
  ): Promise<PlanoDto> {
    await this.exigirPlano(this.db, planId);

    if (presente(body, 'name')) {
      await this.db
        .update(schema.plan)
        .set({ name: texto(body.name, 'name') })
        .where(eq(schema.plan.id, planId));
    }
    return this.exigirPlanoCarregado(this.db, planId);
  }

  /**
   * Exclui o plano e o grafo abaixo. Três bloqueadores, checados nesta ordem
   * porque é a ordem do que é mais grave perder:
   *  1. registro (`meal_event`) — histórico de saúde;
   *  2. vigência de ciclo — a linha do tempo do acompanhamento (007);
   *  3. é o plano ativo de um paciente com ciclo ABERTO — o ciclo aberto
   *     pressupõe plano vigente, e apagá-lo deixaria o app do paciente sem nada.
   */
  async excluirPlano(planId: string): Promise<void> {
    const plano = await this.exigirPlano(this.db, planId);

    await this.db.transaction(async (tx) => {
      const [registro] = await tx
        .select({ id: schema.mealEvent.id })
        .from(schema.mealEvent)
        .where(eq(schema.mealEvent.planId, planId))
        .limit(1);
      if (registro) {
        recusar(
          'este plano tem registro de refeição: é ele que explica o que o paciente já marcou. Crie um plano novo em vez de apagar este.',
        );
      }

      const [vigencia] = await tx
        .select({ id: schema.cyclePlanVigencia.id })
        .from(schema.cyclePlanVigencia)
        .where(eq(schema.cyclePlanVigencia.planId, planId))
        .limit(1);
      if (vigencia) {
        recusar(
          'este plano tem vigência em um ciclo de acompanhamento: apagá-lo abriria um buraco na linha do tempo do ciclo.',
        );
      }

      if (plano.isActive) {
        const [aberto] = await tx
          .select({ id: schema.cycle.id })
          .from(schema.cycle)
          .where(
            and(
              eq(schema.cycle.patientId, plano.patientId),
              isNull(schema.cycle.closedOn),
            ),
          )
          .limit(1);
        if (aberto) {
          recusar(
            'este é o plano ativo de um paciente com ciclo aberto. Ative outro plano antes de apagar este.',
          );
        }
      }

      await apagarGrafoDosPlanos(tx, [planId]);
      await tx.delete(schema.plan).where(eq(schema.plan.id, planId));
    });
  }

  /* ═══════════ tipo-de-dia ═══════════ */

  async criarTipoDia(
    planId: string,
    nameRaw: unknown,
  ): Promise<PlanoTipoDiaDto> {
    await this.exigirPlano(this.db, planId);
    const name = texto(nameRaw, 'name');

    const [row] = await this.db
      .insert(schema.dayType)
      .values({ planId, name })
      .returning({ id: schema.dayType.id, name: schema.dayType.name });

    if (!row) {
      throw new InternalServerErrorException(
        'insert não devolveu o tipo-de-dia',
      );
    }
    // Nasce vazio (FR-004): quem quiser refeições cria refeições.
    return { id: row.id, name: row.name, meals: [] };
  }

  async atualizarTipoDia(
    dayTypeId: string,
    body: { readonly name?: unknown },
  ): Promise<PlanoTipoDiaDto> {
    const { planId } = await this.exigirTipoDia(this.db, dayTypeId);

    if (presente(body, 'name')) {
      await this.db
        .update(schema.dayType)
        .set({ name: texto(body.name, 'name') })
        .where(eq(schema.dayType.id, dayTypeId));
    }

    // Relê pelo grafo em vez de montar à mão: a forma do tipo-de-dia (com as
    // refeições dentro) tem UMA fonte, que é `carregarPlano`.
    const plano = await this.exigirPlanoCarregado(this.db, planId);
    const tipo = plano.dayTypes.find((d) => d.id === dayTypeId);
    if (!tipo) throw new NotFoundException('tipo-de-dia não encontrado');
    return tipo;
  }

  /**
   * Exclui o tipo-de-dia e o que pende abaixo. Recusa se a programação da semana
   * o referencia (a semana ficaria com um dia sem tipo) ou se há registro em
   * alguma refeição sua.
   */
  async excluirTipoDia(dayTypeId: string): Promise<void> {
    await this.exigirTipoDia(this.db, dayTypeId);

    await this.db.transaction(async (tx) => {
      const [naSemana] = await tx
        .select({ id: schema.daySchedule.id })
        .from(schema.daySchedule)
        .where(eq(schema.daySchedule.dayTypeId, dayTypeId))
        .limit(1);
      if (naSemana) {
        recusar(
          'este tipo-de-dia está na programação da semana: reprograme a semana para outro tipo antes de apagá-lo.',
        );
      }

      const mealIds = await mealIdsDosTipos(tx, [dayTypeId]);
      if (await temRegistroNasRefeicoes(tx, mealIds)) {
        recusar(
          'há registro de refeição em uma das refeições deste tipo-de-dia: o histórico não é apagado junto com o plano.',
        );
      }

      await apagarTiposDeDia(tx, [dayTypeId]);
    });
  }

  /* ═══════════ a semana ═══════════ */

  /**
   * A semana é UM objeto, não 7 linhas independentes (D2): uma semana com 6 dias
   * programados é um estado inválido que nenhuma tela deveria poder produzir.
   * Então o `PUT` recebe os 7 pares e substitui a programação inteira.
   */
  async definirSemana(planId: string, daysRaw: unknown): Promise<PlanoDto> {
    await this.exigirPlano(this.db, planId);

    // Forma do payload ⇒ 400 (estrutural). Pertinência ao plano ⇒ 422 (depende
    // do banco). É a fronteira do FR-006/FR-007.
    if (!Array.isArray(daysRaw)) {
      throw new BadRequestException(
        'days deve ser uma lista com os 7 dias da semana',
      );
    }

    const dias = (daysRaw as ReadonlyArray<DiaDaSemanaBody>).map((d, i) => ({
      weekday: inteiroEntre(d?.weekday, `days[${i}].weekday`, 0, 6),
      dayTypeId: texto(d?.dayTypeId, `days[${i}].dayTypeId`, 64),
    }));

    const vistos = new Set(dias.map((d) => d.weekday));
    if (vistos.size !== 7 || dias.length !== 7) {
      throw new BadRequestException(
        `days deve trazer exatamente os 7 dias da semana (0=domingo … 6=sábado), sem repetir — veio ${dias.length} item(ns) cobrindo ${vistos.size} dia(s)`,
      );
    }

    // Pertinência ao plano é validação DE NEGÓCIO (depende do banco): 422, e
    // nunca um 500 por FK. Um tipo-de-dia de outro plano na semana faria o app
    // do paciente montar o dia com refeições que não são dele.
    const alvos = [...new Set(dias.map((d) => d.dayTypeId))];
    const doPlano = await this.db
      .select({ id: schema.dayType.id })
      .from(schema.dayType)
      .where(
        and(
          eq(schema.dayType.planId, planId),
          inArray(schema.dayType.id, alvos),
        ),
      );
    if (doPlano.length !== alvos.length) {
      throw new UnprocessableEntityException(
        'a programação da semana aponta para tipo-de-dia que não pertence a este plano',
      );
    }

    await this.db.transaction(async (tx) => {
      await tx
        .delete(schema.daySchedule)
        .where(eq(schema.daySchedule.planId, planId));
      await tx
        .insert(schema.daySchedule)
        .values(dias.map((d) => ({ planId, ...d })));
    });

    return this.exigirPlanoCarregado(this.db, planId);
  }

  /* ═══════════ resolução / 404 ═══════════ */

  private async exigirPaciente(patientId: string): Promise<void> {
    const [p] = await this.db
      .select({ id: schema.patient.id })
      .from(schema.patient)
      .where(eq(schema.patient.id, patientId))
      .limit(1);
    if (!p) throw new NotFoundException('paciente não encontrado');
  }

  private async exigirPlano(
    tx: Tx,
    planId: string,
  ): Promise<{ id: string; patientId: string; isActive: boolean }> {
    const [p] = await tx
      .select({
        id: schema.plan.id,
        patientId: schema.plan.patientId,
        isActive: schema.plan.isActive,
      })
      .from(schema.plan)
      .where(eq(schema.plan.id, planId))
      .limit(1);
    if (!p) throw new NotFoundException('plano não encontrado');
    return p;
  }

  private async exigirPlanoCarregado(
    tx: Tx,
    planId: string,
  ): Promise<PlanoDto> {
    const dto = await carregarPlano(tx, planId);
    if (!dto) throw new NotFoundException('plano não encontrado');
    return dto;
  }

  private async exigirTipoDia(
    tx: Tx,
    dayTypeId: string,
  ): Promise<{ id: string; planId: string }> {
    const [d] = await tx
      .select({ id: schema.dayType.id, planId: schema.dayType.planId })
      .from(schema.dayType)
      .where(eq(schema.dayType.id, dayTypeId))
      .limit(1);
    if (!d) throw new NotFoundException('tipo-de-dia não encontrado');
    return d;
  }
}

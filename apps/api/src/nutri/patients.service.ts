// Casca da Feature 015 — a roster da nutri. Só leitura, uma query, nenhuma
// régua: quem calcula adesão é a 006, quem monta relatório é a 011.
//
// O "ciclo atual" (D2) é o aberto; se não houver, o fechado mais recente. A
// escolha é feita pela ORDEM da query (o primeiro registro de cada paciente já é
// o vencedor) — ordenação explícita, nunca a ordem que o heap devolver: é a
// mesma lição do `, id` da 012 e do I-2 da 013.
import { Inject, Injectable } from '@nestjs/common';
import type { NutriPatientDto, NutriPatientsResponse } from '@bamboo/types';
import { asc, desc, eq, schema, sql } from '@bamboo/db';
import { DB, type Db } from '../db/db.module';

/** Linha do join: um paciente × (0..n) ciclos. */
interface RosterRow {
  readonly patientId: string;
  readonly name: string;
  readonly cycleId: string | null;
  readonly startedOn: string | null;
  readonly closedOn: string | null;
  readonly expectedDurationDays: number | null;
}

/**
 * Colapsa o join em um DTO por paciente: a PRIMEIRA linha de cada paciente é o
 * ciclo atual (a query já ordenou). Função pura — o teste do endpoint (e2e)
 * cobre a ordem; esta função só descarta o resto.
 */
export function toRoster(
  rows: ReadonlyArray<RosterRow>,
): ReadonlyArray<NutriPatientDto> {
  const vistos = new Set<string>();
  return rows.flatMap((r) => {
    if (vistos.has(r.patientId)) return [];
    vistos.add(r.patientId);
    return [
      {
        id: r.patientId,
        name: r.name,
        // Minimização (FR-004): nada além de nome + ciclo sai daqui.
        cicloAtual:
          r.cycleId === null ||
          r.startedOn === null ||
          r.expectedDurationDays === null
            ? null
            : {
                id: r.cycleId,
                startedOn: r.startedOn,
                closedOn: r.closedOn,
                expectedDurationDays: r.expectedDurationDays,
                aberto: r.closedOn === null,
              },
      },
    ];
  });
}

@Injectable()
export class PatientsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async listar(): Promise<NutriPatientsResponse> {
    const rows = await this.db
      .select({
        patientId: schema.patient.id,
        name: schema.patient.name,
        cycleId: schema.cycle.id,
        startedOn: schema.cycle.startedOn,
        closedOn: schema.cycle.closedOn,
        expectedDurationDays: schema.cycle.expectedDurationDays,
      })
      .from(schema.patient)
      .leftJoin(schema.cycle, eq(schema.cycle.patientId, schema.patient.id))
      .orderBy(
        asc(schema.patient.name),
        asc(schema.patient.id), // desempate de nomes iguais (FR-003)
        // Aberto primeiro (closed_on nulo), depois o fechamento mais recente.
        // NULLS FIRST é explícito de propósito: o default do Postgres para DESC
        // já seria esse, e depender de default é como se perde determinismo.
        sql`${schema.cycle.closedOn} DESC NULLS FIRST`,
        desc(schema.cycle.startedOn),
        asc(schema.cycle.id),
      );

    return { patients: toRoster(rows) };
  }
}

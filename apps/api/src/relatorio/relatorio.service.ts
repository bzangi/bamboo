// Casca da Feature 011 — orquestra o relatório de ciclo: janela do ciclo
// (007, via CicloService.detalhe — 404 herdado) + série de adesão (006, via
// AdesaoService.serie — UMA RÉGUA SÓ, nunca recalculada aqui, FR-003/FR-009)
// + loader novo (padrão de registro esperado/vigente) → agregações puras do
// core. SÓ LEITURA: nenhuma escrita em nenhum caminho (FR-008/SC-006).
import {
  Inject,
  Injectable,
  InternalServerErrorException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  agregarAdesao,
  agregarEstados,
  fatiarSemanas,
  type EstadoRegistro,
  type SlotRegistro,
} from '@bamboo/core';
import type { CycleReportResponse } from '@bamboo/types';
import { AdesaoService } from '../adesao/adesao.service';
import { CicloService } from '../ciclo/ciclo.service';
import { DB, type Db } from '../db/db.module';
import { localToday } from '../local-date';
import { carregarRegistroDaJanela, type DiaRegistro } from './relatorio.loader';
import {
  toCycleReportResponse,
  toCycleWindowDto,
  toSemanaDto,
} from './relatorio.mapper';

const MAX_DIAS = 366; // mesmo teto vigente da consulta de adesão (D8)

// Conta dias inclusive [from..to] por incremento de calendário (setDate) —
// nunca diff de milissegundos (seguro em virada de mês/ano e DST).
const contarDiasInclusive = (from: string, to: string): number => {
  const [y1, m1, d1] = from.split('-').map(Number);
  const [y2, m2, d2] = to.split('-').map(Number);
  const cursor = new Date(y1, m1 - 1, d1);
  const fim = new Date(y2, m2 - 1, d2);
  let dias = 0;
  while (cursor.getTime() <= fim.getTime()) {
    dias++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return dias;
};

const slotsDoDia = (dia: DiaRegistro): SlotRegistro[] =>
  dia.refeicoesEsperadas.map((refeicao) => {
    const state: EstadoRegistro | null =
      dia.vigentesPorPosition.get(refeicao.position) ?? null;
    return { position: refeicao.position, nome: refeicao.nome, state };
  });

// Slots (refeição esperada × dia) pro agregador de estados do core (D9),
// recortados por intervalo — usado tanto pro ciclo inteiro quanto por semana.
const slotsNoIntervalo = (
  registroPorDia: ReadonlyMap<string, DiaRegistro>,
  from: string,
  to: string,
): SlotRegistro[] => {
  const slots: SlotRegistro[] = [];
  for (const [date, dia] of registroPorDia.entries()) {
    if (date >= from && date <= to) slots.push(...slotsDoDia(dia));
  }
  return slots;
};

@Injectable()
export class RelatorioService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly cicloService: CicloService,
    private readonly adesaoService: AdesaoService,
  ) {}

  async report(
    patientId: string,
    cycleId: string,
  ): Promise<CycleReportResponse> {
    const detalhe = await this.cicloService.detalhe(patientId, cycleId); // 404 herdado
    const hoje = localToday();
    const from = detalhe.startedOn;
    const to = detalhe.closedOn ?? hoje; // aberto: janela até hoje (A2)

    if (contarDiasInclusive(from, to) > MAX_DIAS) {
      throw new UnprocessableEntityException(
        `janela efetiva do ciclo acima de ${MAX_DIAS} dias — feche o ciclo ou abra um novo`,
      );
    }

    const [serie, registroPorDia] = await Promise.all([
      this.adesaoService.serie(patientId, from, to),
      carregarRegistroDaJanela(this.db, {
        patientId,
        from,
        to,
        vigencias: detalhe.vigencias,
        hoje,
      }),
    ]);

    const adesao = agregarAdesao(serie.days);
    const registro = agregarEstados(slotsNoIntervalo(registroPorDia, from, to));

    const semanasResult = fatiarSemanas(from, to);
    if (!semanasResult.ok) {
      // Estruturalmente inalcançável: from ≤ to garantido por construção
      // (from = startedOn, to = closedOn ?? hoje — sempre ≥ startedOn).
      throw new InternalServerErrorException('relatório: janela inválida');
    }
    const semanas = semanasResult.value.map((slice) => {
      const diasDaSemana = serie.days.filter(
        (d) => d.date >= slice.from && d.date <= slice.to,
      );
      const adesaoSemana = agregarAdesao(diasDaSemana);
      const registroSemana = agregarEstados(
        slotsNoIntervalo(registroPorDia, slice.from, slice.to),
      );
      return toSemanaDto(slice, adesaoSemana, registroSemana.totais);
    });

    return toCycleReportResponse({
      cycle: toCycleWindowDto({
        id: detalhe.id,
        startedOn: detalhe.startedOn,
        closedOn: detalhe.closedOn,
        expectedDurationDays: detalhe.expectedDurationDays,
        from,
        to,
      }),
      adesao,
      registro,
      semanas,
      comparativo: null, // US3 (T015) completa
    });
  }
}

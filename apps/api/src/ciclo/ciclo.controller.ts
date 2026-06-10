// Via da NUTRI (FR-013/FR-014): operações de ciclo sob /nutri + NutriKeyGuard.
// Nenhuma superfície do paciente expõe ciclo. Controller fino (padrão da casca).
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { NutriKeyGuard } from '../nutri/nutri-key.guard';
import { CicloService } from './ciclo.service';
import type {
  AberturaResponse,
  AtribuicaoResponse,
  CicloDetalheResponse,
  CicloDto,
  FechamentoResponse,
} from './ciclo.mapper';

@ApiTags('Ciclo (só nutri)')
@Controller('nutri')
@UseGuards(NutriKeyGuard)
@ApiHeader({
  name: 'x-nutri-key',
  required: true,
  description: 'credencial stub da nutri (env NUTRI_API_KEY; fail-closed)',
})
export class CicloController {
  constructor(private readonly cicloService: CicloService) {}

  @Post('patients/:patientId/cycles')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Abrir o ciclo de acompanhamento (consulta)',
    description:
      'Cria o ciclo ativo do paciente com duração prevista OBRIGATÓRIA (dias) e grava a vigência inicial (= plano ativo). Se há ciclo ativo, ele é fechado automaticamente neste ato (A+C — nunca sobrepõe). Invisível ao paciente.',
  })
  @ApiParam({ name: 'patientId', format: 'uuid' })
  @ApiCreatedResponse({ description: 'ciclo aberto + vigência inicial' })
  @ApiBadRequestResponse({ description: 'expectedDurationDays inválida' })
  @ApiUnprocessableEntityResponse({ description: 'paciente sem plano ativo' })
  @ApiNotFoundResponse({ description: 'paciente não encontrado' })
  @ApiForbiddenResponse({ description: 'x-nutri-key ausente/errada' })
  abrir(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() body: { expectedDurationDays?: unknown },
  ): Promise<AberturaResponse> {
    return this.cicloService.abrir(patientId, body?.expectedDurationDays);
  }

  @Post('patients/:patientId/cycles/close')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Fechar o ciclo ativo (reavaliação)',
    description:
      'Delimita a janela [início, fim] sem tocar nenhum dado cru (registros intactos). Sem ciclo ativo → no-op orientado (nunca erro destrutivo). Prazo vencido não fecha sozinho — fechar é sempre um ato.',
  })
  @ApiParam({ name: 'patientId', format: 'uuid' })
  fechar(
    @Param('patientId', ParseUUIDPipe) patientId: string,
  ): Promise<FechamentoResponse> {
    return this.cicloService.fechar(patientId);
  }

  @Post('patients/:patientId/active-plan')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Ativar um plano do paciente (o ato que o ciclo observa)',
    description:
      'Troca o plano ativo (única fonte de verdade do presente). Com ciclo aberto, grava a vigência na linha do tempo do ciclo (replanejar no meio = nova vigência no MESMO ciclo). Já ativo → no-op.',
  })
  @ApiParam({ name: 'patientId', format: 'uuid' })
  @ApiNotFoundResponse({ description: 'plano não pertence ao paciente' })
  ativarPlano(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() body: { planId?: unknown },
  ): Promise<{ planId: string; jaAtivo: boolean }> {
    return this.cicloService.ativarPlano(patientId, body?.planId);
  }

  @Get('patients/:patientId/cycles')
  @ApiOperation({
    summary: 'Linha do tempo de acompanhamento (ciclos + vigências)',
  })
  @ApiParam({ name: 'patientId', format: 'uuid' })
  linhaDoTempo(
    @Param('patientId', ParseUUIDPipe) patientId: string,
  ): Promise<{ cycles: CicloDto[] }> {
    return this.cicloService.linhaDoTempo(patientId);
  }

  @Get('patients/:patientId/cycles/:cycleId')
  @ApiOperation({
    summary: 'Detalhe do ciclo: janela + vigências + registros do período',
    description:
      'Registros = estado vigente por (data, refeição) — anulados não aparecem. Nenhuma métrica aqui (adesão/relatório calculam sobre a janela).',
  })
  @ApiParam({ name: 'patientId', format: 'uuid' })
  @ApiParam({ name: 'cycleId', format: 'uuid' })
  detalhe(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Param('cycleId', ParseUUIDPipe) cycleId: string,
  ): Promise<CicloDetalheResponse> {
    return this.cicloService.detalhe(patientId, cycleId);
  }

  @Get('patients/:patientId/cycle-do-dia')
  @ApiOperation({
    summary: 'Atribuição: a qual ciclo um dia pertence (um ou nenhum)',
    description:
      'Determinística (FR-009). Fronteira fechou-e-reabriu → o ciclo aberto mais recentemente. Dia fora de qualquer janela → cycleId null (histórico fora de ciclo).',
  })
  @ApiParam({ name: 'patientId', format: 'uuid' })
  @ApiQuery({ name: 'date', example: '2026-06-10' })
  cicloDoDia(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Query('date') date?: string,
  ): Promise<AtribuicaoResponse> {
    return this.cicloService.cicloDoDia(patientId, date);
  }
}

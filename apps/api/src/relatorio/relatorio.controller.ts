// Via da NUTRI (FR-001): a feature que vende, atrás do NutriKeyGuard. Único
// endpoint desta feature; controller fino, orquestração no service.
import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import {
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { CycleReportResponse } from '@bamboo/types';
import { NutriKeyGuard } from '../nutri/nutri-key.guard';
import { RelatorioService } from './relatorio.service';

@ApiTags('Relatório de ciclo (só nutri)')
@Controller('nutri')
@UseGuards(NutriKeyGuard)
@ApiHeader({
  name: 'x-nutri-key',
  required: true,
  description: 'credencial stub da nutri (env NUTRI_API_KEY; fail-closed)',
})
export class RelatorioController {
  constructor(private readonly relatorioService: RelatorioService) {}

  @Get('patients/:patientId/cycles/:cycleId/report')
  @ApiOperation({
    summary:
      'Relatório do ciclo: adesão + padrão de registro + evolução semanal + comparativo',
    description:
      'Composição derivada (nada persiste): janela do ciclo (007) + adesão agregada pela MESMA régua da 006 (nunca recalculada) + padrão de troquei/pulei por refeição + série semanal relativa ao início + comparativo com o ciclo anterior (quando existe). Ciclo aberto → relatório parcial (início→hoje). Ciclo sem registros → válido, nunca erro.',
  })
  @ApiParam({ name: 'patientId', format: 'uuid' })
  @ApiParam({ name: 'cycleId', format: 'uuid' })
  @ApiOkResponse({ description: 'relatório completo do ciclo' })
  @ApiForbiddenResponse({ description: 'x-nutri-key ausente/errada' })
  @ApiNotFoundResponse({ description: 'paciente ou ciclo não encontrado' })
  @ApiUnprocessableEntityResponse({
    description: 'janela efetiva do ciclo acima do teto de 366 dias',
  })
  report(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Param('cycleId', ParseUUIDPipe) cycleId: string,
  ): Promise<CycleReportResponse> {
    return this.relatorioService.report(patientId, cycleId);
  }
}

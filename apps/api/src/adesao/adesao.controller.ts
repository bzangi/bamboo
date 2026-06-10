// Via da NUTRI (FR-016): namespace /nutri, atrás do NutriKeyGuard. A única
// superfície que serializa adesão. Controller fino — validação de formato e
// orquestração no service (padrão da casca).
import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { AdesaoService } from './adesao.service';
import { NutriKeyGuard } from '../nutri/nutri-key.guard';
import type { SerieAdesaoResponse } from './adesao.mapper';

@ApiTags('Adesão (só nutri)')
@Controller('nutri')
@UseGuards(NutriKeyGuard)
export class AdesaoController {
  constructor(private readonly adesaoService: AdesaoService) {}

  @Get('patients/:patientId/adesao')
  @ApiOperation({
    summary: 'Série de adesão por dia + média do período (visível só à nutri)',
    description:
      'Derivada sob demanda do registro vigente (nunca persistida). Dia = valor saturado na faixa de kcal + classificação dentro/fora + flags por macro + cobertura do registro; dias sem dado vêm marcados (nunca 0%). media = média aritmética dos dias com dado. Requer a credencial stub da nutri (x-nutri-key) — requisições dos fluxos do paciente são negadas (403).',
  })
  @ApiHeader({
    name: 'x-nutri-key',
    required: true,
    description: 'credencial stub da nutri (env NUTRI_API_KEY; fail-closed)',
  })
  @ApiParam({ name: 'patientId', format: 'uuid' })
  @ApiQuery({ name: 'from', example: '2026-06-01' })
  @ApiQuery({ name: 'to', example: '2026-06-07' })
  @ApiOkResponse({ description: 'série diária + média do período' })
  @ApiBadRequestResponse({
    description: 'from/to inválidos (formato, ordem ou período > 366 dias)',
  })
  @ApiForbiddenResponse({
    description: 'x-nutri-key ausente/errada (inclui identidade de paciente)',
  })
  @ApiNotFoundResponse({ description: 'paciente não encontrado' })
  serie(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<SerieAdesaoResponse> {
    return this.adesaoService.serie(patientId, from, to);
  }
}

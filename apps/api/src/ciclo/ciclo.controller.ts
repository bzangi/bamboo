// Via da NUTRI (FR-013/FR-014): operações de ciclo sob /nutri + NutriKeyGuard.
// Nenhuma superfície do paciente expõe ciclo. Controller fino (padrão da casca).
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
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
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { NutriKeyGuard } from '../nutri/nutri-key.guard';
import { CicloService } from './ciclo.service';
import type { AberturaResponse } from './ciclo.mapper';

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
}

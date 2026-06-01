import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { TodayResponse } from '@bamboo/types';
import { PlanService } from './plan.service';
import { ApiErrorModel, TodayResponseModel } from '../docs/swagger.models';

// Controller fino: validação estrutural na borda (ParseUUIDPipe), delega à casca.
@ApiTags('Plano do paciente')
@Controller('patients')
export class PlanController {
  constructor(private readonly planService: PlanService) {}

  @Get(':patientId/today')
  @ApiOperation({
    summary: 'Plano de hoje ("o agora")',
    description:
      'Resolve o tipo-de-dia do dia corrente (via programação semanal), retorna as refeições do dia (ordenadas) com a opção default e seus itens, marca a refeição do momento (currentMealId) e filtra os números nutricionais pelo gate de exposição do paciente. (v0: auth stub — paciente fixo por env.)',
  })
  @ApiParam({
    name: 'patientId',
    format: 'uuid',
    description:
      'UUID do paciente semeado (muda a cada seed; pegue no log do seed ou no banco).',
    example: 'f5258d1a-b07e-4b72-abdd-792fa9afd88b',
  })
  @ApiQuery({
    name: 'dayTypeId',
    required: false,
    format: 'uuid',
    description:
      'Override do tipo-de-dia (Fase 2 — troca de cardápio, só exibição): exibe esse tipo-de-dia e re-ancora "o agora", sem rebalancear. Deve pertencer ao plano ativo.',
  })
  @ApiOkResponse({ type: TodayResponseModel, description: 'plano do dia' })
  @ApiNotFoundResponse({
    type: ApiErrorModel,
    description: 'paciente inexistente ou sem plano ativo/programação',
  })
  @ApiBadRequestResponse({
    type: ApiErrorModel,
    description: 'patientId/dayTypeId não é um UUID válido',
  })
  getToday(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Query('dayTypeId', new ParseUUIDPipe({ optional: true }))
    dayTypeId?: string,
  ): Promise<TodayResponse> {
    return this.planService.getToday(patientId, dayTypeId);
  }
}

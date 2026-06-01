import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { OptionChoiceRequest, OptionChoiceResponse } from '@bamboo/types';
import { RebalanceService } from './rebalance.service';

// Controller fino: valida o patientId na borda (ParseUUIDPipe); o corpo é
// validado estruturalmente na casca (UUIDs). Delega ao service.
@ApiTags('Rebalanceamento')
@Controller('patients')
export class RebalanceController {
  constructor(private readonly rebalanceService: RebalanceService) {}

  @Post(':patientId/rebalance/option-choice')
  @HttpCode(HttpStatus.OK) // prévia computada, não criação — e recusa-orientada é 200.
  @ApiOperation({
    summary: 'Prévia do rebalanceamento ao escolher uma opção (gatilho P1)',
    description:
      'Recalcula os macros do dia ao escolher uma opção diferente da default de uma refeição e devolve a prévia das refeições seguintes reescaladas (ou sem-acao quando cabe na faixa, ou recusa-orientada quando estoura o piso). Não persiste nada. recusa-orientada é HTTP 200 ("nunca barra"). Números respeitam o gate de exposição.',
  })
  @ApiParam({ name: 'patientId', format: 'uuid' })
  @ApiOkResponse({
    description:
      'desfecho do motor (sem-acao | rebalanceado | recusa-orientada)',
  })
  @ApiNotFoundResponse({ description: 'paciente/plano/refeição inexistente' })
  @ApiUnprocessableEntityResponse({
    description: 'opção não pertence à refeição',
  })
  @ApiBadRequestResponse({ description: 'patientId ou corpo inválido' })
  optionChoice(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() body: OptionChoiceRequest,
  ): Promise<OptionChoiceResponse> {
    return this.rebalanceService.optionChoice(patientId, body);
  }
}

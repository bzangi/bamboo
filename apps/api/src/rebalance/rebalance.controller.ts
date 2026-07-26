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
      'Recalcula os macros do dia ao escolher uma opção diferente da default de uma refeição e devolve a prévia das refeições seguintes reescaladas (ou sem-acao quando cabe na faixa, ou recusa-orientada quando estoura o piso). Não persiste nada. recusa-orientada é HTTP 200 ("nunca barra"). Números respeitam o gate de exposição.\n\nCorpo: `{ triggerMealId, chosenOptionId, dayTypeId? }`. O `dayTypeId` é o override de tipo-de-dia da sessão (opcional, mesma semântica do POST /registro): presente, o dia considerado é o desse tipo — roster, alavancas e faixa-alvo saem dele, e o `triggerMealId` deve ser uma refeição dele; ausente, vale a programação do weekday. 404 quando o tipo-de-dia não pertence ao plano ativo.',
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

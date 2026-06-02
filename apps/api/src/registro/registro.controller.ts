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
import type { RegistroRequest, RegistroResponse } from '@bamboo/types';
import { RegistroService } from './registro.service';

// Controller fino: valida o patientId na borda (ParseUUIDPipe); o corpo é
// validado estruturalmente na casca (UUIDs/enum/gramas). Delega ao service.
@ApiTags('Registro')
@Controller('patients')
export class RegistroController {
  constructor(private readonly registroService: RegistroService) {}

  @Post(':patientId/registro')
  @HttpCode(HttpStatus.OK) // upsert idempotente; às vezes no-op/anulação — "nunca barra".
  @ApiOperation({
    summary: 'Registrar / corrigir / desfazer o estado de uma refeição num dia',
    description:
      'Registra feito/pulei ou desfaz o estado de uma refeição num dia (upsert idempotente). "troquei" é DERIVADO no servidor (FR-003), nunca enviado pelo cliente. Re-deriva "o agora" e devolve o estado vigente. Nunca devolve número de adesão/percentual (FR-016).',
  })
  @ApiParam({ name: 'patientId', format: 'uuid' })
  @ApiOkResponse({
    description: 'estado vigente após a operação + "o agora" re-derivado',
  })
  @ApiNotFoundResponse({
    description: 'paciente sem plano ativo; refeição/opção/item não pertence',
  })
  @ApiUnprocessableEntityResponse({
    description: 'food fora do grupo do item; itens vazio em troquei',
  })
  @ApiBadRequestResponse({ description: 'patientId ou corpo inválido' })
  registrar(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() body: RegistroRequest,
  ): Promise<RegistroResponse> {
    return this.registroService.registrar(patientId, body);
  }
}

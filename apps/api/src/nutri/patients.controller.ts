// Via da NUTRI (FR-001): a porta de entrada da visão da nutri. Todas as outras
// rotas /nutri/* são /nutri/patients/:patientId/... — sem esta listagem não há
// como chegar a um paciente sem já saber o UUID. Controller fino.
import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiForbiddenResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { NutriPatientsResponse } from '@bamboo/types';
import { NutriKeyGuard } from './nutri-key.guard';
import { PatientsService } from './patients.service';

@ApiTags('Pacientes (só nutri)')
@Controller('nutri')
@UseGuards(NutriKeyGuard)
@ApiHeader({
  name: 'x-nutri-key',
  required: true,
  description: 'credencial stub da nutri (env NUTRI_API_KEY; fail-closed)',
})
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Get('patients')
  @ApiOperation({
    summary: 'Listar pacientes com o ciclo atual de cada um',
    description:
      'Nome + ciclo atual (o aberto; se não houver, o fechado mais recente; senão null). Ordem por nome, desempate por id. Nenhuma métrica é calculada aqui — adesão e relatório vivem nas rotas do paciente. Limite v0: a credencial stub dá o papel "nutri do sistema", então a listagem não é escopada por nutri responsável (entra com a auth real).',
  })
  @ApiOkResponse({ description: 'lista de pacientes + ciclo atual' })
  @ApiForbiddenResponse({ description: 'x-nutri-key ausente/errada' })
  listar(): Promise<NutriPatientsResponse> {
    return this.patientsService.listar();
  }
}

// Via da NUTRI (FR-001): a porta de entrada da visão da nutri. Todas as outras
// rotas /nutri/* são /nutri/patients/:patientId/... — sem esta listagem não há
// como chegar a um paciente sem já saber o UUID. Controller fino.
import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { NutriPatientDto, NutriPatientsResponse } from '@bamboo/types';
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

  @Post('patients')
  @ApiOperation({
    summary: 'Cadastrar um paciente',
    description:
      'Cria o paciente vinculado à nutricionista responsável e devolve-o na MESMA forma do item da listagem (cicloAtual null), para o cliente não precisar de uma segunda chamada. Coleta mínima: só o nome (LGPD) — e-mail, telefone, peso e altura não são coletados porque nada os consome. Escreve apenas `patient`: sem plano, sem ciclo, sem programação. Plano entra por outra via (import de PDF, Fase 4).',
  })
  @ApiBody({ schema: { example: { name: 'Ana Ribeiro' } } })
  @ApiCreatedResponse({ description: 'paciente criado' })
  @ApiBadRequestResponse({
    description: 'name ausente, vazio, não-string ou acima de 120 caracteres',
  })
  @ApiForbiddenResponse({ description: 'x-nutri-key ausente/errada' })
  @ApiUnprocessableEntityResponse({
    description:
      'nenhuma nutricionista cadastrada, ou mais de uma (a credencial stub não distingue a responsável)',
  })
  criar(@Body() body: { name?: unknown }): Promise<NutriPatientDto> {
    return this.patientsService.criar(body?.name);
  }
}

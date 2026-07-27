// Via da NUTRI (FR-001): a porta de entrada da visão da nutri. Todas as outras
// rotas /nutri/* são /nutri/patients/:patientId/... — sem esta listagem não há
// como chegar a um paciente sem já saber o UUID. Controller fino.
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type {
  NutriPatientDetalheDto,
  NutriPatientDto,
  NutriPatientsResponse,
} from '@bamboo/types';
import { NutriKeyGuard } from './nutri-key.guard';
import {
  type AtualizarPacienteBody,
  PatientsService,
} from './patients.service';

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

  @Get('patients/:patientId')
  @ApiOperation({
    summary: 'A ficha de um paciente',
    description:
      'Nome, contato, peso, altura e nível de exposição — o que o formulário de edição precisa preencher. Sem ciclo: a regra de "qual ciclo mostrar" mora na listagem (015/D2) e em nenhum outro lugar.',
  })
  @ApiParam({ name: 'patientId', format: 'uuid' })
  @ApiOkResponse({ description: 'a ficha do paciente' })
  @ApiNotFoundResponse({ description: 'paciente não encontrado' })
  @ApiForbiddenResponse({ description: 'x-nutri-key ausente/errada' })
  detalhe(
    @Param('patientId', ParseUUIDPipe) patientId: string,
  ): Promise<NutriPatientDetalheDto> {
    return this.patientsService.detalhe(patientId);
  }

  @Patch('patients/:patientId')
  @ApiOperation({
    summary: 'Editar a ficha do paciente',
    description:
      'PATCH parcial: campo AUSENTE do corpo preserva o valor atual; campo com `null` LIMPA (apagar dado de saúde é um direito, LGPD). Corpo sem nenhum campo conhecido é no-op, não erro. Campos: name, email, phone, heightCm, weightKg, exposure (hidden|percent|macros|full_kcal).',
  })
  @ApiParam({ name: 'patientId', format: 'uuid' })
  @ApiBody({
    schema: {
      example: {
        name: 'Ana Ribeiro',
        email: 'ana@exemplo.com',
        phone: '11999990000',
        heightCm: 165,
        weightKg: 62.5,
        exposure: 'macros',
      },
    },
  })
  @ApiOkResponse({ description: 'a ficha depois da alteração' })
  @ApiBadRequestResponse({
    description: 'campo com formato ou faixa inválidos',
  })
  @ApiNotFoundResponse({ description: 'paciente não encontrado' })
  @ApiForbiddenResponse({ description: 'x-nutri-key ausente/errada' })
  atualizar(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() body: AtualizarPacienteBody,
  ): Promise<NutriPatientDetalheDto> {
    return this.patientsService.atualizar(patientId, body ?? {});
  }

  @Delete('patients/:patientId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Excluir o paciente',
    description:
      'Cascata PARA BAIXO: planos e o grafo inteiro (tipos-de-dia, refeições, opções, itens, programação da semana), ciclos e vigências. RECUSA com 409 se houver registro de refeição — histórico de saúde não é apagado por exclusão de cadastro.',
  })
  @ApiParam({ name: 'patientId', format: 'uuid' })
  @ApiNoContentResponse({ description: 'paciente e grafo excluídos' })
  @ApiConflictResponse({ description: 'o paciente tem registro de refeição' })
  @ApiNotFoundResponse({ description: 'paciente não encontrado' })
  @ApiForbiddenResponse({ description: 'x-nutri-key ausente/errada' })
  excluir(@Param('patientId', ParseUUIDPipe) patientId: string): Promise<void> {
    return this.patientsService.excluir(patientId);
  }
}

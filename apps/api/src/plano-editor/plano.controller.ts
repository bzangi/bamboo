// Via da nutri: plano, tipo-de-dia e a semana (017). Controller fino — toda a
// decisão está no service.
//
// Forma das rotas (plan.md/D1): CRIAR é aninhado (`POST <pai>/<filhos>`, o pai é
// o contexto); EDITAR e EXCLUIR são planos (`/nutri/<coleção>/:id`). O caminho
// aninhado completo até um item teria 7 níveis de @Param e não acrescentaria
// informação nenhuma — o grafo é caminhável para cima, e a existência do nó já
// dá o 404.
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
  Put,
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
import type { PlanoDto, PlanoTipoDiaDto, PlanosResponse } from '@bamboo/types';
import { NutriKeyGuard } from '../nutri/nutri-key.guard';
import { PlanoService } from './plano.service';

@ApiTags('Editor de plano (só nutri)')
@Controller('nutri')
@UseGuards(NutriKeyGuard)
@ApiHeader({
  name: 'x-nutri-key',
  required: true,
  description: 'credencial stub da nutri (env NUTRI_API_KEY; fail-closed)',
})
export class PlanoController {
  constructor(private readonly planoService: PlanoService) {}

  @Get('patients/:patientId/plans')
  @ApiOperation({
    summary: 'Listar os planos do paciente',
    description:
      'Sem o grafo, com o TAMANHO dele (dayTypeCount, mealCount) e `semanaCompleta` — plano cuja semana não está programada não serve ao app do paciente. Ativo primeiro, depois o mais recente.',
  })
  @ApiParam({ name: 'patientId', format: 'uuid' })
  @ApiOkResponse({ description: 'planos do paciente' })
  @ApiNotFoundResponse({ description: 'paciente não encontrado' })
  @ApiForbiddenResponse({ description: 'x-nutri-key ausente/errada' })
  listarPlanos(
    @Param('patientId', ParseUUIDPipe) patientId: string,
  ): Promise<PlanosResponse> {
    return this.planoService.listarPlanos(patientId);
  }

  @Post('patients/:patientId/plans')
  @ApiOperation({
    summary: 'Criar um plano',
    description:
      'O plano nasce VAZIO: nem tipo-de-dia, nem refeição, nem programação de semana. O PRIMEIRO plano do paciente nasce ativo (não existe estado "nenhum plano ativo"); do segundo em diante nasce inativo, porque trocar o plano ativo é o ato que o ciclo observa (POST /nutri/patients/:id/active-plan) e não pode ser efeito colateral de um cadastro.',
  })
  @ApiParam({ name: 'patientId', format: 'uuid' })
  @ApiBody({ schema: { example: { name: 'Plano de julho' } } })
  @ApiCreatedResponse({ description: 'o plano criado, com o grafo vazio' })
  @ApiBadRequestResponse({ description: 'name ausente, vazio ou longo demais' })
  @ApiNotFoundResponse({ description: 'paciente não encontrado' })
  @ApiForbiddenResponse({ description: 'x-nutri-key ausente/errada' })
  criarPlano(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() body: { name?: unknown },
  ): Promise<PlanoDto> {
    return this.planoService.criarPlano(patientId, body?.name);
  }

  @Get('plans/:planId')
  @ApiOperation({
    summary: 'O plano inteiro em uma requisição',
    description:
      'Tipos-de-dia, programação da semana, refeições (ordenadas por posição), opções (a padrão primeiro) e itens com nome do alimento e do grupo já resolvidos. É a leitura que a tela do editor faz — uma, não uma por nó.',
  })
  @ApiParam({ name: 'planId', format: 'uuid' })
  @ApiOkResponse({ description: 'o grafo do plano' })
  @ApiNotFoundResponse({ description: 'plano não encontrado' })
  @ApiForbiddenResponse({ description: 'x-nutri-key ausente/errada' })
  detalhePlano(
    @Param('planId', ParseUUIDPipe) planId: string,
  ): Promise<PlanoDto> {
    return this.planoService.detalhePlano(planId);
  }

  @Patch('plans/:planId')
  @ApiOperation({
    summary: 'Renomear o plano',
    description:
      'Só o nome. `isActive` NÃO é editável aqui: ativar plano é o ato observado pelo ciclo e continua em POST /nutri/patients/:patientId/active-plan (007).',
  })
  @ApiParam({ name: 'planId', format: 'uuid' })
  @ApiBody({ schema: { example: { name: 'Plano de agosto' } } })
  @ApiOkResponse({ description: 'o plano depois da alteração' })
  @ApiBadRequestResponse({ description: 'name vazio ou longo demais' })
  @ApiNotFoundResponse({ description: 'plano não encontrado' })
  atualizarPlano(
    @Param('planId', ParseUUIDPipe) planId: string,
    @Body() body: { name?: unknown },
  ): Promise<PlanoDto> {
    return this.planoService.atualizarPlano(planId, body ?? {});
  }

  @Delete('plans/:planId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Excluir o plano e o grafo abaixo',
    description:
      'Cascata para baixo (tipos-de-dia, refeições, opções, itens, semana). RECUSA com 409 em três casos: há registro de refeição no plano; há vigência dele em algum ciclo; é o plano ativo de um paciente com ciclo aberto.',
  })
  @ApiParam({ name: 'planId', format: 'uuid' })
  @ApiNoContentResponse({ description: 'plano e grafo excluídos' })
  @ApiConflictResponse({
    description: 'registro, vigência de ciclo, ou plano ativo com ciclo aberto',
  })
  @ApiNotFoundResponse({ description: 'plano não encontrado' })
  excluirPlano(@Param('planId', ParseUUIDPipe) planId: string): Promise<void> {
    return this.planoService.excluirPlano(planId);
  }

  @Put('plans/:planId/schedule')
  @ApiOperation({
    summary: 'Programar a semana (os 7 dias de uma vez)',
    description:
      'A semana é UM objeto, não 7 linhas independentes: uma semana com 6 dias programados é um estado inválido. O PUT substitui a programação inteira. `days`: lista de {weekday 0=domingo…6=sábado, dayTypeId}, exatamente os 7 dias, sem repetir. Tipo-de-dia de outro plano → 422.',
  })
  @ApiParam({ name: 'planId', format: 'uuid' })
  @ApiBody({
    schema: {
      example: {
        days: [
          { weekday: 0, dayTypeId: '…' },
          { weekday: 1, dayTypeId: '…' },
        ],
      },
    },
  })
  @ApiOkResponse({ description: 'o plano com a semana programada' })
  @ApiBadRequestResponse({
    description: 'days não é lista, não cobre os 7 dias, ou repete um dia',
  })
  @ApiUnprocessableEntityResponse({
    description: 'tipo-de-dia não pertence a este plano',
  })
  @ApiNotFoundResponse({ description: 'plano não encontrado' })
  definirSemana(
    @Param('planId', ParseUUIDPipe) planId: string,
    @Body() body: { days?: unknown },
  ): Promise<PlanoDto> {
    return this.planoService.definirSemana(planId, body?.days);
  }

  @Post('plans/:planId/day-types')
  @ApiOperation({
    summary: 'Criar um tipo-de-dia',
    description:
      'Nasce VAZIO (sem refeição). O plano é um CONJUNTO de tipos-de-dia (treino / descanso), não um cardápio fixo.',
  })
  @ApiParam({ name: 'planId', format: 'uuid' })
  @ApiBody({ schema: { example: { name: 'Treino' } } })
  @ApiCreatedResponse({ description: 'o tipo-de-dia criado, vazio' })
  @ApiBadRequestResponse({ description: 'name ausente ou vazio' })
  @ApiNotFoundResponse({ description: 'plano não encontrado' })
  criarTipoDia(
    @Param('planId', ParseUUIDPipe) planId: string,
    @Body() body: { name?: unknown },
  ): Promise<PlanoTipoDiaDto> {
    return this.planoService.criarTipoDia(planId, body?.name);
  }

  @Patch('day-types/:dayTypeId')
  @ApiOperation({ summary: 'Renomear o tipo-de-dia' })
  @ApiParam({ name: 'dayTypeId', format: 'uuid' })
  @ApiBody({ schema: { example: { name: 'Descanso' } } })
  @ApiOkResponse({ description: 'o tipo-de-dia depois da alteração' })
  @ApiNotFoundResponse({ description: 'tipo-de-dia não encontrado' })
  atualizarTipoDia(
    @Param('dayTypeId', ParseUUIDPipe) dayTypeId: string,
    @Body() body: { name?: unknown },
  ): Promise<PlanoTipoDiaDto> {
    return this.planoService.atualizarTipoDia(dayTypeId, body ?? {});
  }

  @Delete('day-types/:dayTypeId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Excluir o tipo-de-dia e o que pende abaixo',
    description:
      'Cascata em refeições, opções e itens. RECUSA com 409 se a programação da semana o referencia (a semana ficaria com um dia sem tipo) ou se há registro em alguma refeição sua.',
  })
  @ApiParam({ name: 'dayTypeId', format: 'uuid' })
  @ApiNoContentResponse({ description: 'tipo-de-dia excluído' })
  @ApiConflictResponse({ description: 'está na semana, ou tem registro' })
  @ApiNotFoundResponse({ description: 'tipo-de-dia não encontrado' })
  excluirTipoDia(
    @Param('dayTypeId', ParseUUIDPipe) dayTypeId: string,
  ): Promise<void> {
    return this.planoService.excluirTipoDia(dayTypeId);
  }
}

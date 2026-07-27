// Via da nutri: refeição → opção → item (017). Controller fino.
import {
  Body,
  Controller,
  Delete,
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
  PlanoItemDto,
  PlanoOpcaoDto,
  PlanoRefeicaoDto,
} from '@bamboo/types';
import { NutriKeyGuard } from '../nutri/nutri-key.guard';
import {
  type ItemBody,
  type OpcaoBody,
  type RefeicaoBody,
  RefeicaoService,
} from './refeicao.service';

@ApiTags('Editor de plano (só nutri)')
@Controller('nutri')
@UseGuards(NutriKeyGuard)
@ApiHeader({
  name: 'x-nutri-key',
  required: true,
  description: 'credencial stub da nutri (env NUTRI_API_KEY; fail-closed)',
})
export class RefeicaoController {
  constructor(private readonly refeicaoService: RefeicaoService) {}

  /* ═══════════ refeição ═══════════ */

  @Post('day-types/:dayTypeId/meals')
  @ApiOperation({
    summary: 'Criar uma refeição (slot) no tipo-de-dia',
    description:
      'Corpo: {name, position, horario?}. `position` é ÚNICA no tipo-de-dia e é a chave que pareia refeições entre tipos-de-dia (a troca de tipo-de-dia depende dela) — duplicar responde 409. `horario` é informativo (HH:MM ou HH:MM:SS): não dirige "o agora".',
  })
  @ApiParam({ name: 'dayTypeId', format: 'uuid' })
  @ApiBody({
    schema: { example: { name: 'Almoço', position: 2, horario: '12:30' } },
  })
  @ApiCreatedResponse({ description: 'a refeição criada, sem opções' })
  @ApiBadRequestResponse({ description: 'name/position/horario inválidos' })
  @ApiConflictResponse({ description: 'position já usada neste tipo-de-dia' })
  @ApiNotFoundResponse({ description: 'tipo-de-dia não encontrado' })
  @ApiForbiddenResponse({ description: 'x-nutri-key ausente/errada' })
  criarRefeicao(
    @Param('dayTypeId', ParseUUIDPipe) dayTypeId: string,
    @Body() body: RefeicaoBody,
  ): Promise<PlanoRefeicaoDto> {
    return this.refeicaoService.criarRefeicao(dayTypeId, body ?? {});
  }

  @Patch('meals/:mealId')
  @ApiOperation({
    summary: 'Editar a refeição',
    description:
      'PATCH parcial de {name, position, horario}. `horario: null` limpa. Mover para uma position ocupada responde 409.',
  })
  @ApiParam({ name: 'mealId', format: 'uuid' })
  @ApiOkResponse({ description: 'a refeição depois da alteração' })
  @ApiConflictResponse({ description: 'position já usada neste tipo-de-dia' })
  @ApiNotFoundResponse({ description: 'refeição não encontrada' })
  atualizarRefeicao(
    @Param('mealId', ParseUUIDPipe) mealId: string,
    @Body() body: RefeicaoBody,
  ): Promise<PlanoRefeicaoDto> {
    return this.refeicaoService.atualizarRefeicao(mealId, body ?? {});
  }

  @Delete('meals/:mealId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Excluir a refeição (com opções e itens)',
    description: 'RECUSA com 409 se houver registro nesta refeição.',
  })
  @ApiParam({ name: 'mealId', format: 'uuid' })
  @ApiNoContentResponse({ description: 'refeição excluída' })
  @ApiConflictResponse({ description: 'há registro nesta refeição' })
  @ApiNotFoundResponse({ description: 'refeição não encontrada' })
  excluirRefeicao(
    @Param('mealId', ParseUUIDPipe) mealId: string,
  ): Promise<void> {
    return this.refeicaoService.excluirRefeicao(mealId);
  }

  /* ═══════════ opção ═══════════ */

  @Post('meals/:mealId/options')
  @ApiOperation({
    summary: 'Criar uma opção da refeição (os "3 almoços")',
    description:
      'Corpo: {label, isDefault?}. A PRIMEIRA opção da refeição nasce padrão mesmo sem pedir (refeição com opções e nenhuma padrão não tem o que mostrar). Criar com isDefault:true desmarca as irmãs — exatamente uma padrão por refeição.',
  })
  @ApiParam({ name: 'mealId', format: 'uuid' })
  @ApiBody({ schema: { example: { label: 'Arroz e carne', isDefault: true } } })
  @ApiCreatedResponse({ description: 'a opção criada' })
  @ApiBadRequestResponse({ description: 'label ausente/vazio' })
  @ApiNotFoundResponse({ description: 'refeição não encontrada' })
  criarOpcao(
    @Param('mealId', ParseUUIDPipe) mealId: string,
    @Body() body: OpcaoBody,
  ): Promise<PlanoOpcaoDto> {
    return this.refeicaoService.criarOpcao(mealId, body ?? {});
  }

  @Patch('options/:optionId')
  @ApiOperation({
    summary: 'Editar a opção',
    description:
      'PATCH parcial de {label, isDefault}. `isDefault: true` promove esta e desmarca as irmãs. `isDefault: false` na única padrão responde 409 — marque outra como padrão em vez de desmarcar esta.',
  })
  @ApiParam({ name: 'optionId', format: 'uuid' })
  @ApiOkResponse({ description: 'a opção depois da alteração' })
  @ApiConflictResponse({ description: 'tentou desmarcar a única opção padrão' })
  @ApiNotFoundResponse({ description: 'opção não encontrada' })
  atualizarOpcao(
    @Param('optionId', ParseUUIDPipe) optionId: string,
    @Body() body: OpcaoBody,
  ): Promise<PlanoOpcaoDto> {
    return this.refeicaoService.atualizarOpcao(optionId, body ?? {});
  }

  @Delete('options/:optionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Excluir a opção (com os itens)',
    description:
      'RECUSA com 409 se for a ÚNICA opção da refeição, ou se algum registro aponta para ela. Se era a padrão havendo outras, promove outra no mesmo ato.',
  })
  @ApiParam({ name: 'optionId', format: 'uuid' })
  @ApiNoContentResponse({ description: 'opção excluída' })
  @ApiConflictResponse({ description: 'única opção, ou apontada por registro' })
  @ApiNotFoundResponse({ description: 'opção não encontrada' })
  excluirOpcao(
    @Param('optionId', ParseUUIDPipe) optionId: string,
  ): Promise<void> {
    return this.refeicaoService.excluirOpcao(optionId);
  }

  /* ═══════════ item ═══════════ */

  @Post('options/:optionId/items')
  @ApiOperation({
    summary: 'Adicionar um item à opção',
    description:
      'Corpo: {foodId, quantityGrams, isLocked?, substitutionGroupId?}. `isLocked` e `substitutionGroupId` são a marcação de flexibilidade inteira e são MUTUAMENTE EXCLUSIVOS (travado não troca) — os dois juntos respondem 400. O alimento precisa participar do grupo informado, senão 422: é o vínculo que carrega a porção de referência, sem a qual a troca não sabe reescalar a quantidade.',
  })
  @ApiParam({ name: 'optionId', format: 'uuid' })
  @ApiBody({
    schema: {
      example: {
        foodId: '…',
        quantityGrams: 120,
        isLocked: false,
        substitutionGroupId: '…',
      },
    },
  })
  @ApiCreatedResponse({ description: 'o item criado' })
  @ApiBadRequestResponse({
    description: 'gramas ≤ 0, ou isLocked junto com substitutionGroupId',
  })
  @ApiUnprocessableEntityResponse({
    description: 'o alimento não participa do grupo informado',
  })
  @ApiNotFoundResponse({
    description: 'opção, alimento ou grupo não encontrado',
  })
  criarItem(
    @Param('optionId', ParseUUIDPipe) optionId: string,
    @Body() body: ItemBody,
  ): Promise<PlanoItemDto> {
    return this.refeicaoService.criarItem(optionId, body ?? {});
  }

  @Patch('items/:itemId')
  @ApiOperation({
    summary: 'Editar o item',
    description:
      'PATCH parcial de {foodId, quantityGrams, isLocked, substitutionGroupId}. A marcação de flexibilidade é avaliada em CONJUNTO com o que já está gravado: mandar só `isLocked: true` num item que tem grupo responde 400, não "resolve" por precedência.',
  })
  @ApiParam({ name: 'itemId', format: 'uuid' })
  @ApiOkResponse({ description: 'o item depois da alteração' })
  @ApiBadRequestResponse({ description: 'valores inválidos ou contraditórios' })
  @ApiUnprocessableEntityResponse({
    description: 'o alimento não participa do grupo informado',
  })
  @ApiNotFoundResponse({
    description: 'item, alimento ou grupo não encontrado',
  })
  atualizarItem(
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() body: ItemBody,
  ): Promise<PlanoItemDto> {
    return this.refeicaoService.atualizarItem(itemId, body ?? {});
  }

  @Delete('items/:itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Excluir o item',
    description:
      'Sem bloqueador: nada referencia `meal_item` (o snapshot do registro aponta para `food`). Sai direto.',
  })
  @ApiParam({ name: 'itemId', format: 'uuid' })
  @ApiNoContentResponse({ description: 'item excluído' })
  @ApiNotFoundResponse({ description: 'item não encontrado' })
  excluirItem(@Param('itemId', ParseUUIDPipe) itemId: string): Promise<void> {
    return this.refeicaoService.excluirItem(itemId);
  }
}

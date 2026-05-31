import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { SubstitutionsResponse } from '@bamboo/types';
import { SubstitutionService } from './substitution.service';
import {
  ApiErrorModel,
  SubstitutionsResponseModel,
} from '../docs/swagger.models';

// Controller fino: validação estrutural na borda (ParseUUIDPipe), delega à casca.
@ApiTags('Substituição')
@Controller('meal-items')
export class SubstitutionController {
  constructor(private readonly substitutionService: SubstitutionService) {}

  @Get(':mealItemId/substitutions')
  @ApiOperation({
    summary: 'Substituições de um item flexível',
    description:
      'Lista os alimentos do mesmo grupo de substituição do item, cada um com a quantidade recalculada (preservando o nutriente-base do grupo) e a medida caseira correspondente. Alvos com nutriente-base zero são excluídos. Item travado ou sem grupo → 422 (não substituível). Lista vazia de alternativas é 200 (grupo sem substitutos).',
  })
  @ApiParam({
    name: 'mealItemId',
    format: 'uuid',
    description: 'UUID do meal_item (flexível). Itens travados retornam 422.',
    example: 'd5efbc96-9aa8-4d33-a92f-ecf2f0b81b2d',
  })
  @ApiOkResponse({
    type: SubstitutionsResponseModel,
    description: 'alternativas equivalentes (lista pode ser vazia)',
  })
  @ApiUnprocessableEntityResponse({
    type: ApiErrorModel,
    description: 'item travado ou sem grupo (não substituível)',
  })
  @ApiNotFoundResponse({ type: ApiErrorModel, description: 'item inexistente' })
  @ApiBadRequestResponse({
    type: ApiErrorModel,
    description: 'mealItemId não é um UUID válido',
  })
  getSubstitutions(
    @Param('mealItemId', ParseUUIDPipe) mealItemId: string,
  ): Promise<SubstitutionsResponse> {
    return this.substitutionService.getSubstitutions(mealItemId);
  }
}

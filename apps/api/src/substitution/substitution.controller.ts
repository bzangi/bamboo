import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
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
      'Lista os alimentos do mesmo grupo de substituição do item, cada um com a quantidade recalculada (preservando o nutriente-base do grupo) e a medida caseira correspondente. Alvos com nutriente-base zero são excluídos. Item travado ou sem grupo → 422 (não substituível). Lista vazia de alternativas é 200 (grupo sem substitutos).\n\nBusca e página (019, todos opcionais): `q` filtra por nome com busca fuzzy (subsequência, insensível a caixa e acento) e ordena por relevância; `limit`/`offset` recortam a página. **Sem nenhum dos três, a resposta é a de sempre — o grupo inteiro.** Não há campo de total: a última página é aquela que volta com menos itens que o `limit`.\n\n`includeSelf` (021, opcional): quando `true`, inclui o próprio food do item entre os candidatos — usado pelo modo de combinar, que pode querer manter o alimento de origem como um dos dois alvos. Ausente ou qualquer outro valor: comportamento de sempre (food de origem excluído).',
  })
  @ApiParam({
    name: 'mealItemId',
    format: 'uuid',
    description: 'UUID do meal_item (flexível). Itens travados retornam 422.',
    example: 'd5efbc96-9aa8-4d33-a92f-ecf2f0b81b2d',
  })
  @ApiQuery({
    name: 'q',
    required: false,
    description: 'trecho do nome do alimento (busca fuzzy)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'tamanho da página; ausente = lista inteira',
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    description: 'quantos pular, default 0',
  })
  @ApiQuery({
    name: 'includeSelf',
    required: false,
    description:
      '"true" inclui o próprio food do item entre os candidatos (uso do combinar)',
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
    @Query('q') q?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('includeSelf') includeSelf?: string,
  ): Promise<SubstitutionsResponse> {
    return this.substitutionService.getSubstitutions(mealItemId, {
      q,
      limit,
      offset,
      includeSelf,
    });
  }
}

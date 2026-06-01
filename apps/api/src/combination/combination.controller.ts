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
import type { CombineRequest, CombineResponse } from '@bamboo/types';
import { CombinationService } from './combination.service';

@ApiTags('Combinação')
@Controller('meal-items')
export class CombinationController {
  constructor(private readonly combinationService: CombinationService) {}

  @Post(':mealItemId/combine')
  @HttpCode(HttpStatus.OK) // cálculo, não criação.
  @ApiOperation({
    summary: 'Combinar um item em dois (1→2)',
    description:
      'Troca um item flexível por DOIS alvos do mesmo grupo, dividindo o nutriente-base por um split (default 50/50, ajustável) e preservando-o; cada parte vem com a medida caseira. Item travado/sem grupo → 422. Alvo fora do grupo ou sem o nutriente-base → 422. Não persiste.',
  })
  @ApiParam({ name: 'mealItemId', format: 'uuid' })
  @ApiOkResponse({ description: 'as duas partes com gramas + medida caseira' })
  @ApiUnprocessableEntityResponse({
    description: 'item não combinável ou alvo inválido',
  })
  @ApiNotFoundResponse({ description: 'item inexistente' })
  @ApiBadRequestResponse({ description: 'mealItemId ou corpo inválido' })
  combine(
    @Param('mealItemId', ParseUUIDPipe) mealItemId: string,
    @Body() body: CombineRequest,
  ): Promise<CombineResponse> {
    return this.combinationService.combine(mealItemId, body);
  }
}

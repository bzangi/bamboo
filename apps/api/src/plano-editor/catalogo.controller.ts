// Via da nutri: o catálogo que o editor consulta (017 / US4). Controller fino.
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
  Query,
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
  ApiQuery,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type {
  FoodDto,
  FoodsResponse,
  GrupoDto,
  GruposResponse,
} from '@bamboo/types';
import { NutriKeyGuard } from '../nutri/nutri-key.guard';
import {
  type AlimentoBody,
  CatalogoService,
  type GrupoBody,
} from './catalogo.service';

@ApiTags('Catálogo do editor (só nutri)')
@Controller('nutri')
@UseGuards(NutriKeyGuard)
@ApiHeader({
  name: 'x-nutri-key',
  required: true,
  description: 'credencial stub da nutri (env NUTRI_API_KEY; fail-closed)',
})
export class CatalogoController {
  constructor(private readonly catalogoService: CatalogoService) {}

  /* ═══════════ alimentos ═══════════ */

  @Get('foods')
  @ApiOperation({
    summary: 'Buscar alimentos',
    description:
      'Busca fuzzy: insensível a maiúscula E a acento ("acai" acha "Açaí"), e por subsequência — "arrint" acha "Arroz integral". O resultado vem ordenado por relevância (casamento colado e em início de palavra na frente). `q` vazio devolve a primeira página, não erro — é o estado inicial da tela. `total` diz quantos casaram; a lista é a fatia `[offset, offset+limit)`, então há mais páginas enquanto `offset + foods.length < total`. `limit`/`offset` fora de forma caem no default em vez de 400.',
  })
  @ApiQuery({ name: 'q', required: false, description: 'trecho do nome' })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: '1–600, default 50',
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    description: 'quantos pular, default 0',
  })
  @ApiOkResponse({ description: 'alimentos que casaram + total' })
  @ApiForbiddenResponse({ description: 'x-nutri-key ausente/errada' })
  buscarAlimentos(
    @Query('q') q?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<FoodsResponse> {
    return this.catalogoService.buscarAlimentos(q, limit, offset);
  }

  @Post('foods')
  @ApiOperation({
    summary: 'Cadastrar um alimento fora da TACO',
    description:
      'Exige nome e os quatro nutrientes por 100 g (zero é válido: água tem 0 kcal). Nasce SEM `taco_id` e com `source` diferente de "taco", então a ingestão TACO (008), que faz upsert por `taco_id`, nunca o sobrescreve.',
  })
  @ApiBody({
    schema: {
      example: {
        name: 'Pão da padaria da esquina',
        kcalPer100g: 270,
        carbPer100g: 55,
        proteinPer100g: 8,
        fatPer100g: 2,
        fiberPer100g: 2.5,
      },
    },
  })
  @ApiCreatedResponse({ description: 'o alimento criado' })
  @ApiBadRequestResponse({ description: 'nome ou nutriente inválido' })
  criarAlimento(@Body() body: AlimentoBody): Promise<FoodDto> {
    return this.catalogoService.criarAlimento(body ?? {});
  }

  @Patch('foods/:foodId')
  @ApiOperation({
    summary: 'Editar um alimento',
    description:
      'PATCH parcial. Vale para alimento da TACO também — mas a próxima ingestão sobrescreve o que tiver `taco_id`.',
  })
  @ApiParam({ name: 'foodId', format: 'uuid' })
  @ApiOkResponse({ description: 'o alimento depois da alteração' })
  @ApiNotFoundResponse({ description: 'alimento não encontrado' })
  atualizarAlimento(
    @Param('foodId', ParseUUIDPipe) foodId: string,
    @Body() body: AlimentoBody,
  ): Promise<FoodDto> {
    return this.catalogoService.atualizarAlimento(foodId, body ?? {});
  }

  @Delete('foods/:foodId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Excluir um alimento do catálogo',
    description:
      'Leva os vínculos de grupo e as medidas caseiras. RECUSA com 409 se o alimento está em algum plano ou em algum registro de refeição.',
  })
  @ApiParam({ name: 'foodId', format: 'uuid' })
  @ApiNoContentResponse({ description: 'alimento excluído' })
  @ApiConflictResponse({ description: 'em uso por plano ou registro' })
  @ApiNotFoundResponse({ description: 'alimento não encontrado' })
  excluirAlimento(
    @Param('foodId', ParseUUIDPipe) foodId: string,
  ): Promise<void> {
    return this.catalogoService.excluirAlimento(foodId);
  }

  /* ═══════════ grupos de substituição ═══════════ */

  @Get('substitution-groups')
  @ApiOperation({
    summary: 'Listar os grupos de substituição com os alimentos vinculados',
    description:
      '`custom: true` = grupo desta nutri; `false` = grupo do sistema, mantido pela auto-classificação (008). Cada vínculo traz a porção de referência (a "1 troca") e a origem (manual = curadoria, nunca sobrescrita).',
  })
  @ApiOkResponse({ description: 'grupos + vínculos' })
  listarGrupos(): Promise<GruposResponse> {
    return this.catalogoService.listarGrupos();
  }

  @Post('substitution-groups')
  @ApiOperation({
    summary: 'Criar um grupo de substituição próprio',
    description:
      '`basis` é o nutriente PRESERVADO na troca dentro do grupo: carb | protein | fat | kcal. O grupo nasce vinculado à nutricionista (custom), não ao sistema.',
  })
  @ApiBody({
    schema: { example: { name: 'Meus carboidratos', basis: 'carb' } },
  })
  @ApiCreatedResponse({ description: 'o grupo criado, sem alimentos' })
  @ApiBadRequestResponse({
    description: 'name vazio ou basis fora do conjunto',
  })
  @ApiUnprocessableEntityResponse({
    description: 'nenhuma nutricionista cadastrada, ou mais de uma',
  })
  criarGrupo(@Body() body: GrupoBody): Promise<GrupoDto> {
    return this.catalogoService.criarGrupo(body ?? {});
  }

  @Patch('substitution-groups/:groupId')
  @ApiOperation({
    summary: 'Editar o grupo',
    description:
      'Atenção: mudar `basis` muda o nutriente preservado em TODAS as trocas dentro do grupo.',
  })
  @ApiParam({ name: 'groupId', format: 'uuid' })
  @ApiOkResponse({ description: 'o grupo depois da alteração' })
  @ApiNotFoundResponse({ description: 'grupo não encontrado' })
  atualizarGrupo(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() body: GrupoBody,
  ): Promise<GrupoDto> {
    return this.catalogoService.atualizarGrupo(groupId, body ?? {});
  }

  @Delete('substitution-groups/:groupId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Excluir o grupo (com os vínculos)',
    description:
      'RECUSA com 409 se algum item de plano é flexível dentro dele.',
  })
  @ApiParam({ name: 'groupId', format: 'uuid' })
  @ApiNoContentResponse({ description: 'grupo excluído' })
  @ApiConflictResponse({ description: 'em uso por item de plano' })
  @ApiNotFoundResponse({ description: 'grupo não encontrado' })
  excluirGrupo(
    @Param('groupId', ParseUUIDPipe) groupId: string,
  ): Promise<void> {
    return this.catalogoService.excluirGrupo(groupId);
  }

  @Put('substitution-groups/:groupId/foods/:foodId')
  @ApiOperation({
    summary: 'Vincular alimento ao grupo com a porção de referência',
    description:
      'A porção de referência é a "1 troca" do exchange — é dela que sai o recálculo de quantidade na substituição. PUT porque o par (grupo, alimento) é a identidade: revincular atualiza. O vínculo nasce/vira `origin: manual`, que a auto-classificação nunca sobrescreve.',
  })
  @ApiParam({ name: 'groupId', format: 'uuid' })
  @ApiParam({ name: 'foodId', format: 'uuid' })
  @ApiBody({ schema: { example: { referencePortionGrams: 100 } } })
  @ApiOkResponse({ description: 'o grupo com o vínculo' })
  @ApiBadRequestResponse({ description: 'referencePortionGrams ≤ 0' })
  @ApiNotFoundResponse({ description: 'grupo ou alimento não encontrado' })
  vincular(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('foodId', ParseUUIDPipe) foodId: string,
    @Body() body: { referencePortionGrams?: unknown },
  ): Promise<GrupoDto> {
    return this.catalogoService.vincular(groupId, foodId, body ?? {});
  }

  @Delete('substitution-groups/:groupId/foods/:foodId')
  @ApiOperation({
    summary: 'Desvincular alimento do grupo',
    description:
      'RECUSA com 409 se existe item de plano deste alimento marcado como flexível dentro deste grupo — sem o vínculo a troca perderia a porção de referência.',
  })
  @ApiParam({ name: 'groupId', format: 'uuid' })
  @ApiParam({ name: 'foodId', format: 'uuid' })
  @ApiOkResponse({ description: 'o grupo sem o vínculo' })
  @ApiConflictResponse({ description: 'item de plano depende do vínculo' })
  @ApiNotFoundResponse({ description: 'grupo não encontrado' })
  desvincular(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('foodId', ParseUUIDPipe) foodId: string,
  ): Promise<GrupoDto> {
    return this.catalogoService.desvincular(groupId, foodId);
  }
}

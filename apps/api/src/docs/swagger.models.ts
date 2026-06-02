// Modelos SÓ para documentação OpenAPI (@nestjs/swagger). Espelham os DTOs de
// @bamboo/types (que são interfaces puras, sem runtime/decorators, logo o Swagger
// não consegue introspectá-las). Estruturalmente compatíveis com os DTOs — usados
// apenas em @ApiOkResponse({ type: ... }); a casca continua retornando os tipos
// de @bamboo/types. Tipos explícitos em todo @ApiProperty (não dependem de
// emitDecoratorMetadata).
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/* ===================== US1 — GET /patients/:id/today ===================== */

export class NutritionModel {
  @ApiPropertyOptional({
    type: Number,
    example: 195,
    description: 'kcal da porção (só exposure=full_kcal)',
  })
  kcal?: number;
  @ApiPropertyOptional({
    type: Number,
    example: 33.7,
    description: 'carboidrato (g) da porção',
  })
  carb?: number;
  @ApiPropertyOptional({ type: Number, example: 3 })
  protein?: number;
  @ApiPropertyOptional({ type: Number, example: 0.3 })
  fat?: number;
  @ApiPropertyOptional({
    type: Number,
    example: 80,
    description:
      'proporção do macro no total de macros (%), não bucket de kcal',
  })
  carbPct?: number;
  @ApiPropertyOptional({ type: Number, example: 7 })
  proteinPct?: number;
  @ApiPropertyOptional({ type: Number, example: 13 })
  fatPct?: number;
}

export class FoodRefModel {
  @ApiProperty({
    type: String,
    format: 'uuid',
    example: '64c1ec0a-cfd7-42e2-a286-8d72216831ad',
  })
  id!: string;
  @ApiProperty({ type: String, example: 'Arroz branco cozido' })
  name!: string;
}

export class MealItemModel {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;
  @ApiProperty({ type: FoodRefModel })
  food!: FoodRefModel;
  @ApiProperty({ type: Number, example: 150 })
  quantityGrams!: number;
  @ApiProperty({ type: Boolean, example: false })
  isLocked!: boolean;
  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    example: '6c4c612c-5dbf-4595-ba44-4c0bf6687000',
  })
  substitutionGroupId!: string | null;
  @ApiProperty({
    type: Boolean,
    example: true,
    description: '!isLocked && substitutionGroupId != null',
  })
  substitutable!: boolean;
  @ApiPropertyOptional({
    type: NutritionModel,
    description: 'ausente quando exposure = hidden',
  })
  nutrition?: NutritionModel;
}

export class MealOptionModel {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;
  @ApiProperty({ type: String, example: 'Padrão' })
  label!: string;
  @ApiProperty({ type: Boolean, example: true })
  isDefault!: boolean;
  @ApiProperty({ type: [MealItemModel] })
  items!: MealItemModel[];
}

// Fase 3 — estado vigente do registro da refeição no dia.
export class MealRegistroModel {
  @ApiProperty({
    enum: ['feito', 'troquei', 'pulei'],
    example: 'feito',
    description: 'estado vigente (troquei é derivado no servidor)',
  })
  state!: string;
}

export class MealModel {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;
  @ApiProperty({ type: String, example: 'Almoço' })
  name!: string;
  @ApiProperty({ type: Number, example: 2 })
  position!: number;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: '12:30',
    description: 'horário "HH:MM"; null/ausente se não definido',
  })
  horario?: string | null;
  @ApiProperty({ type: MealOptionModel })
  defaultOption!: MealOptionModel;
  @ApiProperty({
    type: Number,
    example: 2,
    description: 'nº de outras opções da refeição (não expandidas no v0)',
  })
  otherOptionsCount!: number;
  @ApiProperty({
    type: MealRegistroModel,
    nullable: true,
    description:
      'Fase 3: estado vigente do registro desta refeição hoje; null = não-registrada',
  })
  registro!: MealRegistroModel | null;
  @ApiProperty({
    type: Boolean,
    example: false,
    description: 'Fase 3: é "o agora" (1ª não-registrada na ordem do plano)',
  })
  isCurrent!: boolean;
}

export class DayTypeModel {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;
  @ApiProperty({ type: String, example: 'descanso' })
  label!: string;
}

export class TodayResponseModel {
  @ApiProperty({ type: String, format: 'uuid' })
  patientId!: string;
  @ApiProperty({
    enum: ['hidden', 'percent', 'macros', 'full_kcal'],
    example: 'macros',
    description: 'gate de exposição (controlado pela nutri)',
  })
  exposure!: string;
  @ApiProperty({ type: DayTypeModel })
  dayType!: DayTypeModel;
  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description:
      'Fase 3: 1ª refeição NÃO-registrada na ordem do plano; null se dia concluído',
  })
  currentMealId!: string | null;
  @ApiProperty({
    type: Boolean,
    example: false,
    description:
      'Fase 3: true quando todas as refeições do dia estão registradas',
  })
  diaConcluido!: boolean;
  @ApiProperty({ type: [MealModel] })
  meals!: MealModel[];
}

/* ============= US2 — GET /meal-items/:id/substitutions ============= */

export class HouseholdMeasureModel {
  @ApiProperty({ type: String, example: 'colher de sopa cheia' })
  label!: string;
  @ApiProperty({ type: Number, example: 30 })
  grams!: number;
}

export class SubstitutionGroupModel {
  @ApiProperty({ type: String, format: 'uuid' })
  id!: string;
  @ApiProperty({ type: String, example: 'Carboidratos' })
  name!: string;
  @ApiProperty({
    enum: ['carb', 'protein', 'fat', 'kcal'],
    example: 'carb',
    description: 'nutriente-base preservado na troca',
  })
  basis!: string;
}

export class CurrentItemModel {
  @ApiProperty({ type: String, format: 'uuid' })
  foodId!: string;
  @ApiProperty({ type: String, example: 'Arroz branco cozido' })
  name!: string;
  @ApiProperty({ type: Number, example: 150 })
  quantityGrams!: number;
}

export class SubstitutionAlternativeModel {
  @ApiProperty({ type: String, format: 'uuid' })
  foodId!: string;
  @ApiProperty({ type: String, example: 'Batata inglesa cozida' })
  name!: string;
  @ApiProperty({
    type: Number,
    example: 352.5,
    description: 'quantidade equivalente (preserva o nutriente-base)',
  })
  gramas!: number;
  @ApiProperty({
    type: HouseholdMeasureModel,
    nullable: true,
    description: 'medida caseira mais próxima, ou null',
  })
  medidaCaseira!: HouseholdMeasureModel | null;
}

export class SubstitutionsResponseModel {
  @ApiProperty({ type: String, format: 'uuid' })
  itemId!: string;
  @ApiProperty({ type: SubstitutionGroupModel })
  group!: SubstitutionGroupModel;
  @ApiProperty({ type: CurrentItemModel })
  current!: CurrentItemModel;
  @ApiProperty({
    type: [SubstitutionAlternativeModel],
    description:
      'lista vazia = grupo sem outros alimentos elegíveis (200, não erro)',
  })
  alternatives!: SubstitutionAlternativeModel[];
}

/* ===================== Erro padrão (NestJS HttpException) ===================== */

export class ApiErrorModel {
  @ApiProperty({ type: Number, example: 404 })
  statusCode!: number;
  @ApiProperty({
    type: String,
    example: 'item não encontrado',
    description: 'string (ou array em erros de validação)',
  })
  message!: string;
  @ApiPropertyOptional({ type: String, example: 'Not Found' })
  error?: string;
}

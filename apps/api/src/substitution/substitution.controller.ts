import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import type { SubstitutionsResponse } from '@bamboo/types';
import { SubstitutionService } from './substitution.service';

// Controller fino: validação estrutural na borda (ParseUUIDPipe), delega à casca.
@Controller('meal-items')
export class SubstitutionController {
  constructor(private readonly substitutionService: SubstitutionService) {}

  @Get(':mealItemId/substitutions')
  getSubstitutions(
    @Param('mealItemId', ParseUUIDPipe) mealItemId: string,
  ): Promise<SubstitutionsResponse> {
    return this.substitutionService.getSubstitutions(mealItemId);
  }
}

import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import type { TodayResponse } from '@bamboo/types';
import { PlanService } from './plan.service';

// Controller fino: validação estrutural na borda (ParseUUIDPipe), delega à casca.
@Controller('patients')
export class PlanController {
  constructor(private readonly planService: PlanService) {}

  @Get(':patientId/today')
  getToday(
    @Param('patientId', ParseUUIDPipe) patientId: string,
  ): Promise<TodayResponse> {
    return this.planService.getToday(patientId);
  }
}

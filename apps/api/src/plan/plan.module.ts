import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module';
import { PlanController } from './plan.controller';
import { PlanService } from './plan.service';

@Module({
  imports: [DbModule],
  controllers: [PlanController],
  providers: [PlanService],
})
export class PlanModule {}

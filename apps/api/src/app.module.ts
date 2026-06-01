import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DbModule } from './db/db.module';
import { PlanModule } from './plan/plan.module';
import { SubstitutionModule } from './substitution/substitution.module';
import { RebalanceModule } from './rebalance/rebalance.module';

@Module({
  imports: [DbModule, PlanModule, SubstitutionModule, RebalanceModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DbModule } from './db/db.module';
import { PlanModule } from './plan/plan.module';
import { SubstitutionModule } from './substitution/substitution.module';

@Module({
  imports: [DbModule, PlanModule, SubstitutionModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DbModule } from './db/db.module';
import { PlanModule } from './plan/plan.module';
import { SubstitutionModule } from './substitution/substitution.module';
import { RebalanceModule } from './rebalance/rebalance.module';
import { CombinationModule } from './combination/combination.module';
import { RegistroModule } from './registro/registro.module';
import { AdesaoModule } from './adesao/adesao.module';
import { CicloModule } from './ciclo/ciclo.module';

@Module({
  imports: [
    DbModule,
    PlanModule,
    SubstitutionModule,
    RebalanceModule,
    CombinationModule,
    RegistroModule,
    AdesaoModule,
    CicloModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

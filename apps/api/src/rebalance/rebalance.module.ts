import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module';
import { RebalanceController } from './rebalance.controller';
import { RebalanceService } from './rebalance.service';

@Module({
  imports: [DbModule],
  controllers: [RebalanceController],
  providers: [RebalanceService],
})
export class RebalanceModule {}

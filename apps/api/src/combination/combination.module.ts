import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module';
import { CombinationController } from './combination.controller';
import { CombinationService } from './combination.service';

@Module({
  imports: [DbModule],
  controllers: [CombinationController],
  providers: [CombinationService],
})
export class CombinationModule {}

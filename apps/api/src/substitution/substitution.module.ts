import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module';
import { SubstitutionController } from './substitution.controller';
import { SubstitutionService } from './substitution.service';

@Module({
  imports: [DbModule],
  controllers: [SubstitutionController],
  providers: [SubstitutionService],
})
export class SubstitutionModule {}

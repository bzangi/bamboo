import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module';
import { RegistroController } from './registro.controller';
import { RegistroService } from './registro.service';

@Module({
  imports: [DbModule],
  controllers: [RegistroController],
  providers: [RegistroService],
})
export class RegistroModule {}

// Módulo da via da nutri (Feature 015). A pasta já existia com o guard
// compartilhado (007); ganhou a roster. Deliberadamente fora do CicloModule: a
// listagem de pacientes não é ciclo — enfiá-la lá faria aquele módulo crescer
// por chamador (D3).
import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module';
import { NutriKeyGuard } from './nutri-key.guard';
import { PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';

@Module({
  imports: [DbModule],
  controllers: [PatientsController],
  providers: [PatientsService, NutriKeyGuard],
})
export class NutriModule {}

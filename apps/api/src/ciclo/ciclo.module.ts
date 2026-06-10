// Módulo do ciclo de acompanhamento (Feature 007) — via da nutri. Isolado dos
// fluxos do paciente: nenhum service existente é tocado (SC-003); operações e
// dados de ciclo só existem atrás do NutriKeyGuard (FR-013).
import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module';
import { CicloController } from './ciclo.controller';
import { CicloService } from './ciclo.service';
import { NutriKeyGuard } from '../nutri/nutri-key.guard';

@Module({
  imports: [DbModule],
  controllers: [CicloController],
  providers: [CicloService, NutriKeyGuard],
})
export class CicloModule {}

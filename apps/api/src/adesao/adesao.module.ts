// Módulo da via da nutri (Feature 006 — métrica de adesão). Isolado dos fluxos
// do paciente: nenhum service existente é tocado (SC-007); a única superfície
// que serializa adesão é o controller daqui, atrás do NutriKeyGuard (FR-016).
import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module';
import { AdesaoController } from './adesao.controller';
import { AdesaoService } from './adesao.service';
import { NutriKeyGuard } from '../nutri/nutri-key.guard';

@Module({
  imports: [DbModule],
  controllers: [AdesaoController],
  providers: [AdesaoService, NutriKeyGuard],
})
export class AdesaoModule {}

// Módulo de composição da Feature 011 — importa AdesaoModule (006) e
// CicloModule (007) pra reusar os services exportados (D5); nenhum service
// existente é tocado.
import { Module } from '@nestjs/common';
import { AdesaoModule } from '../adesao/adesao.module';
import { CicloModule } from '../ciclo/ciclo.module';
import { DbModule } from '../db/db.module';
import { NutriKeyGuard } from '../nutri/nutri-key.guard';
import { RelatorioController } from './relatorio.controller';
import { RelatorioService } from './relatorio.service';

@Module({
  imports: [DbModule, AdesaoModule, CicloModule],
  controllers: [RelatorioController],
  providers: [RelatorioService, NutriKeyGuard],
})
export class RelatorioModule {}

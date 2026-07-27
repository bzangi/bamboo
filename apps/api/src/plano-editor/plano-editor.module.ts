// Módulo do editor de plano (Feature 017) — a escrita do grafo
// `plan → day_type → meal → meal_option → meal_item` + `day_schedule`, e o
// catálogo (alimentos e grupos de substituição) que o editor precisa consultar.
//
// Fora do `NutriModule` de propósito: aquele módulo é a porta de entrada da nutri
// (roster + ficha do paciente). Enfiar o editor lá o faria crescer por chamador,
// que é a definição de módulo raso — mesmo raciocínio do D3 da 015.
//
// A ficha do paciente (PATCH/DELETE) fica no `NutriModule`, com a listagem e o
// cadastro: paciente não é plano.
import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module';
import { NutriKeyGuard } from '../nutri/nutri-key.guard';
import { CatalogoController } from './catalogo.controller';
import { CatalogoService } from './catalogo.service';
import { PlanoController } from './plano.controller';
import { PlanoService } from './plano.service';
import { RefeicaoController } from './refeicao.controller';
import { RefeicaoService } from './refeicao.service';

@Module({
  imports: [DbModule],
  controllers: [PlanoController, RefeicaoController, CatalogoController],
  providers: [PlanoService, RefeicaoService, CatalogoService, NutriKeyGuard],
})
export class PlanoEditorModule {}

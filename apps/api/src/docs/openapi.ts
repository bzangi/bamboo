import { DocumentBuilder } from '@nestjs/swagger';

// Config única do documento OpenAPI — usada pelo main.ts (UI em /docs) e pelo
// gen-openapi.ts (gera o openapi.json versionado).
export const OPENAPI_CONFIG = new DocumentBuilder()
  .setTitle('Bamboo API')
  .setDescription(
    'API da alça do paciente — ver "o agora" (US1) e substituir um alimento dentro do grupo, com quantidade recalculada e medida caseira (US2). v0: auth stub (paciente fixo por env).',
  )
  .setVersion('0.1.0')
  .addTag(
    'Plano do paciente',
    'GET /today — a refeição do momento + o plano do dia',
  )
  .addTag(
    'Substituição',
    'GET /substitutions — alternativas equivalentes do grupo',
  )
  .build();

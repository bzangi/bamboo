import './load-env'; // PRIMEIRO: carrega o .env antes de importar @bamboo/db
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { OPENAPI_CONFIG } from './docs/openapi';
import { AllExceptionsFilter } from './observability/all-exceptions.filter';
import { HttpLoggingInterceptor } from './observability/http-logging.interceptor';
import { logLevelsFromEnv } from './observability/http-error-mapping';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // LOG_LEVEL controla a verbosidade (default: error/warn/log; `debug` liga o
    // rastreio por etapa dos services). Vale p/ TODO Logger da app.
    logger: logLevelsFromEnv(process.env.LOG_LEVEL),
  });

  // Borda: filtro global loga e padroniza TODA exceção; interceptor faz o log
  // de acesso (método/rota/status/duração) de toda request.
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new HttpLoggingInterceptor());

  // Swagger UI em /docs; spec JSON (importável no Postman) em /docs-json.
  const document = SwaggerModule.createDocument(app, OPENAPI_CONFIG);
  SwaggerModule.setup('docs', app, document, { jsonDocumentUrl: 'docs-json' });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  // Boot explícito: a porta resolvida é a 1ª coisa a conferir quando o app não
  // conecta (o mobile aponta p/ 3002 por default; a API sobe em 3000 sem PORT).
  const logger = new Logger('Bootstrap');
  logger.log(
    `API ouvindo em http://localhost:${port} · LOG_LEVEL=${process.env.LOG_LEVEL ?? 'log (default)'}`,
  );
  logger.log(`Swagger: http://localhost:${port}/docs`);
}
void bootstrap();

import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { OPENAPI_CONFIG } from './docs/openapi';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Swagger UI em /docs; spec JSON (importável no Postman) em /docs-json.
  const document = SwaggerModule.createDocument(app, OPENAPI_CONFIG);
  SwaggerModule.setup('docs', app, document, { jsonDocumentUrl: 'docs-json' });

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();

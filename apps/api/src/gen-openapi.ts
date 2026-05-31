// Gera o openapi.json (versionado) sem subir o servidor. Roda a partir do dist
// compilado (precisa de decorator metadata, que o tsc do nest build emite).
//   pnpm --filter api run openapi:gen
import './load-env';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { OPENAPI_CONFIG } from './docs/openapi';

async function main() {
  // logger off: criar o app só para extrair o doc (não escuta porta).
  const app = await NestFactory.create(AppModule, { logger: false });
  const document = SwaggerModule.createDocument(app, OPENAPI_CONFIG);
  const out = join(process.cwd(), 'openapi.json');
  writeFileSync(out, `${JSON.stringify(document, null, 2)}\n`);
  await app.close();
  const paths = document.paths ? Object.keys(document.paths).length : 0;
  console.log(`[openapi] gerado: ${out} (${paths} paths)`);
}

main().catch((e: unknown) => {
  console.error('[openapi] falhou:', e);
  process.exit(1);
});

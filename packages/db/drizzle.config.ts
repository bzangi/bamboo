import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineConfig } from 'drizzle-kit';

// .env vive na raiz do monorepo; drizzle-kit roda com cwd no pacote, então
// apontamos explicitamente pra raiz (sobe dois níveis: packages/db -> raiz).
const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, '../../.env') });

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_URL não definida (verifique o .env na raiz).');
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './migrations',
  dbCredentials: { url },
});

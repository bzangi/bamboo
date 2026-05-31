// Carrega o .env da RAIZ do monorepo. PRECISA rodar ANTES de qualquer import de
// @bamboo/db (o client do Drizzle lê process.env.DATABASE_URL no momento do import).
// Por isso é o PRIMEIRO import de main.ts / gen-openapi.ts.
//
// cwd = apps/api ao rodar via pnpm/turbo/nest start → o .env da raiz é ../../.env.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';

const candidates = [
  resolve(process.cwd(), '.env'), // apps/api/.env (se existir um local)
  resolve(process.cwd(), '../../.env'), // raiz do monorepo
];

const envPath = candidates.find((p) => existsSync(p));
if (envPath) {
  config({ path: envPath });
}

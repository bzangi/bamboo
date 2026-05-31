// Carrega o .env da RAIZ do monorepo ANTES de qualquer import de @bamboo/db
// (o client Drizzle lê process.env.DATABASE_URL no import). setupFiles do
// Vitest rodam antes dos imports dos arquivos de teste.
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(__dirname, '../../../.env') });

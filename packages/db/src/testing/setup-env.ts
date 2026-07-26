// Carrega o .env da RAIZ do monorepo ANTES de qualquer import de ./client.js
// (o client Drizzle lê process.env.DATABASE_URL no import). setupFiles do Vitest
// rodam antes dos imports dos arquivos de teste.
import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, "../../../../.env") });

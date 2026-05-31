// @bamboo/db — client Drizzle sobre pool pg.
// A connection string vem de DATABASE_URL (carregada pela casca/app antes do import).
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL não definida no ambiente.');
}

export const pool = new Pool({ connectionString });

export const db = drizzle(pool, { schema });

export { schema };

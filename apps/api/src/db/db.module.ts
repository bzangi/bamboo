import { Global, Module } from '@nestjs/common';
import { db } from '@bamboo/db';

// Token de injeção do client Drizzle. O client é singleton (lê DATABASE_URL no
// import de @bamboo/db). Global pra qualquer feature injetar sem reimportar.
export const DB = 'DB';

export type Db = typeof db;

@Global()
@Module({
  providers: [{ provide: DB, useValue: db }],
  exports: [DB],
})
export class DbModule {}

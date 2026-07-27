// Quem é a nutricionista responsável, no v0 (auth stub).
//
// Extraído da 016 quando o segundo chamador apareceu (grupos de substituição
// customizados, 017). A lógica é dela, e o comentário que a justifica também:
//
// `limit(2)` distingue os TRÊS casos numa query só. NÃO usar `limit(1)`:
// pendurar dado da nutri errada é pior que falhar, e com a credencial stub o
// sistema não tem como saber qual das duas é a responsável.
import { UnprocessableEntityException } from '@nestjs/common';
import { asc, schema } from '@bamboo/db';
import type { Tx } from '../plano-editor/cascata';

export const COMANDO_SEED =
  'pnpm --filter @bamboo/db exec node --env-file=../../.env --import tsx scripts/seed.ts';

/** O id da única nutricionista. Lança 422 orientado quando há zero ou mais de uma. */
export async function resolverNutricionista(tx: Tx): Promise<string> {
  const [primeira, segunda] = await tx
    .select({ id: schema.nutritionist.id })
    .from(schema.nutritionist)
    .orderBy(asc(schema.nutritionist.createdAt), asc(schema.nutritionist.id))
    .limit(2);

  if (!primeira) {
    throw new UnprocessableEntityException(
      `nenhuma nutricionista cadastrada: rode o seed (${COMANDO_SEED})`,
    );
  }
  if (segunda) {
    throw new UnprocessableEntityException(
      'mais de uma nutricionista cadastrada: a credencial stub não distingue qual é a responsável — isso entra com a auth real',
    );
  }
  return primeira.id;
}

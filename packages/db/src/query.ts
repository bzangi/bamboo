// Re-export dos operadores de query do Drizzle a partir do @bamboo/db.
//
// Por quê: @bamboo/db é um pacote ESM ("type":"module"); seus tipos de schema
// referenciam o drizzle-orm na resolução "import" (index.d.ts). A casca
// (apps/api) é CJS e, ao importar drizzle-orm direto, resolve a variante
// "require" (index.d.cts) — duas declarações distintas da classe SQL, o que
// quebra o type-check ("separate declarations of a private property"). Importar
// os operadores DAQUI faz a casca usar a MESMA instância de tipos do schema.
export {
  and,
  asc,
  desc,
  eq,
  ne,
  gt,
  gte,
  lt,
  lte,
  isNull,
  isNotNull,
  inArray,
  sql,
} from "drizzle-orm";

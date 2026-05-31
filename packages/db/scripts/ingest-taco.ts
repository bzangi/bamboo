// packages/db/scripts/ingest-taco.ts
//
// T011 — Ingestão da base TACO (Tabela Brasileira de Composição de Alimentos,
// NEPA/UNICAMP). Popula `food` (macros por 100 g) e `food_household_measure`
// (medidas caseiras: "1 escumadeira" = X g).
//
// DADO DE SAÚDE — valores nutricionais REAIS, nunca inventados.
// Duas fontes possíveis, nesta ordem:
//
//   1. DOWNLOADED (padrão): baixa uma conversão pública da TACO em JSON e
//      filtra para um SUBCONJUNTO CURADO de alimentos comuns (allow-list por
//      `id` da TACO). Os macros vêm direto do dataset — não tocamos os números.
//      Repositório: github.com/danperrout/tabelataco (public/TACO.json), que é
//      uma conversão fiel da tabela TACO do NEPA/UNICAMP. Configurável por
//      TACO_DATA_PATH (arquivo local) ou TACO_DATA_URL (URL alternativa).
//
//   2. CURATED (fallback offline): se o download falhar, usa os MESMOS valores
//      reais da TACO embutidos no script (espelham 1:1 os IDs da allow-list).
//      Logamos explicitamente qual modo foi usado e a base dos valores.
//
// Idempotente e FK-safe: faz upsert de `food` por nome (atualiza macros mantendo
// o id, substitui as medidas caseiras). NÃO deleta `food`, então re-ingestar é
// seguro mesmo DEPOIS do seed — sem violar a FK de food_substitution_group/meal_item.
//
// Execução (carregando .env):
//   node --env-file=.env --import tsx packages/db/scripts/ingest-taco.ts
// (o script também faz `import 'dotenv/config'` como rede de segurança.)

import "dotenv/config";
import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { db, pool, food, foodHouseholdMeasure } from "../src/index.js";

/* ============================================================
 * Allow-list: subconjunto curado de alimentos comuns.
 * `tacoId` = id da TACO (estável entre as conversões do dataset). Mantido como
 * a CHAVE de match no modo downloaded e como referência no curado. Macros do
 * modo curado abaixo são os VALORES REAIS da TACO desses mesmos IDs.
 * ============================================================ */

type Macro = {
  readonly kcalPer100g: number;
  readonly carbPer100g: number;
  readonly proteinPer100g: number;
  readonly fatPer100g: number;
  readonly fiberPer100g: number | null;
};

type CuratedFood = {
  readonly tacoId: number;
  // Nome de exibição (curto e usável na UI; o dataset usa formato "Grupo, qualificador").
  readonly name: string;
  readonly measures: ReadonlyArray<{
    readonly label: string;
    readonly grams: number;
  }>;
  // Valores REAIS da TACO (id correspondente). Usados só no fallback curado.
  readonly macros: Macro;
};

// Carboidratos + proteínas comuns (+ alguns acompanhamentos úteis pro seed).
// Valores conferidos contra public/TACO.json de danperrout/tabelataco (TACO NEPA/UNICAMP).
const CURATED: ReadonlyArray<CuratedFood> = [
  // ---- Carboidratos ----
  {
    tacoId: 3,
    name: "Arroz branco cozido",
    measures: [
      { label: "colher de sopa cheia", grams: 25 },
      { label: "escumadeira", grams: 90 },
    ],
    macros: {
      kcalPer100g: 128.26,
      carbPer100g: 28.06,
      proteinPer100g: 2.52,
      fatPer100g: 0.23,
      fiberPer100g: 1.56,
    },
  },
  {
    tacoId: 91,
    name: "Batata inglesa cozida",
    measures: [
      { label: "unidade média", grams: 100 },
      { label: "colher de sopa cheia", grams: 30 },
    ],
    macros: {
      kcalPer100g: 51.59,
      carbPer100g: 11.94,
      proteinPer100g: 1.16,
      fatPer100g: 0,
      fiberPer100g: 1.34,
    },
  },
  {
    tacoId: 88,
    name: "Batata doce cozida",
    measures: [
      { label: "unidade média", grams: 130 },
      { label: "fatia média", grams: 45 },
    ],
    macros: {
      kcalPer100g: 76.76,
      carbPer100g: 18.42,
      proteinPer100g: 0.64,
      fatPer100g: 0.09,
      fiberPer100g: 2.21,
    },
  },
  {
    tacoId: 129,
    name: "Mandioca (aipim) cozida",
    measures: [
      { label: "pedaço médio", grams: 70 },
      { label: "colher de sopa cheia", grams: 30 },
    ],
    macros: {
      kcalPer100g: 125.36,
      carbPer100g: 30.09,
      proteinPer100g: 0.58,
      fatPer100g: 0.3,
      fiberPer100g: 1.56,
    },
  },
  {
    tacoId: 40,
    name: "Macarrão de trigo (cru)",
    measures: [{ label: "porção média (cru)", grams: 80 }],
    macros: {
      kcalPer100g: 371.12,
      carbPer100g: 77.94,
      proteinPer100g: 10.0,
      fatPer100g: 1.3,
      fiberPer100g: 2.93,
    },
  },
  {
    tacoId: 53,
    name: "Pão francês",
    measures: [{ label: "unidade", grams: 50 }],
    macros: {
      kcalPer100g: 299.81,
      carbPer100g: 58.65,
      proteinPer100g: 7.95,
      fatPer100g: 3.1,
      fiberPer100g: 2.31,
    },
  },
  {
    tacoId: 7,
    name: "Aveia em flocos",
    measures: [{ label: "colher de sopa cheia", grams: 15 }],
    macros: {
      kcalPer100g: 393.82,
      carbPer100g: 66.64,
      proteinPer100g: 13.92,
      fatPer100g: 8.5,
      fiberPer100g: 9.13,
    },
  },
  {
    tacoId: 561,
    name: "Feijão carioca cozido",
    measures: [
      { label: "concha média", grams: 80 },
      { label: "colher de sopa cheia", grams: 30 },
    ],
    macros: {
      kcalPer100g: 76.42,
      carbPer100g: 13.59,
      proteinPer100g: 4.78,
      fatPer100g: 0.54,
      fiberPer100g: 8.51,
    },
  },

  // ---- Proteínas ----
  {
    tacoId: 377,
    name: "Patinho bovino grelhado",
    measures: [
      { label: "bife médio", grams: 100 },
      { label: "colher de sopa cheia", grams: 35 },
    ],
    macros: {
      kcalPer100g: 219.26,
      carbPer100g: 0,
      proteinPer100g: 35.9,
      fatPer100g: 7.31,
      fiberPer100g: null,
    },
  },
  {
    tacoId: 351,
    name: "Coxão mole bovino cozido",
    measures: [{ label: "porção média", grams: 100 }],
    macros: {
      kcalPer100g: 218.68,
      carbPer100g: 0,
      proteinPer100g: 32.38,
      fatPer100g: 8.91,
      fiberPer100g: null,
    },
  },
  {
    tacoId: 326,
    name: "Carne moída (acém) cozida",
    measures: [{ label: "colher de sopa cheia", grams: 30 }],
    macros: {
      kcalPer100g: 212.42,
      carbPer100g: 0,
      proteinPer100g: 26.69,
      fatPer100g: 10.92,
      fiberPer100g: null,
    },
  },
  {
    tacoId: 488,
    name: "Ovo de galinha cozido",
    measures: [{ label: "unidade média", grams: 50 }],
    macros: {
      kcalPer100g: 145.7,
      carbPer100g: 0.61,
      proteinPer100g: 13.29,
      fatPer100g: 9.48,
      fiberPer100g: null,
    },
  },
  {
    tacoId: 308,
    name: "Filé de pescada frito",
    measures: [{ label: "filé médio", grams: 100 }],
    macros: {
      kcalPer100g: 154.27,
      carbPer100g: 0,
      proteinPer100g: 28.59,
      fatPer100g: 3.57,
      fiberPer100g: null,
    },
  },
  {
    tacoId: 307,
    name: "Filé de pescada (cru)",
    measures: [{ label: "filé médio", grams: 120 }],
    macros: {
      kcalPer100g: 107.21,
      carbPer100g: 0,
      proteinPer100g: 16.65,
      fatPer100g: 4.0,
      fiberPer100g: null,
    },
  },
  {
    tacoId: 278,
    name: "Atum fresco (cru)",
    measures: [{ label: "posta média", grams: 120 }],
    macros: {
      kcalPer100g: 117.5,
      carbPer100g: 0,
      proteinPer100g: 25.68,
      fatPer100g: 0.87,
      fiberPer100g: null,
    },
  },
  {
    tacoId: 277,
    name: "Atum em conserva (óleo)",
    measures: [{ label: "lata drenada", grams: 100 }],
    macros: {
      kcalPer100g: 165.91,
      carbPer100g: 0,
      proteinPer100g: 26.19,
      fatPer100g: 5.99,
      fiberPer100g: null,
    },
  },

  // ---- Acompanhamentos / frutas / laticínios (úteis pro seed do plano) ----
  {
    tacoId: 179,
    name: "Banana nanica",
    measures: [{ label: "unidade média", grams: 85 }],
    macros: {
      kcalPer100g: 91.53,
      carbPer100g: 23.85,
      proteinPer100g: 1.4,
      fatPer100g: 0.12,
      fiberPer100g: 1.95,
    },
  },
  {
    tacoId: 221,
    name: "Maçã com casca",
    measures: [{ label: "unidade média", grams: 130 }],
    macros: {
      kcalPer100g: 62.53,
      carbPer100g: 16.59,
      proteinPer100g: 0.23,
      fatPer100g: 0.25,
      fiberPer100g: 2.03,
    },
  },
  {
    tacoId: 100,
    name: "Brócolis cozido",
    measures: [{ label: "colher de sopa cheia", grams: 25 }],
    macros: {
      kcalPer100g: 24.64,
      carbPer100g: 4.37,
      proteinPer100g: 2.13,
      fatPer100g: 0.46,
      fiberPer100g: 3.42,
    },
  },
  {
    tacoId: 110,
    name: "Cenoura crua",
    measures: [{ label: "unidade média", grams: 80 }],
    macros: {
      kcalPer100g: 34.14,
      carbPer100g: 7.66,
      proteinPer100g: 1.32,
      fatPer100g: 0.17,
      fiberPer100g: 3.18,
    },
  },
  {
    tacoId: 161,
    name: "Tomate (salada)",
    measures: [{ label: "unidade média", grams: 90 }],
    macros: {
      kcalPer100g: 20.55,
      carbPer100g: 5.12,
      proteinPer100g: 0.81,
      fatPer100g: 0,
      fiberPer100g: 2.27,
    },
  },
  {
    tacoId: 79,
    name: "Alface lisa crua",
    measures: [{ label: "folha", grams: 10 }],
    macros: {
      kcalPer100g: 13.82,
      carbPer100g: 2.43,
      proteinPer100g: 1.69,
      fatPer100g: 0.12,
      fiberPer100g: 2.33,
    },
  },
  {
    tacoId: 448,
    name: "Iogurte natural",
    measures: [{ label: "pote", grams: 170 }],
    macros: {
      kcalPer100g: 51.49,
      carbPer100g: 1.92,
      proteinPer100g: 4.06,
      fatPer100g: 3.04,
      fiberPer100g: null,
    },
  },
];

// IDs da allow-list usados para filtrar o dataset baixado.
const ALLOWED_IDS = new Set(CURATED.map((c) => c.tacoId));
// Mapa tacoId -> metadados curados (nome + medidas) que aplicamos sobre o dataset.
const CURATED_BY_ID = new Map(CURATED.map((c) => [c.tacoId, c]));

/* ============================================================
 * Dataset baixado: shape mínimo que consumimos.
 * Campos numéricos podem vir como "Tr" (traço), "NA" ou "" — normalizamos.
 * ============================================================ */

const DEFAULT_TACO_URL =
  "https://raw.githubusercontent.com/danperrout/tabelataco/master/public/TACO.json";

type RawTacoRow = {
  readonly id: number;
  readonly description: string;
  readonly energy_kcal: number | string;
  readonly carbohydrate_g: number | string;
  readonly protein_g: number | string;
  readonly lipid_g: number | string;
  readonly fiber_g: number | string;
};

// "Tr" (traço) -> 0; "NA"/"" -> null. Número -> número.
function parseNutrient(raw: number | string | null | undefined): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const t = raw.trim();
    if (t === "" || t.toUpperCase() === "NA") return null;
    if (t.toLowerCase() === "tr") return 0; // traço -> tratado como 0
    const n = Number(t.replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

type FoodToInsert = {
  readonly name: string;
  readonly macros: Macro;
  readonly measures: ReadonlyArray<{
    readonly label: string;
    readonly grams: number;
  }>;
};

/* ============================================================
 * Modo DOWNLOADED: lê de TACO_DATA_PATH (local) ou baixa a URL, filtra pela
 * allow-list, normaliza sentinels e exige que os 4 macros principais existam.
 * ============================================================ */

async function loadRawDataset(): Promise<RawTacoRow[] | null> {
  const localPath = process.env.TACO_DATA_PATH;
  if (localPath) {
    try {
      const text = await readFile(localPath, "utf8");
      console.log(`[taco] lendo dataset local: ${localPath}`);
      return JSON.parse(text) as RawTacoRow[];
    } catch (e) {
      console.warn(
        `[taco] falha ao ler TACO_DATA_PATH (${localPath}): ${(e as Error).message}`,
      );
      return null;
    }
  }

  const url = process.env.TACO_DATA_URL ?? DEFAULT_TACO_URL;
  try {
    console.log(`[taco] baixando dataset: ${url}`);
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) {
      console.warn(`[taco] download retornou HTTP ${res.status}`);
      return null;
    }
    return (await res.json()) as RawTacoRow[];
  } catch (e) {
    console.warn(`[taco] falha no download: ${(e as Error).message}`);
    return null;
  }
}

function buildFromDataset(rows: RawTacoRow[]): {
  foods: FoodToInsert[];
  missingIds: number[];
} {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const foods: FoodToInsert[] = [];
  const missingIds: number[] = [];

  for (const curated of CURATED) {
    const row = byId.get(curated.tacoId);
    if (!row) {
      missingIds.push(curated.tacoId);
      continue;
    }
    const kcal = parseNutrient(row.energy_kcal);
    const carb = parseNutrient(row.carbohydrate_g);
    const protein = parseNutrient(row.protein_g);
    const fat = parseNutrient(row.lipid_g);
    const fiber = parseNutrient(row.fiber_g);

    // Macros principais são NOT NULL no schema; se faltar algum, pula o item
    // (não inventamos valor de dado de saúde).
    if (kcal === null || carb === null || protein === null || fat === null) {
      console.warn(
        `[taco] id ${curated.tacoId} ("${row.description}") sem macro principal completo — pulado.`,
      );
      missingIds.push(curated.tacoId);
      continue;
    }

    foods.push({
      name: curated.name,
      measures: curated.measures,
      macros: {
        kcalPer100g: round2(kcal),
        carbPer100g: round2(carb),
        proteinPer100g: round2(protein),
        fatPer100g: round2(fat),
        fiberPer100g: fiber === null ? null : round2(fiber),
      },
    });
  }

  return { foods, missingIds };
}

function buildFromCurated(): FoodToInsert[] {
  return CURATED.map((c) => ({
    name: c.name,
    macros: c.macros,
    measures: c.measures,
  }));
}

/* ============================================================
 * Persistência (idempotente, transacional).
 * ============================================================ */

async function persist(foods: ReadonlyArray<FoodToInsert>): Promise<{
  foodCount: number;
  measureCount: number;
}> {
  return db.transaction(async (tx) => {
    // Idempotente E FK-safe: upsert por nome. NÃO deletamos `food` — ela pode já
    // estar referenciada por food_substitution_group / meal_item (se o seed já
    // rodou). Preservar o id mantém essas FKs válidas; re-ingestar é seguro a
    // qualquer momento.
    const existing = await tx
      .select({ id: food.id, name: food.name })
      .from(food);
    const idByName = new Map(existing.map((r) => [r.name, r.id]));

    let foodCount = 0;
    let measureCount = 0;

    for (const f of foods) {
      const macros = {
        source: "taco" as const,
        kcalPer100g: f.macros.kcalPer100g,
        carbPer100g: f.macros.carbPer100g,
        proteinPer100g: f.macros.proteinPer100g,
        fatPer100g: f.macros.fatPer100g,
        fiberPer100g: f.macros.fiberPer100g,
      };

      let foodId: string;
      const existingId = idByName.get(f.name);
      if (existingId) {
        // Atualiza macros mantendo o id (FKs do seed intactas).
        await tx.update(food).set(macros).where(eq(food.id, existingId));
        // Medidas caseiras não são referenciadas: substitui sem risco de FK.
        await tx
          .delete(foodHouseholdMeasure)
          .where(eq(foodHouseholdMeasure.foodId, existingId));
        foodId = existingId;
      } else {
        const [inserted] = await tx
          .insert(food)
          .values({ name: f.name, ...macros })
          .returning({ id: food.id });
        if (!inserted) throw new Error(`falha ao inserir food: ${f.name}`);
        foodId = inserted.id;
      }

      foodCount += 1;

      if (f.measures.length > 0) {
        await tx
          .insert(foodHouseholdMeasure)
          .values(
            f.measures.map((m) => ({ foodId, label: m.label, grams: m.grams })),
          );
        measureCount += f.measures.length;
      }
    }

    return { foodCount, measureCount };
  });
}

/* ============================================================
 * Orquestração.
 * ============================================================ */

async function main(): Promise<void> {
  const raw = await loadRawDataset();

  let foods: FoodToInsert[];
  let mode: "downloaded" | "curated";

  if (raw && Array.isArray(raw) && raw.length > 0) {
    const { foods: built, missingIds } = buildFromDataset(raw);
    if (built.length === 0) {
      console.warn(
        "[taco] dataset baixado não cobriu nenhum item da allow-list — usando subconjunto curado.",
      );
      foods = buildFromCurated();
      mode = "curated";
    } else {
      foods = built;
      mode = "downloaded";
      console.log(
        `[taco] MODO: downloaded — ${built.length}/${CURATED.length} alimentos da allow-list extraídos do dataset (TACO/NEPA-UNICAMP via danperrout/tabelataco).`,
      );
      if (missingIds.length > 0) {
        console.warn(
          `[taco] IDs não encontrados/incompletos no dataset: ${missingIds.join(", ")}`,
        );
      }
    }
  } else {
    foods = buildFromCurated();
    mode = "curated";
    console.log(
      `[taco] MODO: curated (offline) — subconjunto de ${foods.length} alimentos comuns. VALORES REAIS DA TACO (NEPA/UNICAMP), conferidos contra a conversão danperrout/tabelataco. Nenhum valor inventado.`,
    );
  }

  const { foodCount, measureCount } = await persist(foods);

  console.log(
    `[taco] OK — inseridos ${foodCount} alimentos e ${measureCount} medidas caseiras (modo: ${mode}).`,
  );

  // Spot-check: loga alguns alimentos com macros, lendo de volta do banco.
  const sample = await db
    .select({
      name: food.name,
      kcal: food.kcalPer100g,
      carb: food.carbPer100g,
      protein: food.proteinPer100g,
      fat: food.fatPer100g,
      fiber: food.fiberPer100g,
    })
    .from(food)
    .limit(4);

  console.log("[taco] spot-check (por 100 g):");
  for (const s of sample) {
    console.log(
      `  - ${s.name}: ${s.kcal} kcal | carb ${s.carb} g | prot ${s.protein} g | gord ${s.fat} g | fibra ${s.fiber ?? "—"} g`,
    );
  }
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error("[taco] ERRO:", err);
    await pool.end();
    process.exit(1);
  });

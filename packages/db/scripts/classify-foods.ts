// classify-foods.ts — auto-classificação em lote (Feature 008). Operação
// re-executável (seed-first): para cada `food` SEM vínculo, mapeia categoria
// TACO → grupo canônico (núcleo puro `classificarAlimento`) e grava o vínculo
// `origin='auto'` com a porção de referência derivada. Idempotente e
// incremental: só classifica os sem-vínculo; NUNCA toca manual nem auto
// existentes (FR-008/FR-009/FR-010/FR-011). Imprime o relatório de cobertura.
//
//   node --env-file=.env --import tsx packages/db/scripts/classify-foods.ts [--dry-run] [--validar-gabarito]
//
// --dry-run         calcula e relata, sem escrever.
// --validar-gabarito  classifica às cegas os vínculos `manual`, compara com a
//                     curadoria (núcleo `validarGabarito`) e sai com código 1
//                     se o acerto < 90% (gatilho de reversão da vigência — SC-002).

import "dotenv/config";
import { eq, notInArray } from "drizzle-orm";
import {
  classificarAlimento,
  validarGabarito,
  type GrupoCanonico,
  type Classificacao,
} from "@bamboo/core";
import {
  db,
  pool,
  food,
  substitutionGroup,
  foodSubstitutionGroup,
  GRUPOS_CANONICOS,
  GUARDAS_CLASSIFICACAO,
  type Basis,
} from "../src/index.js";

const LIMITE_GABARITO_PCT = 90; // SC-002

// Monta os GrupoCanonico (entrada do núcleo) resolvendo o id real de cada grupo
// por nome e a âncora = MEDIANA da curadoria existente do grupo (fallback da
// tabela se não houver curadoria). Pura sobre os dados carregados.
function montarGrupos(
  idByNome: Map<string, string>,
  curadosPorGrupo: Map<string, number[]>, // groupId → lista de (refPortion × basis/100) curados
): GrupoCanonico[] {
  return GRUPOS_CANONICOS.flatMap((def) => {
    const id = idByNome.get(def.nome);
    if (!id) return [];
    const amostras = curadosPorGrupo.get(id) ?? [];
    const ancora =
      amostras.length > 0
        ? mediana(amostras)
        : def.ancoraFallbackGramasDoNutriente;
    return [
      {
        id,
        basis: def.basis as Basis,
        categoriasFonte: def.categoriasFonte,
        ancoraGramasDoNutriente: ancora,
        carbMinPer100g: def.carbMinPer100g,
        fallbackDaBase: def.fallbackDaBase,
      },
    ];
  });
}

const mediana = (xs: readonly number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
};

async function rodarLote(dryRun: boolean): Promise<void> {
  const grupos = await db
    .select({ id: substitutionGroup.id, name: substitutionGroup.name })
    .from(substitutionGroup);
  const idByNome = new Map(grupos.map((g) => [g.name, g.id]));

  // Âncoras = mediana da curadoria manual por grupo.
  const curadosPorGrupo = await medianasCuradas(idByNome);
  const gruposNucleo = montarGrupos(idByNome, curadosPorGrupo);

  // Foods SEM vínculo (incremental) — só estes são classificados.
  const semVinculo = await db
    .select({
      id: food.id,
      name: food.name,
      tacoCategory: food.tacoCategory,
      carbPer100g: food.carbPer100g,
      proteinPer100g: food.proteinPer100g,
      fatPer100g: food.fatPer100g,
      kcalPer100g: food.kcalPer100g,
    })
    .from(food)
    .where(
      notInArray(
        food.id,
        db
          .select({ id: foodSubstitutionGroup.foodId })
          .from(foodSubstitutionGroup),
      ),
    );

  const porGrupo = new Map<string, number>();
  const semGrupoPorMotivo = new Map<string, number>();
  const aInserir: { foodId: string; groupId: string; portion: number }[] = [];

  for (const f of semVinculo) {
    const r = classificarAlimento({
      tacoCategory: f.tacoCategory,
      macros: {
        carbPer100g: f.carbPer100g,
        proteinPer100g: f.proteinPer100g,
        fatPer100g: f.fatPer100g,
        kcalPer100g: f.kcalPer100g,
      },
      grupos: gruposNucleo,
      guardas: GUARDAS_CLASSIFICACAO,
    });
    if (r.kind === "vinculo") {
      aInserir.push({
        foodId: f.id,
        groupId: r.grupoId,
        portion: r.referencePortionGrams,
      });
      porGrupo.set(r.grupoId, (porGrupo.get(r.grupoId) ?? 0) + 1);
    } else {
      semGrupoPorMotivo.set(
        r.motivo,
        (semGrupoPorMotivo.get(r.motivo) ?? 0) + 1,
      );
    }
  }

  if (!dryRun && aInserir.length > 0) {
    await db.transaction(async (tx) => {
      // Lotes de 500 pra não estourar parâmetros.
      for (let i = 0; i < aInserir.length; i += 500) {
        await tx.insert(foodSubstitutionGroup).values(
          aInserir.slice(i, i + 500).map((x) => ({
            foodId: x.foodId,
            groupId: x.groupId,
            referencePortionGrams: x.portion,
            origin: "auto" as const,
          })),
        );
      }
    });
  }

  // -------- relatório de cobertura (FR-012/SC-001/SC-007) --------
  const totalSemVinculo = semVinculo.length;
  const classificados = aInserir.length;
  const semGrupo = totalSemVinculo - classificados;
  console.log(
    `\n[classify] ${dryRun ? "(dry-run) " : ""}base sem vínculo: ${totalSemVinculo} | classificados: ${classificados} | sem-grupo: ${semGrupo}`,
  );
  console.log("[classify] classificados por grupo:");
  for (const def of GRUPOS_CANONICOS) {
    const id = idByNome.get(def.nome);
    const n = id ? (porGrupo.get(id) ?? 0) : 0;
    console.log(`  - ${def.nome}: ${n}`);
  }
  console.log("[classify] sem-grupo por motivo:");
  for (const [motivo, n] of semGrupoPorMotivo) {
    console.log(`  - ${motivo}: ${n}`);
  }
  // Grupos vazios após a execução (sem nenhum vínculo).
  const aposVinculos = await db
    .select({ groupId: foodSubstitutionGroup.groupId })
    .from(foodSubstitutionGroup);
  const comAlgum = new Set(aposVinculos.map((v) => v.groupId));
  const vazios = grupos.filter((g) => !comAlgum.has(g.id)).map((g) => g.name);
  if (vazios.length > 0) console.log(`[classify] grupos vazios: ${vazios.join(", ")}`);

  // Cobertura = classificados ÷ (classificados + sem-grupo elegíveis por
  // categoria). Reportamos sobre a base sem-vínculo com dados completos.
  const coberturaPct =
    totalSemVinculo === 0 ? 100 : (classificados / totalSemVinculo) * 100;
  console.log(
    `[classify] cobertura sobre a base sem-vínculo: ${coberturaPct.toFixed(1)}%`,
  );
}

// Mediana curada por grupo (g do nutriente "por troca"), pra ancorar a porção.
async function medianasCuradas(
  idByNome: Map<string, string>,
): Promise<Map<string, number[]>> {
  const basisById = new Map(
    GRUPOS_CANONICOS.flatMap((d) => {
      const id = idByNome.get(d.nome);
      return id ? [[id, d.basis as Basis] as const] : [];
    }),
  );
  const manuais = await db
    .select({
      groupId: foodSubstitutionGroup.groupId,
      referencePortionGrams: foodSubstitutionGroup.referencePortionGrams,
      carbPer100g: food.carbPer100g,
      proteinPer100g: food.proteinPer100g,
      fatPer100g: food.fatPer100g,
    })
    .from(foodSubstitutionGroup)
    .innerJoin(food, eq(foodSubstitutionGroup.foodId, food.id))
    .where(eq(foodSubstitutionGroup.origin, "manual"));
  const out = new Map<string, number[]>();
  for (const m of manuais) {
    const basis = basisById.get(m.groupId);
    if (!basis) continue;
    const teor =
      basis === "carb"
        ? m.carbPer100g
        : basis === "protein"
          ? m.proteinPer100g
          : m.fatPer100g;
    const g = m.referencePortionGrams * (teor / 100);
    const lista = out.get(m.groupId) ?? [];
    lista.push(g);
    out.set(m.groupId, lista);
  }
  return out;
}

// --validar-gabarito: classifica às cegas os vínculos `manual` e compara.
async function validarGabaritoMode(): Promise<number> {
  const grupos = await db
    .select({ id: substitutionGroup.id, name: substitutionGroup.name })
    .from(substitutionGroup);
  const idByNome = new Map(grupos.map((g) => [g.name, g.id]));
  const nomeById = new Map(grupos.map((g) => [g.id, g.name]));
  const curadosPorGrupo = await medianasCuradas(idByNome);
  const gruposNucleo = montarGrupos(idByNome, curadosPorGrupo);

  const manuais = await db
    .select({
      foodId: foodSubstitutionGroup.foodId,
      groupId: foodSubstitutionGroup.groupId,
      tacoCategory: food.tacoCategory,
      carbPer100g: food.carbPer100g,
      proteinPer100g: food.proteinPer100g,
      fatPer100g: food.fatPer100g,
      kcalPer100g: food.kcalPer100g,
    })
    .from(foodSubstitutionGroup)
    .innerJoin(food, eq(foodSubstitutionGroup.foodId, food.id))
    .where(eq(foodSubstitutionGroup.origin, "manual"));

  const casos = manuais.map((m) => ({
    foodId: m.foodId,
    grupoCuradoId: m.groupId,
    classificacao: classificarAlimento({
      tacoCategory: m.tacoCategory,
      macros: {
        carbPer100g: m.carbPer100g,
        proteinPer100g: m.proteinPer100g,
        fatPer100g: m.fatPer100g,
        kcalPer100g: m.kcalPer100g,
      },
      grupos: gruposNucleo,
      guardas: GUARDAS_CLASSIFICACAO,
    }) as Classificacao,
  }));

  const r = validarGabarito(casos);
  console.log(
    `\n[gabarito] ${r.acertos}/${r.total} acertos (${r.acertoPct.toFixed(1)}%) — limite ${LIMITE_GABARITO_PCT}%`,
  );
  for (const d of r.divergencias) {
    console.log(
      `  ✗ esperado=${nomeById.get(d.esperado) ?? d.esperado} obtido=${d.obtido ? nomeById.get(d.obtido) : "sem-grupo"}`,
    );
  }
  return r.acertoPct;
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  if (args.has("--validar-gabarito")) {
    const pct = await validarGabaritoMode();
    if (pct < LIMITE_GABARITO_PCT) {
      console.error(
        `[gabarito] REPROVADO (${pct.toFixed(1)}% < ${LIMITE_GABARITO_PCT}%) — gatilho de reversão da vigência (SC-002).`,
      );
      process.exitCode = 1;
    } else {
      console.log("[gabarito] OK.");
    }
    return;
  }
  await rodarLote(args.has("--dry-run"));
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error("[classify] ERRO:", err);
    await pool.end();
    process.exit(1);
  });

// packages/db/scripts/seed.ts
//
// T013 — Seed do plano (Fase 1). Semeia o lado de PLANO do banco para provar a
// tese da "alça do paciente" SEM precisar da UI da nutri (seed-first):
//   1 nutri, 1 paciente, grupos de substituição (Carboidratos/Proteínas),
//   associação alimento↔grupo (a "1 troca" do exchange), 1 plano ativo com
//   tipos-de-dia (treino/descanso), programação semanal (7 dias), refeições
//   (com horário informativo em algumas), opções (incl. um almoço com 2–3
//   opções) e itens com mix travado/flexível.
//
// PRESSUPOSTO: `food` e `food_household_measure` JÁ populados pela ingestão TACO
// (T011/T012). Este script NÃO toca essas tabelas — só semeia o plano e os
// grupos, casando os foods da TACO POR NOME.
//
// Idempotente: limpa as tabelas de PLANO na ordem de FK (filhas → pais) antes
// de inserir. Roda quantas vezes quiser sem duplicar.
//
// Execução (carregando .env):
//   node --env-file=.env --import tsx packages/db/scripts/seed.ts
// (o script também faz `import 'dotenv/config'` como rede de segurança.)

import "dotenv/config";
import { sql } from "drizzle-orm";
import {
  db,
  pool,
  food,
  nutritionist,
  patient,
  substitutionGroup,
  foodSubstitutionGroup,
  plan,
  dayType,
  daySchedule,
  meal,
  mealOption,
  mealItem,
} from "../src/index.js";

/* ============================================================
 * Configuração declarativa do seed.
 * Foods referenciados POR NOME (devem existir via ingestão TACO).
 * ============================================================ */

// Grupos de substituição e os foods associados, com reference_portion_grams
// (a porção de referência do alimento dentro do grupo — origem do recálculo).
// Cada grupo tem >=2 foods → garante substitutos reais.
const GROUPS = [
  {
    name: "Carboidratos",
    basis: "carb" as const,
    foods: [
      { name: "Arroz branco cozido", referencePortionGrams: 100 },
      { name: "Batata inglesa cozida", referencePortionGrams: 150 },
      { name: "Batata doce cozida", referencePortionGrams: 120 },
      { name: "Mandioca (aipim) cozida", referencePortionGrams: 100 },
    ],
  },
  {
    name: "Proteínas",
    basis: "protein" as const,
    foods: [
      { name: "Patinho bovino grelhado", referencePortionGrams: 100 },
      { name: "Ovo de galinha cozido", referencePortionGrams: 50 },
      { name: "Coxão mole bovino cozido", referencePortionGrams: 100 },
      { name: "Filé de pescada frito", referencePortionGrams: 100 },
    ],
  },
] as const;

/* ============================================================
 * Limpeza idempotente (ordem de FK: filhas → pais).
 * NÃO apaga food / food_household_measure (vêm da ingestão TACO).
 * ============================================================ */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function clearPlanTables(tx: Tx): Promise<void> {
  await tx.execute(sql`DELETE FROM ${mealItem}`);
  await tx.execute(sql`DELETE FROM ${mealOption}`);
  await tx.execute(sql`DELETE FROM ${meal}`);
  await tx.execute(sql`DELETE FROM ${daySchedule}`);
  await tx.execute(sql`DELETE FROM ${dayType}`);
  await tx.execute(sql`DELETE FROM ${plan}`);
  await tx.execute(sql`DELETE FROM ${foodSubstitutionGroup}`);
  await tx.execute(sql`DELETE FROM ${substitutionGroup}`);
  await tx.execute(sql`DELETE FROM ${patient}`);
  await tx.execute(sql`DELETE FROM ${nutritionist}`);
}

/* ============================================================
 * Seed (transacional).
 * ============================================================ */

type SeedResult = {
  readonly nutritionistId: string;
  readonly patientId: string;
  readonly planId: string;
  readonly groupIds: Record<string, string>;
  readonly counts: Record<string, number>;
  // Um item flexível com substitutos reais (útil para o teste de API).
  readonly flexibleItem: {
    readonly itemId: string;
    readonly foodName: string;
    readonly groupName: string;
    readonly substituteCount: number;
  };
};

async function seed(): Promise<SeedResult> {
  return db.transaction(async (tx) => {
    await clearPlanTables(tx);

    // -------- foods da TACO (por nome) --------
    // Carrega TODA a base TACO num mapa nome->id (foods de grupo + itens soltos).
    const foods = await tx.select({ id: food.id, name: food.name }).from(food);
    const foodIdByName = new Map(foods.map((f) => [f.name, f.id]));

    // Nomes referenciados pelo seed (grupos + itens soltos das refeições).
    const referencedNames = [
      ...GROUPS.flatMap((g) => g.foods.map((f) => f.name)),
      "Aveia em flocos",
      "Banana nanica",
      "Feijão carioca cozido",
      "Alface lisa crua",
      "Brócolis cozido",
      "Tomate (salada)",
      "Maçã com casca",
      "Cenoura crua",
    ];
    const missing = Array.from(new Set(referencedNames)).filter(
      (n) => !foodIdByName.has(n),
    );
    if (missing.length > 0) {
      throw new Error(
        `Foods da TACO ausentes (rode a ingestão T011/T012 antes): ${missing.join(", ")}`,
      );
    }
    const foodId = (name: string): string => {
      const id = foodIdByName.get(name);
      if (!id) throw new Error(`food não encontrado: ${name}`);
      return id;
    };

    // -------- nutricionista (com config de adaptação — nível 2, Fase 2) --------
    // Semeia o DEFAULT DA NUTRI (band/piso) iguais ao do sistema, só pra
    // exercitar o caminho de leitura+resolução de 3 níveis na casca (FR-012a/c).
    const [nutri] = await tx
      .insert(nutritionist)
      .values({
        name: "Dra. Marina Lopes",
        email: "marina@bamboo.dev",
        defaultBandTolerancePct: 10,
        defaultFloorPct: 50,
      })
      .returning({ id: nutritionist.id });

    // -------- paciente (exposure=macros para ver números na US1) --------
    const [pac] = await tx
      .insert(patient)
      .values({
        nutritionistId: nutri.id,
        name: "João da Silva",
        email: "joao@example.com",
        heightCm: 178,
        weightKg: 82,
        exposure: "macros",
      })
      .returning({ id: patient.id });

    // -------- grupos de substituição + associação alimento↔grupo --------
    const groupIdByName: Record<string, string> = {};
    let fsgCount = 0;
    for (const g of GROUPS) {
      const [grp] = await tx
        .insert(substitutionGroup)
        .values({ name: g.name, basis: g.basis }) // nutritionistId null = grupo do sistema
        .returning({ id: substitutionGroup.id });
      groupIdByName[g.name] = grp.id;

      await tx.insert(foodSubstitutionGroup).values(
        g.foods.map((f) => ({
          foodId: foodId(f.name),
          groupId: grp.id,
          referencePortionGrams: f.referencePortionGrams,
        })),
      );
      fsgCount += g.foods.length;
    }
    const carbGroupId = groupIdByName["Carboidratos"];
    const proteinGroupId = groupIdByName["Proteínas"];

    // -------- plano ativo --------
    const [pln] = await tx
      .insert(plan)
      .values({
        patientId: pac.id,
        name: "Plano de João — Ciclo 1",
        isActive: true,
      })
      .returning({ id: plan.id });

    // -------- tipos-de-dia (treino / descanso) --------
    const [treino] = await tx
      .insert(dayType)
      .values({ planId: pln.id, name: "treino" })
      .returning({ id: dayType.id });
    const [descanso] = await tx
      .insert(dayType)
      .values({ planId: pln.id, name: "descanso" })
      .returning({ id: dayType.id });

    // -------- programação semanal (0=dom .. 6=sáb), cobre os 7 dias --------
    // seg–sex (1..5) = treino; sáb/dom (6,0) = descanso.
    const scheduleRows = [
      { weekday: 0, dayTypeId: descanso.id },
      { weekday: 1, dayTypeId: treino.id },
      { weekday: 2, dayTypeId: treino.id },
      { weekday: 3, dayTypeId: treino.id },
      { weekday: 4, dayTypeId: treino.id },
      { weekday: 5, dayTypeId: treino.id },
      { weekday: 6, dayTypeId: descanso.id },
    ];
    await tx
      .insert(daySchedule)
      .values(scheduleRows.map((r) => ({ planId: pln.id, ...r })));

    // -------- refeições por tipo-de-dia (algumas com horário) --------
    // helper: cria meal e retorna id
    const insertMeal = async (
      dayTypeId: string,
      name: string,
      position: number,
      horario: string | null,
    ): Promise<string> => {
      const [m] = await tx
        .insert(meal)
        .values({ dayTypeId, name, position, horario })
        .returning({ id: meal.id });
      return m.id;
    };

    // helper: cria opção e retorna id
    const insertOption = async (
      mealId: string,
      label: string,
      isDefault: boolean,
    ): Promise<string> => {
      const [o] = await tx
        .insert(mealOption)
        .values({ mealId, label, isDefault })
        .returning({ id: mealOption.id });
      return o.id;
    };

    let itemCount = 0;
    // helper: cria item e retorna id
    const insertItem = async (values: {
      mealOptionId: string;
      foodName: string;
      quantityGrams: number;
      isLocked: boolean;
      substitutionGroupId: string | null;
    }): Promise<string> => {
      const [it] = await tx
        .insert(mealItem)
        .values({
          mealOptionId: values.mealOptionId,
          foodId: foodId(values.foodName),
          quantityGrams: values.quantityGrams,
          isLocked: values.isLocked,
          substitutionGroupId: values.substitutionGroupId,
        })
        .returning({ id: mealItem.id });
      itemCount += 1;
      return it.id;
    };

    // guarda o item flexível "de referência" (frango flexível no Carbo? não —
    // arroz flexível no grupo Carboidratos, que tem 4 foods).
    let flexibleItemId = "";
    let flexibleFoodName = "";
    let flexibleGroupName = "";

    /* ===== DIA DE TREINO ===== */

    // Café da manhã (08:00) — 1 opção. Ovo travado + aveia flexível? aveia não
    // está em grupo; usamos ovo travado (proteína fixa) + banana solta.
    {
      const cafe = await insertMeal(treino.id, "Café da manhã", 1, "08:00");
      const opt = await insertOption(cafe, "Padrão", true);
      // ovo TRAVADO (proteína fixa do café)
      await insertItem({
        mealOptionId: opt,
        foodName: "Ovo de galinha cozido",
        quantityGrams: 100,
        isLocked: true,
        substitutionGroupId: null,
      });
      // aveia: não-travada e sem grupo → não substituível (item solto)
      await insertItem({
        mealOptionId: opt,
        foodName: "Aveia em flocos",
        quantityGrams: 40,
        isLocked: false,
        substitutionGroupId: null,
      });
      // banana: idem (acompanhamento solto)
      await insertItem({
        mealOptionId: opt,
        foodName: "Banana nanica",
        quantityGrams: 85,
        isLocked: false,
        substitutionGroupId: null,
      });
    }

    // Almoço (12:30) — 3 OPÇÕES (uma default). É aqui que mora o item flexível
    // de referência: arroz no grupo Carboidratos (4 foods → 3 substitutos).
    {
      const almoco = await insertMeal(treino.id, "Almoço", 2, "12:30");

      // Opção 1 (DEFAULT): arroz (flexível, Carbo) + patinho (flexível, Proteína) + salada solta.
      const opt1 = await insertOption(almoco, "Arroz e carne", true);
      const arrozItemId = await insertItem({
        mealOptionId: opt1,
        foodName: "Arroz branco cozido",
        quantityGrams: 150,
        isLocked: false,
        substitutionGroupId: carbGroupId,
      });
      // este é o item flexível de referência (grupo com 4 foods)
      flexibleItemId = arrozItemId;
      flexibleFoodName = "Arroz branco cozido";
      flexibleGroupName = "Carboidratos";

      await insertItem({
        mealOptionId: opt1,
        foodName: "Patinho bovino grelhado",
        quantityGrams: 120,
        isLocked: false,
        substitutionGroupId: proteinGroupId,
      });
      await insertItem({
        mealOptionId: opt1,
        foodName: "Feijão carioca cozido",
        quantityGrams: 80,
        isLocked: false,
        substitutionGroupId: null, // acompanhamento solto
      });
      await insertItem({
        mealOptionId: opt1,
        foodName: "Alface lisa crua",
        quantityGrams: 30,
        isLocked: false,
        substitutionGroupId: null,
      });

      // Opção 2: batata doce (flexível, Carbo) + pescada (flexível, Proteína).
      // Propositalmente MAIS PESADA que a default (mais carbo + proteína) —
      // escolhê-la desequilibra o dia e dispara o rebalanceamento (gatilho P1).
      const opt2 = await insertOption(
        almoco,
        "Batata e peixe (reforçado)",
        false,
      );
      await insertItem({
        mealOptionId: opt2,
        foodName: "Batata doce cozida",
        quantityGrams: 250,
        isLocked: false,
        substitutionGroupId: carbGroupId,
      });
      await insertItem({
        mealOptionId: opt2,
        foodName: "Filé de pescada frito",
        quantityGrams: 160,
        isLocked: false,
        substitutionGroupId: proteinGroupId,
      });
      await insertItem({
        mealOptionId: opt2,
        foodName: "Brócolis cozido",
        quantityGrams: 80,
        isLocked: false,
        substitutionGroupId: null,
      });

      // Opção 3: mandioca (flexível, Carbo) + coxão mole (flexível, Proteína).
      const opt3 = await insertOption(almoco, "Mandioca e carne", false);
      await insertItem({
        mealOptionId: opt3,
        foodName: "Mandioca (aipim) cozida",
        quantityGrams: 120,
        isLocked: false,
        substitutionGroupId: carbGroupId,
      });
      await insertItem({
        mealOptionId: opt3,
        foodName: "Coxão mole bovino cozido",
        quantityGrams: 120,
        isLocked: false,
        substitutionGroupId: proteinGroupId,
      });
    }

    // Jantar (19:30) — 1 opção: batata inglesa (flexível, Carbo) + ovo travado.
    {
      const jantar = await insertMeal(treino.id, "Jantar", 3, "19:30");
      const opt = await insertOption(jantar, "Padrão", true);
      await insertItem({
        mealOptionId: opt,
        foodName: "Batata inglesa cozida",
        quantityGrams: 150,
        isLocked: false,
        substitutionGroupId: carbGroupId,
      });
      // ovo TRAVADO no jantar
      await insertItem({
        mealOptionId: opt,
        foodName: "Ovo de galinha cozido",
        quantityGrams: 100,
        isLocked: true,
        substitutionGroupId: null,
      });
      await insertItem({
        mealOptionId: opt,
        foodName: "Tomate (salada)",
        quantityGrams: 90,
        isLocked: false,
        substitutionGroupId: null,
      });
    }

    /* ===== DIA DE DESCANSO ===== */

    // Café da manhã (sem horário definido) — 1 opção.
    {
      const cafe = await insertMeal(descanso.id, "Café da manhã", 1, null);
      const opt = await insertOption(cafe, "Padrão", true);
      await insertItem({
        mealOptionId: opt,
        foodName: "Ovo de galinha cozido",
        quantityGrams: 50,
        isLocked: true,
        substitutionGroupId: null,
      });
      await insertItem({
        mealOptionId: opt,
        foodName: "Maçã com casca",
        quantityGrams: 130,
        isLocked: false,
        substitutionGroupId: null,
      });
    }

    // Almoço (12:30) — 1 opção: arroz (flexível, Carbo) + coxão mole (flexível, Proteína).
    {
      const almoco = await insertMeal(descanso.id, "Almoço", 2, "12:30");
      const opt = await insertOption(almoco, "Padrão", true);
      await insertItem({
        mealOptionId: opt,
        foodName: "Arroz branco cozido",
        quantityGrams: 120,
        isLocked: false,
        substitutionGroupId: carbGroupId,
      });
      await insertItem({
        mealOptionId: opt,
        foodName: "Coxão mole bovino cozido",
        quantityGrams: 100,
        isLocked: false,
        substitutionGroupId: proteinGroupId,
      });
      await insertItem({
        mealOptionId: opt,
        foodName: "Cenoura crua",
        quantityGrams: 80,
        isLocked: false,
        substitutionGroupId: null,
      });
    }

    // Jantar (sem horário) — 1 opção: batata doce (flexível, Carbo) + pescada (flexível, Proteína).
    {
      const jantar = await insertMeal(descanso.id, "Jantar", 3, null);
      const opt = await insertOption(jantar, "Padrão", true);
      await insertItem({
        mealOptionId: opt,
        foodName: "Batata doce cozida",
        quantityGrams: 150,
        isLocked: false,
        substitutionGroupId: carbGroupId,
      });
      await insertItem({
        mealOptionId: opt,
        foodName: "Filé de pescada frito",
        quantityGrams: 120,
        isLocked: false,
        substitutionGroupId: proteinGroupId,
      });
    }

    // Substitutos reais do grupo do item flexível de referência (excluindo o
    // próprio food do item): Carboidratos tem 4 foods → 3 substitutos.
    const substituteCount =
      GROUPS.find((g) => g.name === flexibleGroupName)!.foods.length - 1;

    const [{ n: mealCount }] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(meal);
    const [{ n: optionCount }] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(mealOption);

    return {
      nutritionistId: nutri.id,
      patientId: pac.id,
      planId: pln.id,
      groupIds: groupIdByName,
      counts: {
        nutritionist: 1,
        patient: 1,
        substitutionGroup: GROUPS.length,
        foodSubstitutionGroup: fsgCount,
        plan: 1,
        dayType: 2,
        daySchedule: scheduleRows.length,
        meal: mealCount,
        mealOption: optionCount,
        mealItem: itemCount,
      },
      flexibleItem: {
        itemId: flexibleItemId,
        foodName: flexibleFoodName,
        groupName: flexibleGroupName,
        substituteCount,
      },
    };
  });
}

/* ============================================================
 * Orquestração.
 * ============================================================ */

async function main(): Promise<void> {
  const r = await seed();

  console.log("[seed] OK — plano semeado.");
  console.log("[seed] contagens:");
  for (const [k, v] of Object.entries(r.counts)) {
    console.log(`  - ${k}: ${v}`);
  }
  console.log("[seed] IDs úteis (para testes de API):");
  console.log(`  - patientId:        ${r.patientId}`);
  console.log(`  - planId (ativo):   ${r.planId}`);
  console.log(`  - nutritionistId:   ${r.nutritionistId}`);
  for (const [name, id] of Object.entries(r.groupIds)) {
    console.log(`  - grupo "${name}": ${id}`);
  }
  console.log(
    `  - meal_item FLEXÍVEL: ${r.flexibleItem.itemId} ` +
      `(${r.flexibleItem.foodName}, grupo "${r.flexibleItem.groupName}", ` +
      `${r.flexibleItem.substituteCount} substitutos)`,
  );
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error("[seed] ERRO:", err);
    await pool.end();
    process.exit(1);
  });

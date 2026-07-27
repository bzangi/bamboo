// Carrega o plano REAL do paciente 0 no banco, a partir da transcrição em
// `bruno-2026-07.ts`. É o substituto do plano fictício do `seed.ts`.
//
// Uso: node --env-file=.env --import tsx packages/db/scripts/planos/carregar.ts
//
// IDEMPOTENTE: pode rodar quantas vezes quiser. Alimentos, medidas caseiras e
// vínculos de grupo são upsert; o GRAFO do plano (tipos-de-dia → refeições →
// opções → itens) é reconstruído do zero a cada rodada, porque a fonte é o
// arquivo e não o banco.
//
// NÃO destrói nada além do próprio plano: o paciente do seed, os alimentos TACO e
// os registros de qualquer paciente ficam intactos. Se o plano já tiver registro
// (`meal_event`) pendurado, o script ABORTA em vez de apagar dado de saúde.
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../src/client.js";
import * as schema from "../../src/schema.js";
import {
  ALIMENTOS,
  TIPOS_DE_DIA,
  type AlimentoDoPlano,
} from "./bruno-2026-07.js";

const PACIENTE = "Bruno Zangirolami";
const PLANO = "Plano real — 24/07/2026";

/** Confirmado pelo Bruno (2026-07-27): corre **terça, quinta e sábado**.
 *  Weekday do Postgres/JS: 0 = domingo. */
const PROGRAMACAO: Record<number, "comCorrida" | "semCorrida"> = {
  0: "semCorrida", // domingo
  1: "semCorrida", // segunda
  2: "comCorrida", // terça
  3: "semCorrida", // quarta
  4: "comCorrida", // quinta
  5: "semCorrida", // sexta
  6: "comCorrida", // sábado
};

const porNomeDoPlano = new Map(ALIMENTOS.map((a) => [a.plano, a]));

const exigir = <T>(v: T | undefined | null, oQue: string): T => {
  if (v === undefined || v === null) throw new Error(`carregar: ${oQue}`);
  return v;
};

async function main(): Promise<void> {
  const resumo = await db.transaction(async (tx) => {
    /* ─── 1. nutricionista (do seed; este script não cria) ─── */
    const [nutri] = await tx
      .select({ id: schema.nutritionist.id })
      .from(schema.nutritionist)
      .orderBy(asc(schema.nutritionist.createdAt), asc(schema.nutritionist.id))
      .limit(1);
    if (!nutri) {
      throw new Error(
        "carregar: nenhuma nutricionista no banco — rode o seed primeiro",
      );
    }

    /* ─── 2. alimentos que a TACO não tem (upsert por nome) ─── */
    const foodIdPorPlano = new Map<string, string>();
    let criados = 0;
    let atualizados = 0;

    for (const a of ALIMENTOS) {
      if (a.base !== null) {
        // Já existe na base (TACO/seed): resolve por nome EXATO.
        const [row] = await tx
          .select({ id: schema.food.id })
          .from(schema.food)
          .where(eq(schema.food.name, a.base))
          .orderBy(asc(schema.food.id))
          .limit(1);
        foodIdPorPlano.set(
          a.plano,
          exigir(row?.id, `alimento "${a.base}" não está na base`),
        );
        continue;
      }

      const macros = exigir(
        a.macros,
        `"${a.plano}" não tem base nem macros — a composição é obrigatória (food.kcal é NOT NULL)`,
      );
      const source = a.falta === "receita" ? "receita" : "rotulo";
      const [existente] = await tx
        .select({ id: schema.food.id })
        .from(schema.food)
        .where(eq(schema.food.name, a.plano))
        .orderBy(asc(schema.food.id))
        .limit(1);

      const valores = {
        name: a.plano,
        source,
        kcalPer100g: macros.kcal,
        carbPer100g: macros.carb,
        proteinPer100g: macros.protein,
        fatPer100g: macros.fat,
        fiberPer100g: macros.fiber,
      };

      if (existente) {
        await tx
          .update(schema.food)
          .set(valores)
          .where(eq(schema.food.id, existente.id));
        foodIdPorPlano.set(a.plano, existente.id);
        atualizados++;
      } else {
        const [novo] = await tx
          .insert(schema.food)
          .values(valores)
          .returning({ id: schema.food.id });
        foodIdPorPlano.set(a.plano, exigir(novo?.id, "insert de food"));
        criados++;
      }
    }

    /* ─── 3. medidas caseiras (as gramaturas são as DA NUTRI) ─── */
    let medidas = 0;
    for (const a of ALIMENTOS) {
      const foodId = exigir(
        foodIdPorPlano.get(a.plano),
        `food de "${a.plano}"`,
      );
      for (const m of a.medidas ?? []) {
        const [existe] = await tx
          .select({ id: schema.foodHouseholdMeasure.id })
          .from(schema.foodHouseholdMeasure)
          .where(
            and(
              eq(schema.foodHouseholdMeasure.foodId, foodId),
              eq(schema.foodHouseholdMeasure.label, m.label),
            ),
          )
          .limit(1);
        if (existe) {
          await tx
            .update(schema.foodHouseholdMeasure)
            .set({ grams: m.grams })
            .where(eq(schema.foodHouseholdMeasure.id, existe.id));
        } else {
          await tx
            .insert(schema.foodHouseholdMeasure)
            .values({ foodId, label: m.label, grams: m.grams });
        }
        medidas++;
      }
    }

    /* ─── 4. vínculos de grupo: a tabela de equivalência DELA ─── */
    const grupos = await tx
      .select({
        id: schema.substitutionGroup.id,
        name: schema.substitutionGroup.name,
      })
      .from(schema.substitutionGroup)
      .orderBy(asc(schema.substitutionGroup.id));
    const grupoIdPorNome = new Map(grupos.map((g) => [g.name, g.id]));

    let vinculos = 0;
    for (const a of ALIMENTOS) {
      if (!a.grupo || a.porcaoEquivalente === undefined) continue;
      const foodId = exigir(
        foodIdPorPlano.get(a.plano),
        `food de "${a.plano}"`,
      );
      const groupId = exigir(
        grupoIdPorNome.get(a.grupo),
        `grupo "${a.grupo}" não existe (taxonomia em packages/db/src/groups.ts)`,
      );
      const [existe] = await tx
        .select({ id: schema.foodSubstitutionGroup.id })
        .from(schema.foodSubstitutionGroup)
        .where(
          and(
            eq(schema.foodSubstitutionGroup.foodId, foodId),
            eq(schema.foodSubstitutionGroup.groupId, groupId),
          ),
        )
        .limit(1);
      const valores = {
        foodId,
        groupId,
        referencePortionGrams: a.porcaoEquivalente,
        // 'manual' = curadoria humana; a auto-classificação (008) nunca sobrescreve.
        origin: "manual" as const,
      };
      if (existe) {
        await tx
          .update(schema.foodSubstitutionGroup)
          .set(valores)
          .where(eq(schema.foodSubstitutionGroup.id, existe.id));
      } else {
        await tx.insert(schema.foodSubstitutionGroup).values(valores);
      }
      vinculos++;
    }

    /* ─── 5. paciente ─── */
    const [pacienteExistente] = await tx
      .select({ id: schema.patient.id })
      .from(schema.patient)
      .where(eq(schema.patient.name, PACIENTE))
      .orderBy(asc(schema.patient.createdAt), asc(schema.patient.id))
      .limit(1);

    const patientId =
      pacienteExistente?.id ??
      exigir(
        (
          await tx
            .insert(schema.patient)
            .values({
              nutritionistId: nutri.id,
              name: PACIENTE,
              // Paciente 0 é o dono do produto: vê tudo.
              exposure: "full_kcal",
            })
            .returning({ id: schema.patient.id })
        )[0]?.id,
        "insert de patient",
      );

    /* ─── 6. plano: derruba o grafo antigo e reconstrói ─── */
    const [planoExistente] = await tx
      .select({ id: schema.plan.id })
      .from(schema.plan)
      .where(
        and(eq(schema.plan.patientId, patientId), eq(schema.plan.name, PLANO)),
      )
      .limit(1);

    if (planoExistente) {
      const eventos = await tx
        .select({ id: schema.mealEvent.id })
        .from(schema.mealEvent)
        .where(eq(schema.mealEvent.planId, planoExistente.id))
        .limit(1);
      // Registro pendurado: NÃO reconstrói (apagaria dado de saúde). Antes isso
      // abortava, e derrubava o `pnpm mobile:dev`, que só quer o patientId — o
      // plano já está no banco. Agora pula, avisando em voz alta.
      if (eventos.length > 0) {
        return { pulado: true as const, patientId, planId: planoExistente.id };
      }

      const dayTypes = await tx
        .select({ id: schema.dayType.id })
        .from(schema.dayType)
        .where(eq(schema.dayType.planId, planoExistente.id));
      const dtIds = dayTypes.map((d) => d.id);

      // Ordem reversa de FK.
      await tx
        .delete(schema.daySchedule)
        .where(eq(schema.daySchedule.planId, planoExistente.id));
      if (dtIds.length > 0) {
        const meals = await tx
          .select({ id: schema.meal.id })
          .from(schema.meal)
          .where(inArray(schema.meal.dayTypeId, dtIds));
        const mealIds = meals.map((m) => m.id);
        if (mealIds.length > 0) {
          const opts = await tx
            .select({ id: schema.mealOption.id })
            .from(schema.mealOption)
            .where(inArray(schema.mealOption.mealId, mealIds));
          const optIds = opts.map((o) => o.id);
          if (optIds.length > 0) {
            await tx
              .delete(schema.mealItem)
              .where(inArray(schema.mealItem.mealOptionId, optIds));
            await tx
              .delete(schema.mealOption)
              .where(inArray(schema.mealOption.id, optIds));
          }
          await tx.delete(schema.meal).where(inArray(schema.meal.id, mealIds));
        }
        await tx
          .delete(schema.dayType)
          .where(inArray(schema.dayType.id, dtIds));
      }
    }

    const planId =
      planoExistente?.id ??
      exigir(
        (
          await tx
            .insert(schema.plan)
            .values({ patientId, name: PLANO, isActive: true })
            .returning({ id: schema.plan.id })
        )[0]?.id,
        "insert de plan",
      );

    // Um plano ativo por paciente: este vence, os outros saem.
    await tx
      .update(schema.plan)
      .set({ isActive: false })
      .where(
        and(
          eq(schema.plan.patientId, patientId),
          sql`${schema.plan.id} <> ${planId}`,
        ),
      );
    await tx
      .update(schema.plan)
      .set({ isActive: true })
      .where(eq(schema.plan.id, planId));

    /* ─── 7. tipos-de-dia → refeições → opções → itens ─── */
    const dayTypeIdPorChave = new Map<string, string>();
    let refeicoes = 0;
    let opcoes = 0;
    let itens = 0;
    let itensAVontade = 0;

    for (const [chave, dia] of Object.entries(TIPOS_DE_DIA)) {
      const [dt] = await tx
        .insert(schema.dayType)
        .values({ planId, name: dia.nome })
        .returning({ id: schema.dayType.id });
      const dayTypeId = exigir(dt?.id, "insert de day_type");
      dayTypeIdPorChave.set(chave, dayTypeId);

      for (const r of dia.refeicoes) {
        const [meal] = await tx
          .insert(schema.meal)
          .values({
            dayTypeId,
            name: r.nome,
            position: r.position,
            horario: `${r.horario}:00`,
          })
          .returning({ id: schema.meal.id });
        const mealId = exigir(meal?.id, "insert de meal");
        refeicoes++;

        for (const [i, o] of r.opcoes.entries()) {
          const [opt] = await tx
            .insert(schema.mealOption)
            .values({ mealId, label: o.label, isDefault: i === 0 })
            .returning({ id: schema.mealOption.id });
          const mealOptionId = exigir(opt?.id, "insert de meal_option");
          opcoes++;

          for (const it of o.itens) {
            const alimento: AlimentoDoPlano = exigir(
              porNomeDoPlano.get(it.alimento),
              `item "${it.alimento}" não está em ALIMENTOS`,
            );
            const foodId = exigir(
              foodIdPorPlano.get(it.alimento),
              `food de "${it.alimento}"`,
            );
            const aVontade = "aVontade" in it && it.aVontade === true;
            if (aVontade) itensAVontade++;

            await tx.insert(schema.mealItem).values({
              mealOptionId,
              foodId,
              quantityGrams: aVontade ? 0 : "gramas" in it ? it.gramas : 0,
              adLibitum: aVontade,
              // Flexível SÓ onde a nutri listou substituição (o grupo vem do
              // mapa). Sem grupo, o item não é trocável — é fidelidade à
              // prescrição, não limitação: dar grupo a um item que ela não
              // liberou seria oferecer troca que ela não autorizou.
              substitutionGroupId:
                alimento.grupo !== undefined
                  ? (grupoIdPorNome.get(alimento.grupo) ?? null)
                  : null,
              isLocked: false,
            });
            itens++;
          }
        }
      }
    }

    /* ─── 8. programação da semana ─── */
    for (const [weekday, chave] of Object.entries(PROGRAMACAO)) {
      await tx.insert(schema.daySchedule).values({
        planId,
        weekday: Number(weekday),
        dayTypeId: exigir(dayTypeIdPorChave.get(chave), `tipo-de-dia ${chave}`),
      });
    }

    return {
      pulado: false as const,
      patientId,
      planId,
      foods: { criados, atualizados },
      medidas,
      vinculos,
      refeicoes,
      opcoes,
      itens,
      itensAVontade,
    };
  });

  if (resumo.pulado) {
    console.log("\n=== plano real JÁ CARREGADO — grafo NÃO reconstruído ===");
    console.log(`paciente  ${PACIENTE}`);
    console.log(`patientId ${resumo.patientId}`);
    console.log(`planId    ${resumo.planId}`);
    console.log(
      `\nO plano tem registro (meal_event) pendurado, então nada foi reescrito.` +
        `\nSe você mudou bruno-2026-07.ts e quer o grafo novo, apague os eventos` +
        `\ndeste plano à mão e rode de novo.`,
    );
    process.exit(0);
  }

  console.log("\n=== plano real carregado ===");
  console.log(`paciente  ${PACIENTE}`);
  console.log(`patientId ${resumo.patientId}`);
  console.log(`planId    ${resumo.planId}`);
  console.log(
    `alimentos ${resumo.foods.criados} criados · ${resumo.foods.atualizados} atualizados`,
  );
  console.log(
    `medidas caseiras ${resumo.medidas} · vínculos de grupo ${resumo.vinculos}`,
  );
  console.log(
    `grafo: 2 tipos-de-dia · ${resumo.refeicoes} refeições · ${resumo.opcoes} opções · ${resumo.itens} itens (${resumo.itensAVontade} à vontade)`,
  );
  console.log(
    `\nApontar o app para este paciente:\n  EXPO_PUBLIC_PATIENT_ID=${resumo.patientId}`,
  );
  process.exit(0);
}

void main();

// packages/db/schema.ts
// Schema inicial (Fase 0) — Bamboo (SaaS para nutricionistas).
// Cobre o necessário pra SEMEAR um plano e rodar a alça do paciente
// (consulta "o agora" + substituição com recálculo). Ciclo, logs, adesão e
// seleção-de-dia entram em fases posteriores (ver final do arquivo).
//
// Sintaxe Drizzle pg-core (núcleo estável). Rode `drizzle-kit generate`
// pra gerar as migrations e ajuste conforme a versão instalada.

import {
  pgTable,
  uuid,
  text,
  integer,
  doublePrecision,
  boolean,
  timestamp,
  time,
  date,
  pgEnum,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

/* ============ enums ============ */

// Quanto de número o paciente enxerga (gate de exposição controlado pela nutri).
export const exposureLevel = pgEnum("exposure_level", [
  "hidden", // não mostra número
  "percent", // só %
  "macros", // % + macros
  "full_kcal", // kcal cheio
]);

// Base de equivalência de um grupo de substituição: dentro do grupo, a troca
// PRESERVA este nutriente (carbo por carbo, proteína por proteína...).
export const equivalenceBasis = pgEnum("equivalence_basis", [
  "carb",
  "protein",
  "fat",
  "kcal",
]);

// Estado de uma marcação de registro (feito/troquei/pulei). Exatamente 3 valores
// (FR-002). Ausência de estado vigente = nenhum evento OU evento mais recente
// com state NULL (anulação/desfazer) — ver meal_event.state.
export const mealEventState = pgEnum("meal_event_state", [
  "feito",
  "troquei",
  "pulei",
]);

/* ============ pessoas ============ */

export const nutritionist = pgTable("nutritionist", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  // Config de adaptação — default DA NUTRI (nível 2 da resolução de 3 níveis,
  // Fase 2 / FR-012a). Nullable: null = cai pro default do sistema. Semeado no v0.
  defaultBandTolerancePct: doublePrecision("default_band_tolerance_pct"),
  defaultFloorPct: doublePrecision("default_floor_pct"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const patient = pgTable("patient", {
  id: uuid("id").primaryKey().defaultRandom(),
  nutritionistId: uuid("nutritionist_id")
    .references(() => nutritionist.id)
    .notNull(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  heightCm: doublePrecision("height_cm"),
  weightKg: doublePrecision("weight_kg"),
  // Perfil de flexibilidade (regras gerais da anamnese): começa simples e
  // cresce. A exposição decide quanto número o paciente vê.
  exposure: exposureLevel("exposure").default("hidden").notNull(),
  // Config de adaptação — override DO PACIENTE (nível 1, vence; Fase 2 / FR-012a).
  // Nullable: null = cai pro default da nutri, depois pro do sistema. Semeado no v0.
  bandTolerancePct: doublePrecision("band_tolerance_pct"),
  floorPct: doublePrecision("floor_pct"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/* ============ base de alimentos (TACO) ============ */

export const food = pgTable("food", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  source: text("source").default("taco").notNull(),
  // Identidade estável do alimento na fonte TACO (Feature 008): chave de upsert
  // da ingestão ampliada. Nullable: foods de outras fontes/sem id não a têm.
  tacoId: integer("taco_id").unique(),
  // Categoria da fonte TACO — o SINAL primário da auto-classificação (008).
  tacoCategory: text("taco_category"),
  // Valores por 100 g (padrão das tabelas de composição).
  kcalPer100g: doublePrecision("kcal_per_100g").notNull(),
  carbPer100g: doublePrecision("carb_per_100g").notNull(),
  proteinPer100g: doublePrecision("protein_per_100g").notNull(),
  fatPer100g: doublePrecision("fat_per_100g").notNull(),
  fiberPer100g: doublePrecision("fiber_per_100g"),
});

// Medidas caseiras: "1 colher de sopa cheia" = X g. Essencial pra traduzir
// gramas -> linguagem real do paciente.
export const foodHouseholdMeasure = pgTable("food_household_measure", {
  id: uuid("id").primaryKey().defaultRandom(),
  foodId: uuid("food_id")
    .references(() => food.id)
    .notNull(),
  label: text("label").notNull(),
  grams: doublePrecision("grams").notNull(),
});

/* ============ grupos de substituição (sistema exchange) ============ */

export const substitutionGroup = pgTable("substitution_group", {
  id: uuid("id").primaryKey().defaultRandom(),
  // null = grupo do sistema (auto-classificado); preenchido = grupo
  // customizado por uma nutri específica.
  nutritionistId: uuid("nutritionist_id").references(() => nutritionist.id),
  name: text("name").notNull(), // ex.: "Carboidratos"
  basis: equivalenceBasis("basis").notNull(),
});

// Mapeia alimento -> grupo, com a porção de referência daquele alimento dentro
// do grupo (a "1 troca" do exchange). É daqui que sai o recálculo de quantidade.
export const foodSubstitutionGroup = pgTable("food_substitution_group", {
  id: uuid("id").primaryKey().defaultRandom(),
  foodId: uuid("food_id")
    .references(() => food.id)
    .notNull(),
  groupId: uuid("group_id")
    .references(() => substitutionGroup.id)
    .notNull(),
  referencePortionGrams: doublePrecision("reference_portion_grams").notNull(),
  // Origem do vínculo (Feature 008): 'manual' = curadoria/correção humana (vence
  // sempre, nunca sobrescrita); 'auto' = palpite da classificação. Default
  // 'manual' → vínculos pré-existentes (curadoria da fundação) ficam manual.
  origin: text("origin").default("manual").notNull(),
});

/* ============ plano ============ */

// v0: o plano pertence direto ao paciente. Em fase posterior, o "ciclo de
// acompanhamento" vira o objeto que versiona os planos (1 plano por ciclo).
export const plan = pgTable("plan", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientId: uuid("patient_id")
    .references(() => patient.id)
    .notNull(),
  name: text("name").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Tipos-de-dia (treino pesado / leve / descanso). O plano é um CONJUNTO deles,
// não um cardápio fixo.
export const dayType = pgTable("day_type", {
  id: uuid("id").primaryKey().defaultRandom(),
  planId: uuid("plan_id")
    .references(() => plan.id)
    .notNull(),
  name: text("name").notNull(),
});

// Programação default: que tipo-de-dia cada dia da semana assume.
// weekday: 0=domingo ... 6=sábado. O paciente pode sobrescrever no app.
export const daySchedule = pgTable("day_schedule", {
  id: uuid("id").primaryKey().defaultRandom(),
  planId: uuid("plan_id")
    .references(() => plan.id)
    .notNull(),
  weekday: integer("weekday").notNull(),
  dayTypeId: uuid("day_type_id")
    .references(() => dayType.id)
    .notNull(),
});

// Refeição (slot): "Almoço", com posição no dia.
export const meal = pgTable("meal", {
  id: uuid("id").primaryKey().defaultRandom(),
  dayTypeId: uuid("day_type_id")
    .references(() => dayType.id)
    .notNull(),
  name: text("name").notNull(),
  position: integer("position").notNull(),
  // Horário/janela informativo de quando a refeição costuma acontecer.
  // NÃO dirige "o agora" (registro diferido); só exibição. Nullable.
  horario: time("horario"),
});

// Opções de uma refeição (os "3 almoços"). Podem ter balanços diferentes —
// escolher uma reflete nas próximas refeições via rebalanceamento.
export const mealOption = pgTable("meal_option", {
  id: uuid("id").primaryKey().defaultRandom(),
  mealId: uuid("meal_id")
    .references(() => meal.id)
    .notNull(),
  label: text("label").notNull(),
  isDefault: boolean("is_default").default(false).notNull(),
});

// Itens de uma opção: alimento + quantidade + marcação de flexibilidade.
// isLocked = travado (não troca). Se flexível, substitutionGroupId diz dentro
// de qual grupo ele pode ser trocado.
export const mealItem = pgTable("meal_item", {
  id: uuid("id").primaryKey().defaultRandom(),
  mealOptionId: uuid("meal_option_id")
    .references(() => mealOption.id)
    .notNull(),
  foodId: uuid("food_id")
    .references(() => food.id)
    .notNull(),
  quantityGrams: doublePrecision("quantity_grams").notNull(),
  isLocked: boolean("is_locked").default(false).notNull(),
  substitutionGroupId: uuid("substitution_group_id").references(
    () => substitutionGroup.id,
  ),
});

/* ============ registro pendurado na consulta (append-only) ============ */

// Evento de registro de uma refeição num dia (feito/troquei/pulei). Append-only:
// toda transição (incl. correção e desfazer) é um INSERT; o estado anterior nunca
// é mutado. Estado vigente por (patient, meal, logged_date) = evento de maior
// created_at; state NULL = anulação (desfazer) → volta a "não-registrada".
export const mealEvent = pgTable("meal_event", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientId: uuid("patient_id")
    .references(() => patient.id)
    .notNull(),
  planId: uuid("plan_id")
    .references(() => plan.id)
    .notNull(),
  mealId: uuid("meal_id")
    .references(() => meal.id)
    .notNull(),
  // Tipo-de-dia em vigor no momento do registro (default ou override de sessão),
  // gravado como snapshot — não materializa day_selection.
  dayTypeId: uuid("day_type_id")
    .references(() => dayType.id)
    .notNull(),
  // Opção efetivamente cumprida; gravada em `feito` E `troquei`. NULL em
  // `pulei`/desfazer.
  chosenMealOptionId: uuid("chosen_meal_option_id").references(
    () => mealOption.id,
  ),
  // NULL = evento de anulação (desfazer).
  state: mealEventState("state"),
  // Dia-calendário do registro; parte da chave (paciente, refeição, dia).
  loggedDate: date("logged_date").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Consumo efetivo do "troquei por substituição/combinação" (filha de meal_event).
// FK→food garante "dentro da lista" (barra comida-fora-da-lista). Presente apenas
// em "troquei por substituição"; "troquei por opção" usa só chosenMealOptionId.
export const mealEventItem = pgTable("meal_event_item", {
  id: uuid("id").primaryKey().defaultRandom(),
  mealEventId: uuid("meal_event_id")
    .references(() => mealEvent.id)
    .notNull(),
  foodId: uuid("food_id")
    .references(() => food.id)
    .notNull(),
  quantityGrams: doublePrecision("quantity_grams").notNull(),
});

/* ============ ciclo de acompanhamento (Feature 007) ============ */

// Ciclo: objeto de 1ª classe por paciente — início (consulta), duração
// prevista (obrigatória; previsão, não trava) e fim (reavaliação manual ou
// auto-fechamento quando o próximo abre). Janela em dia-calendário local
// (mesma fonte do meal_event.logged_date). Invisível ao paciente — só a via
// /nutri lê/escreve.
export const cycle = pgTable(
  "cycle",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patientId: uuid("patient_id")
      .references(() => patient.id)
      .notNull(),
    startedOn: date("started_on").notNull(),
    expectedDurationDays: integer("expected_duration_days").notNull(),
    // null = ciclo ATIVO. Preenchida no fechar manual ou no auto-fechar
    // (= started_on do sucessor — fronteira resolvida por desempate na leitura).
    closedOn: date("closed_on"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    // O BANCO garante no máximo 1 ciclo ativo por paciente (FR-002/SC-002).
    uniqueIndex("cycle_one_active_per_patient")
      .on(t.patientId)
      .where(sql`${t.closedOn} IS NULL`),
  ],
);

// Vigência observada (Q2-A + "observa"): a linha do tempo 1:N de "qual plano
// vigia quando" DENTRO do ciclo. O ciclo NÃO manda em plan.is_active — apenas
// registra as ativações; null em valid_to = vigência corrente.
export const cyclePlanVigencia = pgTable("cycle_plan_vigencia", {
  id: uuid("id").primaryKey().defaultRandom(),
  cycleId: uuid("cycle_id")
    .references(() => cycle.id)
    .notNull(),
  planId: uuid("plan_id")
    .references(() => plan.id)
    .notNull(),
  validFrom: date("valid_from").notNull(),
  validTo: date("valid_to"),
});

/* ============ relations (principais) ============ */

export const planRelations = relations(plan, ({ many, one }) => ({
  patient: one(patient, { fields: [plan.patientId], references: [patient.id] }),
  dayTypes: many(dayType),
}));

export const dayTypeRelations = relations(dayType, ({ many, one }) => ({
  plan: one(plan, { fields: [dayType.planId], references: [plan.id] }),
  meals: many(meal),
}));

export const mealRelations = relations(meal, ({ many, one }) => ({
  dayType: one(dayType, { fields: [meal.dayTypeId], references: [dayType.id] }),
  options: many(mealOption),
}));

export const mealOptionRelations = relations(mealOption, ({ many, one }) => ({
  meal: one(meal, { fields: [mealOption.mealId], references: [meal.id] }),
  items: many(mealItem),
}));

export const mealItemRelations = relations(mealItem, ({ one }) => ({
  option: one(mealOption, {
    fields: [mealItem.mealOptionId],
    references: [mealOption.id],
  }),
  food: one(food, { fields: [mealItem.foodId], references: [food.id] }),
  group: one(substitutionGroup, {
    fields: [mealItem.substitutionGroupId],
    references: [substitutionGroup.id],
  }),
}));

export const mealEventRelations = relations(mealEvent, ({ many, one }) => ({
  patient: one(patient, {
    fields: [mealEvent.patientId],
    references: [patient.id],
  }),
  plan: one(plan, { fields: [mealEvent.planId], references: [plan.id] }),
  meal: one(meal, { fields: [mealEvent.mealId], references: [meal.id] }),
  dayType: one(dayType, {
    fields: [mealEvent.dayTypeId],
    references: [dayType.id],
  }),
  chosenMealOption: one(mealOption, {
    fields: [mealEvent.chosenMealOptionId],
    references: [mealOption.id],
  }),
  items: many(mealEventItem),
}));

export const mealEventItemRelations = relations(mealEventItem, ({ one }) => ({
  event: one(mealEvent, {
    fields: [mealEventItem.mealEventId],
    references: [mealEvent.id],
  }),
  food: one(food, { fields: [mealEventItem.foodId], references: [food.id] }),
}));

/* ============ ADIADO pra fases posteriores ============
 * - cycle: ciclo de acompanhamento; passa a wrappar e versionar os planos.
 * - day_selection: qual tipo-de-dia o paciente seguiu em cada data (default vs override).
 * - adherence / cycle_report: métricas da Fase 3.
 * - índices e constraints de performance (deixar pra quando o acesso estabilizar).
 */

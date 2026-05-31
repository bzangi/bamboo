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
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

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

/* ============ pessoas ============ */

export const nutritionist = pgTable("nutritionist", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/* ============ base de alimentos (TACO) ============ */

export const food = pgTable("food", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  source: text("source").default("taco").notNull(),
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

/* ============ ADIADO pra fases posteriores ============
 * - cycle: ciclo de acompanhamento; passa a wrappar e versionar os planos.
 * - day_selection: qual tipo-de-dia o paciente seguiu em cada data (default vs override).
 * - meal_event / log: feito/troquei/pulei + o que comeu de fato
 *     (alimenta adesão E é o gatilho do rebalanceamento por consumo real).
 * - adherence / cycle_report: métricas da Fase 3.
 * - índices e constraints de performance (deixar pra quando o acesso estabilizar).
 */

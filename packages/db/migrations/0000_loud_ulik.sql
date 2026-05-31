CREATE TYPE "public"."equivalence_basis" AS ENUM('carb', 'protein', 'fat', 'kcal');--> statement-breakpoint
CREATE TYPE "public"."exposure_level" AS ENUM('hidden', 'percent', 'macros', 'full_kcal');--> statement-breakpoint
CREATE TABLE "day_schedule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"weekday" integer NOT NULL,
	"day_type_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "day_type" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "food" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"source" text DEFAULT 'taco' NOT NULL,
	"kcal_per_100g" double precision NOT NULL,
	"carb_per_100g" double precision NOT NULL,
	"protein_per_100g" double precision NOT NULL,
	"fat_per_100g" double precision NOT NULL,
	"fiber_per_100g" double precision
);
--> statement-breakpoint
CREATE TABLE "food_household_measure" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"food_id" uuid NOT NULL,
	"label" text NOT NULL,
	"grams" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "food_substitution_group" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"food_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"reference_portion_grams" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"day_type_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"horario" time
);
--> statement-breakpoint
CREATE TABLE "meal_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meal_option_id" uuid NOT NULL,
	"food_id" uuid NOT NULL,
	"quantity_grams" double precision NOT NULL,
	"is_locked" boolean DEFAULT false NOT NULL,
	"substitution_group_id" uuid
);
--> statement-breakpoint
CREATE TABLE "meal_option" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meal_id" uuid NOT NULL,
	"label" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nutritionist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "nutritionist_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "patient" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nutritionist_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"height_cm" double precision,
	"weight_kg" double precision,
	"exposure" "exposure_level" DEFAULT 'hidden' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "substitution_group" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nutritionist_id" uuid,
	"name" text NOT NULL,
	"basis" "equivalence_basis" NOT NULL
);
--> statement-breakpoint
ALTER TABLE "day_schedule" ADD CONSTRAINT "day_schedule_plan_id_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_schedule" ADD CONSTRAINT "day_schedule_day_type_id_day_type_id_fk" FOREIGN KEY ("day_type_id") REFERENCES "public"."day_type"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_type" ADD CONSTRAINT "day_type_plan_id_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_household_measure" ADD CONSTRAINT "food_household_measure_food_id_food_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."food"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_substitution_group" ADD CONSTRAINT "food_substitution_group_food_id_food_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."food"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_substitution_group" ADD CONSTRAINT "food_substitution_group_group_id_substitution_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."substitution_group"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal" ADD CONSTRAINT "meal_day_type_id_day_type_id_fk" FOREIGN KEY ("day_type_id") REFERENCES "public"."day_type"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_item" ADD CONSTRAINT "meal_item_meal_option_id_meal_option_id_fk" FOREIGN KEY ("meal_option_id") REFERENCES "public"."meal_option"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_item" ADD CONSTRAINT "meal_item_food_id_food_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."food"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_item" ADD CONSTRAINT "meal_item_substitution_group_id_substitution_group_id_fk" FOREIGN KEY ("substitution_group_id") REFERENCES "public"."substitution_group"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_option" ADD CONSTRAINT "meal_option_meal_id_meal_id_fk" FOREIGN KEY ("meal_id") REFERENCES "public"."meal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient" ADD CONSTRAINT "patient_nutritionist_id_nutritionist_id_fk" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."nutritionist"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan" ADD CONSTRAINT "plan_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "substitution_group" ADD CONSTRAINT "substitution_group_nutritionist_id_nutritionist_id_fk" FOREIGN KEY ("nutritionist_id") REFERENCES "public"."nutritionist"("id") ON DELETE no action ON UPDATE no action;
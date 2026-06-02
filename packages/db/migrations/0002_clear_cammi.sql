CREATE TYPE "public"."meal_event_state" AS ENUM('feito', 'troquei', 'pulei');--> statement-breakpoint
CREATE TABLE "meal_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"meal_id" uuid NOT NULL,
	"day_type_id" uuid NOT NULL,
	"chosen_meal_option_id" uuid,
	"state" "meal_event_state",
	"logged_date" date NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meal_event_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meal_event_id" uuid NOT NULL,
	"food_id" uuid NOT NULL,
	"quantity_grams" double precision NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meal_event" ADD CONSTRAINT "meal_event_patient_id_patient_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patient"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_event" ADD CONSTRAINT "meal_event_plan_id_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_event" ADD CONSTRAINT "meal_event_meal_id_meal_id_fk" FOREIGN KEY ("meal_id") REFERENCES "public"."meal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_event" ADD CONSTRAINT "meal_event_day_type_id_day_type_id_fk" FOREIGN KEY ("day_type_id") REFERENCES "public"."day_type"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_event" ADD CONSTRAINT "meal_event_chosen_meal_option_id_meal_option_id_fk" FOREIGN KEY ("chosen_meal_option_id") REFERENCES "public"."meal_option"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_event_item" ADD CONSTRAINT "meal_event_item_meal_event_id_meal_event_id_fk" FOREIGN KEY ("meal_event_id") REFERENCES "public"."meal_event"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_event_item" ADD CONSTRAINT "meal_event_item_food_id_food_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."food"("id") ON DELETE no action ON UPDATE no action;
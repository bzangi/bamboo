ALTER TABLE "food" ADD COLUMN "taco_id" integer;--> statement-breakpoint
ALTER TABLE "food" ADD COLUMN "taco_category" text;--> statement-breakpoint
ALTER TABLE "food_substitution_group" ADD COLUMN "origin" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "food" ADD CONSTRAINT "food_taco_id_unique" UNIQUE("taco_id");
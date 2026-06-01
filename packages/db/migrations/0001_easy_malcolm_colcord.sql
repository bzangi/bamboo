ALTER TABLE "nutritionist" ADD COLUMN "default_band_tolerance_pct" double precision;--> statement-breakpoint
ALTER TABLE "nutritionist" ADD COLUMN "default_floor_pct" double precision;--> statement-breakpoint
ALTER TABLE "patient" ADD COLUMN "band_tolerance_pct" double precision;--> statement-breakpoint
ALTER TABLE "patient" ADD COLUMN "floor_pct" double precision;
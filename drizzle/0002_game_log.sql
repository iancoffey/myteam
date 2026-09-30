ALTER TABLE "games" ADD COLUMN "log" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "periods" integer;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "period_min" integer;
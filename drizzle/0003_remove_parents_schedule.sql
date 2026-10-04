ALTER TABLE "games" DROP CONSTRAINT IF EXISTS "games_event_id_events_id_fk";--> statement-breakpoint
ALTER TABLE "games" DROP COLUMN IF EXISTS "event_id";--> statement-breakpoint
DROP TABLE IF EXISTS "events" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "guardians" CASCADE;

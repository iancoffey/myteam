ALTER TABLE "players" ADD COLUMN "group_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "groups" jsonb DEFAULT '[]'::jsonb NOT NULL;
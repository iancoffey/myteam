CREATE TABLE "club_invites" (
	"club_id" uuid PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "club_invites_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "club_members" (
	"club_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'coach' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "club_members_club_id_user_id_pk" PRIMARY KEY("club_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "clubs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "teams" DROP CONSTRAINT "teams_owner_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "teams" ALTER COLUMN "owner_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "club_id" uuid;--> statement-breakpoint
-- Everything before clubs existed belonged to one coaching staff that shared all teams: put it in one
-- club with every existing coach as an admin.
INSERT INTO "clubs" ("name") SELECT 'My club' WHERE EXISTS (SELECT 1 FROM "users") OR EXISTS (SELECT 1 FROM "teams");--> statement-breakpoint
UPDATE "teams" SET "club_id" = (SELECT "id" FROM "clubs" ORDER BY "created_at" LIMIT 1) WHERE "club_id" IS NULL;--> statement-breakpoint
INSERT INTO "club_members" ("club_id", "user_id", "role") SELECT c."id", u."id", 'admin' FROM "users" u CROSS JOIN (SELECT "id" FROM "clubs" ORDER BY "created_at" LIMIT 1) c ON CONFLICT DO NOTHING;--> statement-breakpoint
ALTER TABLE "teams" ALTER COLUMN "club_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "session_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "failed_logins" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "locked_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "club_invites" ADD CONSTRAINT "club_invites_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_members" ADD CONSTRAINT "club_members_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_members" ADD CONSTRAINT "club_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "club_members_user_idx" ON "club_members" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "teams_club_idx" ON "teams" USING btree ("club_id");
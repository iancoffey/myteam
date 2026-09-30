# myteam

A phone-first web app for rec soccer coaches (U6–U14): check kids in as they arrive, generate a fair
lineup, run the game with a clock and suggested substitutions, and keep the schedule, snack rotation
and parent contacts in one place.

## Stack

- Next.js 16 (App Router, server actions) on Vercel
- Postgres via Drizzle ORM: Neon in production, embedded PGlite locally (no setup)
- Static email/password logins from an env var, signed session cookie (180 days)
- Offline: field mode keeps game state on the phone; a service worker serves pages you've opened before

## Run locally

```sh
npm install
npm run dev
```

Open http://localhost:3000 and sign in as `coach@example.com` / `soccer`. Data lives in `.data/`
(delete it to start over).

## Deploy to Vercel

1. Import the repo into Vercel.
2. Storage → add a **Neon** Postgres database to the project. It sets `DATABASE_URL`.
3. Settings → Environment Variables (Production and Preview):
   - `AUTH_USERS`: `you@example.com:a-long-password,coach2@example.com:another-password`
   - `AUTH_SECRET` (optional): a long random string, e.g. `openssl rand -base64 32`. Without it,
     sign-ins are signed with a key derived from `DATABASE_URL`.
4. Deploy. The build only compiles the app; it never needs the database. The app creates and
   updates its tables on first use. If a setting is missing, the sign-in page lists what to add.

To add or remove a coach, edit `AUTH_USERS` and redeploy. Removed coaches are signed out on their
next request.

## Database changes

Edit `lib/db/schema.ts`, then run `npm run db:generate` and commit the new file in `drizzle/`.
The app applies it on its next start, locally and in production.

## Layout

- `app/(app)/`: signed-in pages: teams, team hub, roster, schedule, team settings, field mode
- `app/actions.ts`: every mutation (server actions), each checking the team belongs to the coach
- `components/FieldMode.tsx`: game day: check-in, lineup, period clock with swap marks, swaps, game log, undo, save
- `app/(app)/teams/[id]/games/[gameId]`: a saved game: subs by period and minutes
- `lib/formats.ts`: age-group defaults and game formats
- `prototype/field.html`: the original single-file prototype

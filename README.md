# myteam

A phone-first web app for rec soccer coaches (U6–U14). Define your teams once, then start a game or a
practice in one tap: check kids in as they arrive, make a fair lineup, run the game clock and suggested
substitutions, or run drill timers at practice. Head and assistant coaches share the same live game on
their own phones.

## Stack

- Next.js 16 (App Router, server actions) on Vercel
- Postgres via Drizzle ORM: Neon in production, embedded PGlite locally (no setup)
- Static email/password logins from an env var, signed session cookie (180 days)
- One live game or practice per team, stored on the server and synced to every coach's phone every
  couple of seconds; taps made with no signal wait on the phone and replay at the time they happened
- Clocks run on server time, so every phone shows the same countdown

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

To add or remove a coach's login, edit `AUTH_USERS` and redeploy. Removed logins are signed out on
their next request. To let an assistant coach a team, give them a login, then add their email on the
team's Coaches page.

## Database changes

Edit `lib/db/schema.ts`, then run `npm run db:generate` and commit the new file in `drizzle/`.
The app applies it on its next start, locally and in production.

## Layout

- `lib/live.ts`: the shared game/practice engine (check-in, lineups, swaps, clock, undo, drill timer),
  run on phones and on the server; tested in `lib/live.test.ts` (`npm test`)
- `app/api/teams/[id]/live/`: start, sync and end the live session
- `components/useLive.ts`: keeps a phone in sync, queues taps when offline
- `components/FieldMode.tsx`: the game-day and practice screens
- `app/(app)/`: team list, team page, roster, coaches, settings, saved games
- `app/actions.ts`: form actions, each checking the coach can see the team
- `lib/formats.ts`: age-group defaults and game formats

# myteam

A phone-first web app for rec soccer coaches (U6–U14). Define your teams once, then start a game or a
practice in one tap: check kids in as they arrive, make a fair lineup, run the game clock and suggested
substitutions, or at practice run drill timers and split whoever showed up into even scrimmage teams. Head and assistant coaches share the same live game on
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

## Tests

```sh
npm test                      # game rules (lib/live.test.ts)
npx playwright install chromium   # once
npm run e2e                   # phone-sized browser scenarios, incl. two coaches sharing a game
```

## Deploy to Vercel

1. Import the repo into Vercel.
2. Storage → add a **Neon** Postgres database to the project. It sets `DATABASE_URL`.
3. Optional environment variables (Production and Preview):
   - `AUTH_SECRET`: a long random string (`openssl rand -base64 32`). Without it, sign-ins are signed
     with a key derived from `DATABASE_URL`.
   - `SUPPORT_EMAIL`: shown as the contact on the privacy page.
   - `AUTH_USERS`: logins from before accounts existed (`email:password,…`). Each becomes a normal
     account the first time it signs in; after that it can be removed.
4. Deploy. The build only compiles the app; it never needs the database. The app creates and
   updates its tables on first use.

## Accounts and clubs

Anyone can create an account (email and password, stored as a scrypt hash; 10 wrong passwords lock
an account for 15 minutes). A new coach creates a club or league, then shares its invite link from the
Club page; coaches who join see every team in the club and the same live games, timers and scrimmage
teams. Clubs never see each other's data. Admins manage coaches, the invite link and deleting teams.
Account → Delete account removes the account (Apple requires in-app deletion).

## Database changes

Edit `lib/db/schema.ts`, then run `npm run db:generate` and commit the new file in `drizzle/`.
The app applies it on its next start, locally and in production.

## Layout

- `lib/live.ts`: the shared game/practice engine (check-in, lineups, swaps, clock, undo, drill timer),
  run on phones and on the server; tested in `lib/live.test.ts` (`npm test`)
- `app/api/teams/[id]/live/`: start, sync and end the live session
- `components/useLive.ts`: keeps a phone in sync, queues taps when offline
- `components/FieldMode.tsx`: the game-day and practice screens
- `app/(app)/`: team list, team page, roster, settings, saved games
- `app/actions.ts`: form actions (all require a signed-in coach)
- `lib/formats.ts`: age-group defaults and game formats

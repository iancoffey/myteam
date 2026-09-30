import 'server-only'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import * as schema from './schema'

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>

// Production uses Neon over HTTP (DATABASE_URL). Locally, with no DATABASE_URL, an embedded
// PGlite database in .data/ is used. Either way the schema is migrated here, on first use in each
// server process, so deploying never depends on the database being reachable at build time.
// Neon's HTTP driver has no interactive transactions, so code must not rely on db.transaction().
const g = globalThis as unknown as { __myteamDb?: Promise<Db> }
const MIGRATIONS = path.join(process.cwd(), 'drizzle')

export function db(): Promise<Db> {
  g.__myteamDb ??= connect().catch((err) => {
    // Don't cache a failed connection; the next request tries again.
    g.__myteamDb = undefined
    throw err
  })
  return g.__myteamDb
}

async function connect(): Promise<Db> {
  const url = process.env.DATABASE_URL
  if (url) {
    await migrateRemote(process.env.DATABASE_URL_UNPOOLED || url)
    const { neon } = await import('@neondatabase/serverless')
    const { drizzle } = await import('drizzle-orm/neon-http')
    return drizzle(neon(url), { schema }) as unknown as Db
  }
  if (process.env.VERCEL) {
    throw new Error('DATABASE_URL is not set. Add a Neon database to this Vercel project.')
  }
  const { PGlite } = await import('@electric-sql/pglite')
  const { drizzle } = await import('drizzle-orm/pglite')
  const { migrate } = await import('drizzle-orm/pglite/migrator')
  const dir = path.join(process.cwd(), '.data', 'pglite')
  mkdirSync(dir, { recursive: true })
  const client = new PGlite(dir)
  const local = drizzle(client, { schema })
  await migrate(local, { migrationsFolder: MIGRATIONS })
  return local as unknown as Db
}

// Applies pending migrations over a direct Postgres connection. Already-applied migrations are
// skipped, so after the first run this is one quick query per server start. Two servers starting at
// once can race on the first run; the loser fails, waits, and then finds everything applied.
async function migrateRemote(url: string) {
  const { Client } = await import('pg')
  const { drizzle } = await import('drizzle-orm/node-postgres')
  const { migrate } = await import('drizzle-orm/node-postgres/migrator')
  for (let attempt = 1; ; attempt++) {
    const client = new Client({ connectionString: url })
    try {
      await client.connect()
      await migrate(drizzle(client), { migrationsFolder: MIGRATIONS })
      return
    } catch (err) {
      if (attempt >= 3) throw err
      await new Promise((r) => setTimeout(r, 1500 * attempt))
    } finally {
      await client.end().catch(() => {})
    }
  }
}

export { schema }

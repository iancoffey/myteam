import 'server-only'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import * as schema from './schema'

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>

// Production uses Neon over HTTP (DATABASE_URL). Locally, with no DATABASE_URL, an embedded
// PGlite database in .data/ is created and migrated on first use.
// Neon's HTTP driver has no interactive transactions, so code must not rely on db.transaction().
const g = globalThis as unknown as { __myteamDb?: Promise<Db> }

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
    const { neon } = await import('@neondatabase/serverless')
    const { drizzle } = await import('drizzle-orm/neon-http')
    return drizzle(neon(url), { schema }) as unknown as Db
  }
  if (process.env.NODE_ENV === 'production' && process.env.VERCEL) {
    throw new Error('DATABASE_URL is not set. Add a Neon database to this Vercel project.')
  }
  const { PGlite } = await import('@electric-sql/pglite')
  const { drizzle } = await import('drizzle-orm/pglite')
  const { migrate } = await import('drizzle-orm/pglite/migrator')
  const dir = path.join(process.cwd(), '.data', 'pglite')
  mkdirSync(dir, { recursive: true })
  const client = new PGlite(dir)
  const local = drizzle(client, { schema })
  await migrate(local, { migrationsFolder: path.join(process.cwd(), 'drizzle') })
  return local as unknown as Db
}

export { schema }

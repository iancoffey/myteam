import 'server-only'
import { and, eq } from 'drizzle-orm'
import { db, schema } from './db'
import { getLive, listPlayers, teamRules, type Team } from './data'
import { cleanLog } from './gamelog'
import { MIN, applyAll, kickedOff, newState, project, type ClientSession, type Kind, type Timed } from './live'

const { liveSessions, games } = schema
type Row = typeof liveSessions.$inferSelect
export type { ClientSession }

export function toClient(row: Row): ClientSession {
  return { id: row.id, kind: row.kind as Kind, rev: row.version, state: row.state }
}

// Starts the team's game or practice, or returns the one already running.
export async function startLive(t: Team, kind: Kind, by: string): Promise<Row> {
  const d = await db()
  const kids = await listPlayers(t.id)
  await d
    .insert(liveSessions)
    .values({ teamId: t.id, kind, state: newState(kind, kids.map((k) => k.id), Date.now()), createdBy: by })
    .onConflictDoNothing({ target: liveSessions.teamId })
  return (await getLive(t.id))!
}

// Applies a coach's changes on top of whatever the other coaches did. Each write only succeeds
// against the version it read, so simultaneous taps never overwrite each other: the loser re-reads
// and re-applies. Returns null if the session has ended.
export async function actLive(t: Team, sid: string, actions: Timed[]): Promise<Row | null> {
  const d = await db()
  const rules = teamRules(t)
  const roster = new Set((await listPlayers(t.id)).map((k) => k.id))
  for (let attempt = 0; attempt < 8; attempt++) {
    const [row] = await d.select().from(liveSessions).where(and(eq(liveSessions.id, sid), eq(liveSessions.teamId, t.id)))
    if (!row) return null
    const next = applyAll(row.state, actions, Date.now(), rules, roster)
    const [saved] = await d
      .update(liveSessions)
      .set({ state: next, version: row.version + 1, updatedAt: new Date() })
      .where(and(eq(liveSessions.id, sid), eq(liveSessions.version, row.version)))
      .returning()
    if (saved) return saved
  }
  throw new Error('live session busy')
}

// Ends the session. A game that kicked off is saved (once, even if two coaches finish it).
export async function finishLive(t: Team, sid: string): Promise<{ gameId: string | null }> {
  const d = await db()
  const [row] = await d.select().from(liveSessions).where(and(eq(liveSessions.id, sid), eq(liveSessions.teamId, t.id)))
  if (!row) return { gameId: null }
  const st = project(row.state, Date.now(), teamRules(t))
  let gameId: string | null = null
  if (row.kind === 'game' && kickedOff(st)) {
    const roster = new Set((await listPlayers(t.id)).map((k) => k.id))
    const minutes: Record<string, number> = {}
    for (const [id, k] of Object.entries(st.kids)) if (roster.has(id) && k.here) minutes[id] = Math.round(k.ms)
    await d
      .insert(games)
      .values({
        teamId: t.id,
        clientId: row.id,
        us: st.us,
        them: st.them,
        minutes,
        log: cleanLog(st.log, roster, t.periods, t.periodMin * MIN),
        periods: t.periods,
        periodMin: t.periodMin,
      })
      .onConflictDoNothing({ target: games.clientId })
    const [g] = await d.select({ id: games.id }).from(games).where(eq(games.clientId, row.id))
    gameId = g?.id ?? null
  }
  await d.delete(liveSessions).where(eq(liveSessions.id, row.id))
  return { gameId }
}

export async function discardLive(t: Team, sid: string) {
  const d = await db()
  await d.delete(liveSessions).where(and(eq(liveSessions.id, sid), eq(liveSessions.teamId, t.id)))
}

import 'server-only'
import { and, asc, desc, eq, gte, inArray } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { db, schema } from './db'
import { requireSession } from './auth'

const { teams, players, guardians, events, games } = schema

// Every team read goes through here so a coach can only ever see their own teams.
export async function getOwnedTeam(teamId: string) {
  const session = await requireSession()
  if (!/^[0-9a-f-]{36}$/i.test(teamId)) notFound()
  const d = await db()
  const [team] = await d
    .select()
    .from(teams)
    .where(and(eq(teams.id, teamId), eq(teams.ownerId, session.userId)))
  if (!team) notFound()
  return team
}

export async function listTeams() {
  const session = await requireSession()
  const d = await db()
  return d.select().from(teams).where(eq(teams.ownerId, session.userId)).orderBy(asc(teams.createdAt))
}

export async function listPlayers(teamId: string) {
  const d = await db()
  return d
    .select()
    .from(players)
    .where(eq(players.teamId, teamId))
    .orderBy(asc(players.sort), asc(players.createdAt))
}

export async function listGuardians(teamId: string) {
  const d = await db()
  return d.select().from(guardians).where(eq(guardians.teamId, teamId)).orderBy(asc(guardians.createdAt))
}

export async function listUpcomingEvents(teamId: string, from = new Date(Date.now() - 3 * 60 * 60 * 1000)) {
  const d = await db()
  return d
    .select()
    .from(events)
    .where(and(eq(events.teamId, teamId), gte(events.startsAt, from)))
    .orderBy(asc(events.startsAt))
}

export async function nextEventsByTeam(teamIds: string[]) {
  if (!teamIds.length) return new Map<string, typeof events.$inferSelect>()
  const d = await db()
  const rows = await d
    .select()
    .from(events)
    .where(and(inArray(events.teamId, teamIds), gte(events.startsAt, new Date(Date.now() - 3 * 60 * 60 * 1000))))
    .orderBy(asc(events.startsAt))
  const m = new Map<string, typeof events.$inferSelect>()
  for (const e of rows) if (!m.has(e.teamId)) m.set(e.teamId, e)
  return m
}

// Season minutes per kid, summed from saved games.
export async function seasonMinutes(teamId: string) {
  const d = await db()
  const rows = await d.select({ minutes: games.minutes }).from(games).where(eq(games.teamId, teamId))
  const total: Record<string, number> = {}
  for (const r of rows) for (const [id, ms] of Object.entries(r.minutes)) total[id] = (total[id] ?? 0) + ms
  return { games: rows.length, ms: total }
}

export async function listGames(teamId: string, limit = 10) {
  const d = await db()
  return d
    .select({ id: games.id, us: games.us, them: games.them, playedAt: games.playedAt, opponent: events.opponent })
    .from(games)
    .leftJoin(events, eq(events.id, games.eventId))
    .where(eq(games.teamId, teamId))
    .orderBy(desc(games.playedAt))
    .limit(limit)
}

export async function getGame(teamId: string, gameId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(gameId)) notFound()
  const d = await db()
  const [row] = await d
    .select({ game: games, opponent: events.opponent })
    .from(games)
    .leftJoin(events, eq(events.id, games.eventId))
    .where(and(eq(games.id, gameId), eq(games.teamId, teamId)))
  if (!row) notFound()
  return row
}

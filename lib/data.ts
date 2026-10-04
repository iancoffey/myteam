import 'server-only'
import { and, asc, desc, eq, inArray, or } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { db, schema } from './db'
import { getSession, requireSession, type Session } from './auth'
import { cleanGroups, type FormatKey, type TeamSettings } from './formats'
import type { Rules } from './live'

const { users, teams, players, games, teamMembers, liveSessions } = schema
export type Team = typeof teams.$inferSelect

const isUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s)

// Every team read goes through here: a coach sees a team they own or were added to as a coach.
async function findCoachTeam(teamId: string, session: Session) {
  if (!isUuid(teamId)) return null
  const d = await db()
  const [team] = await d
    .select()
    .from(teams)
    .where(
      and(
        eq(teams.id, teamId),
        or(
          eq(teams.ownerId, session.userId),
          inArray(
            teams.id,
            d.select({ id: teamMembers.teamId }).from(teamMembers).where(eq(teamMembers.email, session.email)),
          ),
        ),
      ),
    )
  return team ? { team, isOwner: team.ownerId === session.userId } : null
}

// For pages and server actions: 404 unless this coach can see the team.
export async function getCoachTeam(teamId: string) {
  const session = await requireSession()
  const found = await findCoachTeam(teamId, session)
  if (!found) notFound()
  return { ...found, session }
}

// For API routes: null instead of redirecting.
export async function coachTeamOrNull(teamId: string) {
  const session = await getSession()
  if (!session) return null
  const found = await findCoachTeam(teamId, session)
  return found ? { ...found, session } : null
}

export async function listTeams() {
  const session = await requireSession()
  const d = await db()
  return d
    .select()
    .from(teams)
    .where(
      or(
        eq(teams.ownerId, session.userId),
        inArray(teams.id, d.select({ id: teamMembers.teamId }).from(teamMembers).where(eq(teamMembers.email, session.email))),
      ),
    )
    .orderBy(asc(teams.createdAt))
}

export function teamSettings(t: Team): TeamSettings {
  return { format: t.format as FormatKey, onField: t.onField, keeper: t.keeper, periods: t.periods, periodMin: t.periodMin, subMin: t.subMin }
}

export function teamRules(t: Team): Rules {
  return { periods: t.periods, periodMin: t.periodMin, subMin: t.subMin, keeper: t.keeper, onField: t.onField }
}

export async function listPlayers(teamId: string) {
  const d = await db()
  return d
    .select()
    .from(players)
    .where(eq(players.teamId, teamId))
    .orderBy(asc(players.sort), asc(players.createdAt))
}

// Kids as the live session sees them, with tags limited to groups that still exist.
export async function sessionKids(t: Team) {
  const groups = cleanGroups(t.groups)
  const valid = new Set(groups.map((g) => g.id))
  const kids = await listPlayers(t.id)
  return { groups, kids: kids.map((k) => ({ id: k.id, name: k.firstName, groups: k.groupIds.filter((id) => valid.has(id)) })) }
}

export async function listCoaches(t: Team) {
  const d = await db()
  const [owner] = await d.select({ email: users.email }).from(users).where(eq(users.id, t.ownerId))
  const members = await d
    .select({ email: teamMembers.email })
    .from(teamMembers)
    .where(eq(teamMembers.teamId, t.id))
    .orderBy(asc(teamMembers.addedAt))
  return { owner: owner?.email ?? '', assistants: members.map((m) => m.email) }
}

export async function getLive(teamId: string) {
  const d = await db()
  const [row] = await d.select().from(liveSessions).where(eq(liveSessions.teamId, teamId))
  return row ?? null
}

export async function liveByTeam(teamIds: string[]) {
  if (!teamIds.length) return new Map<string, typeof liveSessions.$inferSelect>()
  const d = await db()
  const rows = await d.select().from(liveSessions).where(inArray(liveSessions.teamId, teamIds))
  return new Map(rows.map((r) => [r.teamId, r]))
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
    .select({ id: games.id, us: games.us, them: games.them, playedAt: games.playedAt })
    .from(games)
    .where(eq(games.teamId, teamId))
    .orderBy(desc(games.playedAt))
    .limit(limit)
}

export async function getGame(teamId: string, gameId: string) {
  if (!isUuid(gameId)) notFound()
  const d = await db()
  const [game] = await d.select().from(games).where(and(eq(games.id, gameId), eq(games.teamId, teamId)))
  if (!game) notFound()
  return game
}

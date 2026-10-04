'use server'

import { and, eq, max } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { checkPassword, endSession, missingSettings, requireSession, startSession, upsertUser } from '@/lib/auth'
import { getCoachTeam, listCoaches } from '@/lib/data'
import { db, schema } from '@/lib/db'
import { normalizeEmail } from '@/lib/email'
import { AGES, FORMATS, LIMITS, agePreset, cleanGroups, isAge, type FormatKey } from '@/lib/formats'
import { isValidTimeZone } from '@/lib/time'

const { teams, players, games, teamMembers } = schema

export type FormState = { error?: string; ok?: string } | undefined

function str(fd: FormData, k: string) {
  const v = fd.get(k)
  return typeof v === 'string' ? v.trim() : ''
}
function int(fd: FormData, k: string, [lo, hi]: readonly [number, number], fallback: number) {
  const n = Number.parseInt(str(fd, k), 10)
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback
}
function refreshTeam(teamId: string) {
  revalidatePath(`/teams/${teamId}`, 'layout')
  revalidatePath('/')
}

// ---------- auth ----------

export async function login(_: FormState, fd: FormData): Promise<FormState> {
  const email = str(fd, 'email').toLowerCase()
  const password = typeof fd.get('password') === 'string' ? (fd.get('password') as string) : ''
  const missing = missingSettings()
  if (missing.length) {
    console.error(`[myteam] sign-in unavailable, missing settings: ${missing.join(', ')}`)
    return { error: 'Sign-in isn’t available right now. Please try again later.' }
  }
  if (!email || !password) return { error: 'Enter your email and password.' }
  if (!checkPassword(email, password)) return { error: 'That email and password don’t match.' }
  const user = await upsertUser(email)
  await startSession(user)
  redirect('/')
}

export async function logout() {
  await endSession()
  redirect('/login')
}

// ---------- teams ----------

function parseTeam(fd: FormData) {
  const name = str(fd, 'name').slice(0, 60)
  const ageRaw = str(fd, 'age')
  const age = isAge(ageRaw) ? ageRaw : AGES[0]
  const preset = agePreset(age)
  const fmtRaw = str(fd, 'format') as FormatKey
  const format: FormatKey = fmtRaw in FORMATS || fmtRaw === 'custom' ? fmtRaw : preset.format
  const base = format === 'custom' ? null : FORMATS[format as keyof typeof FORMATS]
  const tz = str(fd, 'timeZone')
  let groups: unknown = []
  try {
    groups = JSON.parse(str(fd, 'groups') || '[]')
  } catch {}
  return {
    name: name || `${age} team`,
    age,
    format,
    onField: base ? base.onField : int(fd, 'onField', LIMITS.onField, preset.onField),
    keeper: base ? base.keeper : str(fd, 'keeper') === 'yes',
    periods: int(fd, 'periods', LIMITS.periods, preset.periods),
    periodMin: int(fd, 'periodMin', LIMITS.periodMin, preset.periodMin),
    subMin: int(fd, 'subMin', LIMITS.subMin, preset.subMin),
    groups: cleanGroups(groups),
    timeZone: isValidTimeZone(tz) ? tz : undefined,
  }
}

export async function createTeam(_: FormState, fd: FormData): Promise<FormState> {
  const session = await requireSession()
  const t = parseTeam(fd)
  const d = await db()
  const [team] = await d
    .insert(teams)
    .values({ ...t, timeZone: t.timeZone ?? 'America/New_York', ownerId: session.userId })
    .returning({ id: teams.id })
  const names = parseNames(str(fd, 'roster'))
  if (names.length) {
    await d.insert(players).values(names.map((firstName, i) => ({ teamId: team.id, firstName, sort: i })))
  }
  revalidatePath('/')
  redirect(`/teams/${team.id}`)
}

export async function updateTeam(_: FormState, fd: FormData): Promise<FormState> {
  const { team } = await getCoachTeam(str(fd, 'teamId'))
  const t = parseTeam(fd)
  const d = await db()
  await d
    .update(teams)
    .set({ ...t, timeZone: t.timeZone ?? team.timeZone })
    .where(eq(teams.id, team.id))
  refreshTeam(team.id)
  redirect(`/teams/${team.id}`)
}

export async function deleteTeam(fd: FormData) {
  const { team, isOwner } = await getCoachTeam(str(fd, 'teamId'))
  if (!isOwner) return
  const d = await db()
  await d.delete(teams).where(eq(teams.id, team.id))
  revalidatePath('/')
  redirect('/')
}

// ---------- coaches ----------

export async function addCoach(_: FormState, fd: FormData): Promise<FormState> {
  const { team, isOwner } = await getCoachTeam(str(fd, 'teamId'))
  if (!isOwner) return { error: 'Only the team’s owner can add coaches.' }
  const email = normalizeEmail(str(fd, 'email'))
  if (!email) return { error: 'Enter the email your assistant signs in with.' }
  const { owner } = await listCoaches(team)
  if (email === owner) return { error: 'That’s you. You already coach this team.' }
  const d = await db()
  await d.insert(teamMembers).values({ teamId: team.id, email }).onConflictDoNothing()
  refreshTeam(team.id)
  return { ok: `Added ${email}.` }
}

export async function removeCoach(fd: FormData) {
  const { team, isOwner } = await getCoachTeam(str(fd, 'teamId'))
  if (!isOwner) return
  const d = await db()
  await d.delete(teamMembers).where(and(eq(teamMembers.teamId, team.id), eq(teamMembers.email, str(fd, 'email').toLowerCase())))
  refreshTeam(team.id)
}

// ---------- roster ----------

function parseNames(raw: string) {
  return raw
    .split(/[\n,]/)
    .map((s) => s.trim().slice(0, 40))
    .filter(Boolean)
    .slice(0, 40)
}

export async function addPlayers(_: FormState, fd: FormData): Promise<FormState> {
  const { team } = await getCoachTeam(str(fd, 'teamId'))
  const names = parseNames(str(fd, 'names'))
  if (!names.length) return { error: 'Type at least one first name.' }
  const d = await db()
  const [{ top }] = await d.select({ top: max(players.sort) }).from(players).where(eq(players.teamId, team.id))
  const start = (top ?? -1) + 1
  await d.insert(players).values(names.map((firstName, i) => ({ teamId: team.id, firstName, sort: start + i })))
  refreshTeam(team.id)
  return { ok: names.length === 1 ? `Added ${names[0]}.` : `Added ${names.length} kids.` }
}

export async function renamePlayer(fd: FormData) {
  const { team } = await getCoachTeam(str(fd, 'teamId'))
  const firstName = str(fd, 'firstName').slice(0, 40)
  if (!firstName) return
  const d = await db()
  await d
    .update(players)
    .set({ firstName })
    .where(and(eq(players.id, str(fd, 'playerId')), eq(players.teamId, team.id)))
  refreshTeam(team.id)
}

export async function removePlayer(fd: FormData) {
  const { team } = await getCoachTeam(str(fd, 'teamId'))
  const d = await db()
  await d.delete(players).where(and(eq(players.id, str(fd, 'playerId')), eq(players.teamId, team.id)))
  refreshTeam(team.id)
}

// Called straight from the roster's group chips, one tap per change.
export async function setPlayerGroups(input: {
  teamId: string
  playerId: string
  groupIds: string[]
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { team } = await getCoachTeam(input.teamId)
  const valid = new Set(team.groups.map((g) => g.id))
  const groupIds = [...new Set((input.groupIds ?? []).filter((id) => typeof id === 'string' && valid.has(id)))]
  const d = await db()
  const updated = await d
    .update(players)
    .set({ groupIds })
    .where(and(eq(players.id, input.playerId), eq(players.teamId, team.id)))
    .returning({ id: players.id })
  if (!updated.length) return { ok: false, error: 'That player is no longer on this team.' }
  refreshTeam(team.id)
  return { ok: true }
}

// ---------- saved games ----------

export async function deleteGame(fd: FormData) {
  const { team } = await getCoachTeam(str(fd, 'teamId'))
  const d = await db()
  await d.delete(games).where(and(eq(games.id, str(fd, 'gameId')), eq(games.teamId, team.id)))
  refreshTeam(team.id)
  redirect(`/teams/${team.id}`)
}

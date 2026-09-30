'use server'

import { and, asc, eq, isNull, max } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { checkPassword, endSession, requireSession, startSession, upsertUser } from '@/lib/auth'
import { getOwnedTeam } from '@/lib/data'
import { db, schema } from '@/lib/db'
import { AGES, FORMATS, LIMITS, agePreset, cleanGroups, isAge, type FormatKey } from '@/lib/formats'
import { cleanLog } from '@/lib/gamelog'
import { normalizeEmail, normalizePhone } from '@/lib/phone'
import { isValidTimeZone, zonedToDate } from '@/lib/time'

const { teams, players, guardians, events, games } = schema

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
  const team = await getOwnedTeam(str(fd, 'teamId'))
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
  const team = await getOwnedTeam(str(fd, 'teamId'))
  const d = await db()
  await d.delete(teams).where(eq(teams.id, team.id))
  revalidatePath('/')
  redirect('/')
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
  const team = await getOwnedTeam(str(fd, 'teamId'))
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
  const team = await getOwnedTeam(str(fd, 'teamId'))
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
  const team = await getOwnedTeam(str(fd, 'teamId'))
  const d = await db()
  await d.delete(players).where(and(eq(players.id, str(fd, 'playerId')), eq(players.teamId, team.id)))
  refreshTeam(team.id)
}

export async function addGuardian(_: FormState, fd: FormData): Promise<FormState> {
  const team = await getOwnedTeam(str(fd, 'teamId'))
  const playerId = str(fd, 'playerId')
  const firstName = str(fd, 'firstName').slice(0, 40)
  const phoneRaw = str(fd, 'phone')
  const emailRaw = str(fd, 'email')
  if (!firstName) return { error: 'Add the parent’s first name.' }
  const phone = normalizePhone(phoneRaw)
  if (phoneRaw && !phone) return { error: 'That phone number doesn’t look right. Use 10 digits, like 555-123-4567.' }
  const email = normalizeEmail(emailRaw)
  if (emailRaw && !email) return { error: 'That email doesn’t look right.' }
  if (!phone && !email) return { error: 'Add a phone number or an email so you can reach them.' }
  const d = await db()
  const [kid] = await d
    .select({ id: players.id })
    .from(players)
    .where(and(eq(players.id, playerId), eq(players.teamId, team.id)))
  if (!kid) return { error: 'That player is no longer on this team.' }
  await d.insert(guardians).values({ teamId: team.id, playerId, firstName, phone, email })
  refreshTeam(team.id)
  return { ok: `Added ${firstName}.` }
}

// Called straight from the roster's group chips, one tap per change.
export async function setPlayerGroups(input: {
  teamId: string
  playerId: string
  groupIds: string[]
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const team = await getOwnedTeam(input.teamId)
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

export async function deleteGame(fd: FormData) {
  const team = await getOwnedTeam(str(fd, 'teamId'))
  const d = await db()
  await d.delete(games).where(and(eq(games.id, str(fd, 'gameId')), eq(games.teamId, team.id)))
  refreshTeam(team.id)
  redirect(`/teams/${team.id}`)
}

export async function removeGuardian(fd: FormData) {
  const team = await getOwnedTeam(str(fd, 'teamId'))
  const d = await db()
  await d.delete(guardians).where(and(eq(guardians.id, str(fd, 'guardianId')), eq(guardians.teamId, team.id)))
  refreshTeam(team.id)
}

// ---------- schedule ----------

export async function createEvent(_: FormState, fd: FormData): Promise<FormState> {
  const team = await getOwnedTeam(str(fd, 'teamId'))
  const kind = str(fd, 'kind') === 'practice' ? 'practice' : 'game'
  const startsAt = zonedToDate(str(fd, 'date'), str(fd, 'time'), team.timeZone)
  if (!startsAt) return { error: 'Pick a date and a start time.' }
  const d = await db()
  await d.insert(events).values({
    teamId: team.id,
    kind,
    startsAt,
    location: str(fd, 'location').slice(0, 80) || null,
    opponent: kind === 'game' ? str(fd, 'opponent').slice(0, 60) || null : null,
  })
  refreshTeam(team.id)
  return { ok: kind === 'game' ? 'Game added.' : 'Practice added.' }
}

export async function deleteEvent(fd: FormData) {
  const team = await getOwnedTeam(str(fd, 'teamId'))
  const d = await db()
  await d.delete(events).where(and(eq(events.id, str(fd, 'eventId')), eq(events.teamId, team.id)))
  refreshTeam(team.id)
}

export async function setSnack(fd: FormData) {
  const team = await getOwnedTeam(str(fd, 'teamId'))
  const playerId = str(fd, 'playerId')
  const d = await db()
  let snackPlayerId: string | null = null
  if (playerId) {
    const [kid] = await d
      .select({ id: players.id })
      .from(players)
      .where(and(eq(players.id, playerId), eq(players.teamId, team.id)))
    snackPlayerId = kid?.id ?? null
  }
  await d
    .update(events)
    .set({ snackPlayerId })
    .where(and(eq(events.id, str(fd, 'eventId')), eq(events.teamId, team.id)))
  refreshTeam(team.id)
}

// Give every upcoming game without snacks to the family that has brought them least, in roster order.
export async function fillSnackRotation(fd: FormData) {
  const team = await getOwnedTeam(str(fd, 'teamId'))
  const d = await db()
  const kids = await d
    .select({ id: players.id })
    .from(players)
    .where(eq(players.teamId, team.id))
    .orderBy(asc(players.sort), asc(players.createdAt))
  if (!kids.length) return
  const all = await d
    .select({ id: events.id, snack: events.snackPlayerId, startsAt: events.startsAt })
    .from(events)
    .where(and(eq(events.teamId, team.id), eq(events.kind, 'game')))
    .orderBy(asc(events.startsAt))
  const count = new Map(kids.map((k) => [k.id, 0]))
  for (const e of all) if (e.snack && count.has(e.snack)) count.set(e.snack, count.get(e.snack)! + 1)
  const now = Date.now()
  const open = all.filter((e) => !e.snack && e.startsAt.getTime() > now)
  for (const e of open) {
    let pick = kids[0].id
    for (const k of kids) if (count.get(k.id)! < count.get(pick)!) pick = k.id
    count.set(pick, count.get(pick)! + 1)
    await d
      .update(events)
      .set({ snackPlayerId: pick })
      .where(and(eq(events.id, e.id), eq(events.teamId, team.id), isNull(events.snackPlayerId)))
  }
  refreshTeam(team.id)
}

// ---------- field mode ----------

export async function saveGame(input: {
  teamId: string
  clientId: string
  eventId?: string | null
  us: number
  them: number
  minutes: Record<string, number>
  log?: unknown
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const team = await getOwnedTeam(input.teamId)
  const d = await db()
  const kids = await d.select({ id: players.id }).from(players).where(eq(players.teamId, team.id))
  const valid = new Set(kids.map((k) => k.id))
  const minutes: Record<string, number> = {}
  for (const [id, ms] of Object.entries(input.minutes ?? {})) {
    if (valid.has(id) && Number.isFinite(ms) && ms >= 0) minutes[id] = Math.min(Math.round(ms), 4 * 60 * 60 * 1000)
  }
  let eventId: string | null = null
  if (input.eventId) {
    const [ev] = await d
      .select({ id: events.id })
      .from(events)
      .where(and(eq(events.id, input.eventId), eq(events.teamId, team.id)))
    eventId = ev?.id ?? null
  }
  const clientId = String(input.clientId ?? '').slice(0, 64)
  if (!clientId) return { ok: false, error: 'Missing game id.' }
  await d
    .insert(games)
    .values({
      teamId: team.id,
      eventId,
      clientId,
      us: Math.max(0, Math.min(99, input.us | 0)),
      them: Math.max(0, Math.min(99, input.them | 0)),
      minutes,
      log: cleanLog(input.log, valid, team.periods, team.periodMin * 60 * 1000),
      periods: team.periods,
      periodMin: team.periodMin,
    })
    .onConflictDoNothing({ target: games.clientId })
  refreshTeam(team.id)
  return { ok: true }
}


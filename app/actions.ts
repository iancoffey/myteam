'use server'

import { and, eq, max } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { changePassword as changeAccountPassword, endSession, missingSettings, requireSession, signIn, signUp, startSession } from '@/lib/auth'
import {
  createClub as createClubFor,
  currentClub,
  deleteAccount as deleteAccountFor,
  joinByInvite,
  myClubs,
  removeMember as removeClubMember,
  renameClub as renameClubTo,
  resetInvite,
  roleIn,
  setCurrentClub,
  setRole,
} from '@/lib/clubs'
import { getCoachTeam } from '@/lib/data'
import { db, schema } from '@/lib/db'
import { AGES, FORMATS, LIMITS, agePreset, cleanGroups, isAge, type FormatKey } from '@/lib/formats'
import { isValidTimeZone } from '@/lib/time'

const { teams, players, games } = schema

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

function signInUnavailable(): FormState | null {
  const missing = missingSettings()
  if (!missing.length) return null
  console.error(`[myteam] sign-in unavailable, missing settings: ${missing.join(', ')}`)
  return { error: 'Sign-in isn’t available right now. Please try again later.' }
}

// After signing in or up: join the club from an invite link if there was one, otherwise go home
// (or to creating a club, for a coach who isn't in one yet).
async function afterAuth(userId: string, invite: string): Promise<never> {
  if (invite) {
    const club = await joinByInvite(userId, invite)
    if (club) {
      await setCurrentClub(club.id)
      redirect('/')
    }
  }
  redirect((await myClubs(userId)).length ? '/' : '/welcome')
}

export async function login(_: FormState, fd: FormData): Promise<FormState> {
  const unavailable = signInUnavailable()
  if (unavailable) return unavailable
  const password = typeof fd.get('password') === 'string' ? (fd.get('password') as string) : ''
  const res = await signIn(str(fd, 'email'), password)
  if (!res.ok) return { error: res.error }
  await startSession(res.user)
  return afterAuth(res.user.id, str(fd, 'invite'))
}

export async function signup(_: FormState, fd: FormData): Promise<FormState> {
  const unavailable = signInUnavailable()
  if (unavailable) return unavailable
  const password = typeof fd.get('password') === 'string' ? (fd.get('password') as string) : ''
  const res = await signUp(str(fd, 'email'), password)
  if (!res.ok) return { error: res.error }
  await startSession(res.user)
  return afterAuth(res.user.id, str(fd, 'invite'))
}

export async function logout() {
  await endSession()
  redirect('/login')
}

export async function changePassword(_: FormState, fd: FormData): Promise<FormState> {
  const session = await requireSession()
  const get = (k: string) => (typeof fd.get(k) === 'string' ? (fd.get(k) as string) : '')
  const res = await changeAccountPassword(session.userId, get('current'), get('next'))
  if (!res.ok) return { error: res.error }
  // Every other phone is signed out; this one gets a fresh session.
  await startSession(res.user)
  return { ok: 'Password changed. Other phones are signed out.' }
}

export async function deleteAccount() {
  const session = await requireSession()
  await deleteAccountFor(session.userId)
  await endSession()
  redirect('/login?deleted=1')
}

// ---------- clubs ----------

export async function createClub(_: FormState, fd: FormData): Promise<FormState> {
  const session = await requireSession()
  const name = str(fd, 'name').slice(0, 60)
  if (!name) return { error: 'Give your club or league a name.' }
  const club = await createClubFor(session.userId, name)
  await setCurrentClub(club.id)
  revalidatePath('/')
  redirect('/')
}

export async function switchClub(fd: FormData) {
  const session = await requireSession()
  const clubId = str(fd, 'clubId')
  if (await roleIn(clubId, session.userId)) await setCurrentClub(clubId)
  revalidatePath('/')
  redirect('/')
}

export async function joinClub(fd: FormData) {
  const session = await requireSession()
  const club = await joinByInvite(session.userId, str(fd, 'invite'))
  if (club) await setCurrentClub(club.id)
  redirect('/')
}

async function adminClub(fd: FormData) {
  const session = await requireSession()
  const clubId = str(fd, 'clubId')
  const role = await roleIn(clubId, session.userId)
  return { session, clubId, isAdmin: role === 'admin', isMember: !!role }
}

export async function renameClub(_: FormState, fd: FormData): Promise<FormState> {
  const { clubId, isAdmin } = await adminClub(fd)
  if (!isAdmin) return { error: 'Only a club admin can rename the club.' }
  const name = str(fd, 'name').slice(0, 60)
  if (!name) return { error: 'Give your club or league a name.' }
  await renameClubTo(clubId, name)
  revalidatePath('/', 'layout')
  return { ok: 'Saved.' }
}

export async function newInviteLink(fd: FormData) {
  const { clubId, isAdmin } = await adminClub(fd)
  if (!isAdmin) return
  await resetInvite(clubId)
  revalidatePath('/club')
}

export async function setMemberRole(fd: FormData) {
  const { clubId, isAdmin } = await adminClub(fd)
  if (!isAdmin) return
  const role = str(fd, 'role') === 'admin' ? 'admin' : 'coach'
  const problem = await setRole(clubId, str(fd, 'userId'), role)
  if (problem) console.error(`[myteam] role change refused: ${problem}`)
  revalidatePath('/club')
}

export async function removeMember(fd: FormData) {
  const { session, clubId, isAdmin } = await adminClub(fd)
  const userId = str(fd, 'userId')
  if (!isAdmin && userId !== session.userId) return
  const problem = await removeClubMember(clubId, userId)
  if (problem) return
  revalidatePath('/', 'layout')
  if (userId === session.userId) redirect('/')
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
  const { club } = await currentClub(session)
  if (!club) redirect('/welcome')
  const t = parseTeam(fd)
  const d = await db()
  const [team] = await d
    .insert(teams)
    .values({ ...t, timeZone: t.timeZone ?? 'America/New_York', ownerId: session.userId, clubId: club.id })
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
  const { team, isAdmin } = await getCoachTeam(str(fd, 'teamId'))
  if (!isAdmin) return
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

// Called straight from the roster's goalie switch.
export async function setPlayerGoalie(input: { teamId: string; playerId: string; playsGoalie: boolean }): Promise<{ ok: true } | { ok: false; error: string }> {
  const { team } = await getCoachTeam(input.teamId)
  const d = await db()
  const updated = await d
    .update(players)
    .set({ playsGoalie: input.playsGoalie === true })
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

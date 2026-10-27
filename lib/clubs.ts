import 'server-only'
import { randomBytes } from 'node:crypto'
import { and, asc, eq, ne, sql } from 'drizzle-orm'
import { cookies } from 'next/headers'
import { db, schema } from './db'
import type { Session } from './auth'

const { clubs, clubMembers, clubInvites, users } = schema
const CURRENT = 'myteam_club'
export type Role = 'admin' | 'coach'

export async function myClubs(userId: string) {
  const d = await db()
  return d
    .select({ id: clubs.id, name: clubs.name, role: clubMembers.role })
    .from(clubMembers)
    .innerJoin(clubs, eq(clubs.id, clubMembers.clubId))
    .where(eq(clubMembers.userId, userId))
    .orderBy(asc(clubMembers.joinedAt))
}

// The club the coach is looking at: the one they last picked, or their first.
export async function currentClub(session: Session) {
  const mine = await myClubs(session.userId)
  const picked = (await cookies()).get(CURRENT)?.value
  return { club: mine.find((c) => c.id === picked) ?? mine[0] ?? null, all: mine }
}

export async function setCurrentClub(clubId: string) {
  const jar = await cookies()
  jar.set(CURRENT, clubId, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 })
}

export async function roleIn(clubId: string, userId: string): Promise<Role | null> {
  const d = await db()
  const [m] = await d
    .select({ role: clubMembers.role })
    .from(clubMembers)
    .where(and(eq(clubMembers.clubId, clubId), eq(clubMembers.userId, userId)))
  return (m?.role as Role) ?? null
}

export async function createClub(userId: string, name: string) {
  const d = await db()
  const [club] = await d.insert(clubs).values({ name }).returning()
  await d.insert(clubMembers).values({ clubId: club.id, userId, role: 'admin' })
  return club
}

export async function renameClub(clubId: string, name: string) {
  const d = await db()
  await d.update(clubs).set({ name }).where(eq(clubs.id, clubId))
}

const newToken = () => randomBytes(18).toString('base64url')

// The club's shareable invite link token, made on first use.
export async function inviteToken(clubId: string) {
  const d = await db()
  await d.insert(clubInvites).values({ clubId, token: newToken() }).onConflictDoNothing({ target: clubInvites.clubId })
  const [row] = await d.select({ token: clubInvites.token }).from(clubInvites).where(eq(clubInvites.clubId, clubId))
  return row.token
}

// A new link; the old one stops working.
export async function resetInvite(clubId: string) {
  const d = await db()
  await d
    .insert(clubInvites)
    .values({ clubId, token: newToken() })
    .onConflictDoUpdate({ target: clubInvites.clubId, set: { token: newToken(), createdAt: new Date() } })
}

export async function clubForInvite(token: string) {
  if (!/^[A-Za-z0-9_-]{10,64}$/.test(token)) return null
  const d = await db()
  const [row] = await d
    .select({ id: clubs.id, name: clubs.name })
    .from(clubInvites)
    .innerJoin(clubs, eq(clubs.id, clubInvites.clubId))
    .where(eq(clubInvites.token, token))
  return row ?? null
}

export async function joinByInvite(userId: string, token: string) {
  const club = await clubForInvite(token)
  if (!club) return null
  const d = await db()
  await d.insert(clubMembers).values({ clubId: club.id, userId, role: 'coach' }).onConflictDoNothing()
  return club
}

export async function listMembers(clubId: string) {
  const d = await db()
  return d
    .select({ userId: users.id, email: users.email, role: clubMembers.role, joinedAt: clubMembers.joinedAt })
    .from(clubMembers)
    .innerJoin(users, eq(users.id, clubMembers.userId))
    .where(eq(clubMembers.clubId, clubId))
    .orderBy(asc(clubMembers.joinedAt))
}

async function adminCount(clubId: string) {
  const d = await db()
  const [{ n }] = await d
    .select({ n: sql<number>`count(*)::int` })
    .from(clubMembers)
    .where(and(eq(clubMembers.clubId, clubId), eq(clubMembers.role, 'admin')))
  return n
}

export async function setRole(clubId: string, userId: string, role: Role): Promise<string | null> {
  if (role === 'coach' && (await roleIn(clubId, userId)) === 'admin' && (await adminCount(clubId)) <= 1) {
    return 'A club needs at least one admin. Make someone else an admin first.'
  }
  const d = await db()
  await d.update(clubMembers).set({ role }).where(and(eq(clubMembers.clubId, clubId), eq(clubMembers.userId, userId)))
  return null
}

// Removing someone (or leaving). The last admin can't leave a club that still has other coaches.
export async function removeMember(clubId: string, userId: string): Promise<string | null> {
  const role = await roleIn(clubId, userId)
  if (!role) return null
  const members = await listMembers(clubId)
  if (role === 'admin' && members.length > 1 && (await adminCount(clubId)) <= 1) {
    return 'A club needs at least one admin. Make someone else an admin first.'
  }
  const d = await db()
  if (members.length <= 1) await d.delete(clubs).where(eq(clubs.id, clubId))
  else await d.delete(clubMembers).where(and(eq(clubMembers.clubId, clubId), eq(clubMembers.userId, userId)))
  return null
}

// Deleting an account: clubs where this coach is the only member go with it (their teams too);
// where they're the last admin, the longest-standing other coach becomes admin.
export async function deleteAccount(userId: string) {
  const d = await db()
  for (const club of await myClubs(userId)) {
    const others = (await listMembers(club.id)).filter((m) => m.userId !== userId)
    if (!others.length) {
      await d.delete(clubs).where(eq(clubs.id, club.id))
      continue
    }
    if (club.role === 'admin' && !others.some((m) => m.role === 'admin')) {
      await d
        .update(clubMembers)
        .set({ role: 'admin' })
        .where(and(eq(clubMembers.clubId, club.id), eq(clubMembers.userId, others[0].userId), ne(clubMembers.userId, userId)))
    }
  }
  await d.delete(users).where(eq(users.id, userId))
}

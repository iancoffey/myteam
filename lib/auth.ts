import 'server-only'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { cache } from 'react'
import { eq } from 'drizzle-orm'
import { db, schema } from './db'
import { burnTime, hashPassword, normalizeEmail, passwordProblem, verifyPassword } from './password'

const { users } = schema
const COOKIE = 'myteam_session'
// Coaches should never hit a login screen on the sideline, so sessions last a season.
const MAX_AGE_S = 60 * 60 * 24 * 180
// After this many wrong passwords in a row the account waits a while before trying again.
const LOCK_AFTER = 10
const LOCK_MS = 15 * 60 * 1000
const DEV_USERS = 'coach@example.com:soccer'

function isProd() {
  return process.env.NODE_ENV === 'production'
}

// Signing key for session cookies: AUTH_SECRET if set, otherwise derived from DATABASE_URL (anyone who
// can read that already has all the data). In development with neither, a random key made at startup
// (kept across hot reloads) is used, so no signing key is ever published in the source.
const devKey = globalThis as unknown as { __myteamDevKey?: Uint8Array }

function secretKey(): Uint8Array | null {
  const s = process.env.AUTH_SECRET
  if (s) return new TextEncoder().encode(s)
  const dbUrl = process.env.DATABASE_URL
  if (dbUrl) return new Uint8Array(createHash('sha256').update(`myteam-session-key\0${dbUrl}`).digest())
  if (isProd()) return null
  devKey.__myteamDevKey ??= new Uint8Array(randomBytes(32))
  return devKey.__myteamDevKey
}

// Settings a production deploy still needs. Logged server-side only; never shown to visitors.
export function missingSettings(): string[] {
  if (!isProd()) return []
  const missing: string[] = []
  if (process.env.VERCEL && !process.env.DATABASE_URL) missing.push('DATABASE_URL')
  if (!process.env.VERCEL && !process.env.AUTH_SECRET && !process.env.DATABASE_URL) missing.push('AUTH_SECRET')
  return missing
}

// Logins from before accounts existed: AUTH_USERS="a@example.com:pass,b@example.com:pass". The first
// sign-in with one of these turns it into a normal account with a hashed password.
function legacyUsers(): Map<string, string> {
  const raw = process.env.AUTH_USERS ?? (isProd() ? '' : DEV_USERS)
  const out = new Map<string, string>()
  for (const entry of raw.split(/[,\n]/)) {
    const i = entry.indexOf(':')
    if (i > 0) out.set(entry.slice(0, i).trim().toLowerCase(), entry.slice(i + 1).trim())
  }
  return out
}

function sameSecret(a: string, b: string) {
  return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest())
}

type User = typeof users.$inferSelect
type Result = { ok: true; user: User } | { ok: false; error: string }

export async function signIn(rawEmail: string, password: string): Promise<Result> {
  const email = normalizeEmail(rawEmail)
  if (!email || !password) return { ok: false, error: 'Enter your email and password.' }
  const d = await db()
  const [found] = await d.select().from(users).where(eq(users.email, email))
  if (found?.lockedUntil && found.lockedUntil.getTime() > Date.now()) {
    return { ok: false, error: 'Too many wrong passwords. Wait 15 minutes, then try again.' }
  }
  let ok = false
  if (found?.passwordHash) ok = await verifyPassword(password, found.passwordHash)
  else {
    const legacy = legacyUsers().get(email)
    ok = legacy !== undefined && sameSecret(password, legacy)
    if (!ok) await burnTime(password)
  }
  if (!ok) {
    if (found) {
      const failed = found.failedLogins + 1
      await d
        .update(users)
        .set({ failedLogins: failed, lockedUntil: failed >= LOCK_AFTER ? new Date(Date.now() + LOCK_MS) : null })
        .where(eq(users.id, found.id))
    }
    return { ok: false, error: 'That email and password don’t match.' }
  }
  const passwordHash = found?.passwordHash ?? (await hashPassword(password))
  if (!found) await d.insert(users).values({ email, passwordHash }).onConflictDoNothing()
  else await d.update(users).set({ failedLogins: 0, lockedUntil: null, passwordHash }).where(eq(users.id, found.id))
  const [user] = await d.select().from(users).where(eq(users.email, email))
  return { ok: true, user }
}

export async function signUp(rawEmail: string, password: string): Promise<Result> {
  const email = normalizeEmail(rawEmail)
  if (!email) return { ok: false, error: 'Enter a valid email.' }
  const problem = passwordProblem(password)
  if (problem) return { ok: false, error: problem }
  const d = await db()
  const passwordHash = await hashPassword(password)
  const [user] = await d.insert(users).values({ email, passwordHash }).onConflictDoNothing().returning()
  if (!user) return { ok: false, error: 'There’s already an account with that email. Sign in instead.' }
  return { ok: true, user }
}

export async function changePassword(userId: string, current: string, next: string): Promise<Result> {
  const d = await db()
  const [u] = await d.select().from(users).where(eq(users.id, userId))
  if (!u?.passwordHash || !(await verifyPassword(current, u.passwordHash))) return { ok: false, error: 'Your current password isn’t right.' }
  const problem = passwordProblem(next)
  if (problem) return { ok: false, error: problem }
  const [user] = await d
    .update(users)
    .set({ passwordHash: await hashPassword(next), sessionVersion: u.sessionVersion + 1 })
    .where(eq(users.id, userId))
    .returning()
  return { ok: true, user }
}

export async function startSession(user: { id: string; sessionVersion: number }) {
  const key = secretKey()
  if (!key) throw new Error(`Missing settings: ${missingSettings().join(', ')}`)
  const token = await new SignJWT({ sv: user.sessionVersion })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_S}s`)
    .sign(key)
  const jar = await cookies()
  jar.set(COOKIE, token, { httpOnly: true, secure: isProd(), sameSite: 'lax', path: '/', maxAge: MAX_AGE_S })
}

export async function endSession() {
  const jar = await cookies()
  jar.delete(COOKIE)
}

export type Session = { userId: string; email: string }

// A session is valid while its account exists and its version matches; changing the password or
// deleting the account signs out every phone.
export const getSession = cache(async (): Promise<Session | null> => {
  const token = (await cookies()).get(COOKIE)?.value
  const key = secretKey()
  if (!token || !key) return null
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] })
    if (!payload.sub || typeof payload.sv !== 'number') return null
    const d = await db()
    const [u] = await d.select({ id: users.id, email: users.email, sv: users.sessionVersion }).from(users).where(eq(users.id, payload.sub))
    if (!u || u.sv !== payload.sv) return null
    return { userId: u.id, email: u.email }
  } catch {
    return null
  }
})

export async function requireSession(): Promise<Session> {
  const s = await getSession()
  if (!s) redirect('/login')
  return s
}

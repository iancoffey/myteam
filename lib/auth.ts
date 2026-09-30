import 'server-only'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { cache } from 'react'
import { eq } from 'drizzle-orm'
import { db, schema } from './db'

const COOKIE = 'myteam_session'
// Coaches should never hit a login screen on the sideline, so sessions last a season.
const MAX_AGE_S = 60 * 60 * 24 * 180
const DEV_USERS = 'coach@example.com:soccer'

function isProd() {
  return process.env.NODE_ENV === 'production'
}

// Signing key for session cookies: AUTH_SECRET if set, otherwise derived from DATABASE_URL (anyone who
// can read that already has all the data), so a deploy needs only the database and AUTH_USERS.
// In development with neither, a random key made at startup (kept across hot reloads) is used, so no
// signing key is ever published in the source; restarting the dev server signs you out.
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

// Settings a production deploy still needs. The login page lists them instead of failing.
export function missingSettings(): string[] {
  if (!isProd()) return []
  const missing: string[] = []
  if (process.env.VERCEL && !process.env.DATABASE_URL) missing.push('DATABASE_URL')
  if (!process.env.VERCEL && !process.env.AUTH_SECRET && !process.env.DATABASE_URL) missing.push('AUTH_SECRET')
  if (!process.env.AUTH_USERS) missing.push('AUTH_USERS')
  return missing
}

// AUTH_USERS="coach1@example.com:pass1,coach2@example.com:pass2". Passwords may contain ':' but not ','.
function staticUsers(): Map<string, string> {
  const raw = process.env.AUTH_USERS ?? (isProd() ? '' : DEV_USERS)
  const users = new Map<string, string>()
  for (const entry of raw.split(/[,\n]/)) {
    const i = entry.indexOf(':')
    if (i <= 0) continue
    users.set(entry.slice(0, i).trim().toLowerCase(), entry.slice(i + 1).trim())
  }
  return users
}

function sameSecret(a: string, b: string) {
  const ha = createHash('sha256').update(a).digest()
  const hb = createHash('sha256').update(b).digest()
  return timingSafeEqual(ha, hb)
}

export function checkPassword(email: string, password: string): boolean {
  const expected = staticUsers().get(email.trim().toLowerCase())
  // Compare against a dummy when the user is unknown so timing doesn't reveal which emails exist.
  return sameSecret(password, expected ?? '\u0000no-user') && expected !== undefined
}

export async function upsertUser(email: string) {
  const d = await db()
  const normalized = email.trim().toLowerCase()
  await d.insert(schema.users).values({ email: normalized }).onConflictDoNothing()
  const [user] = await d.select().from(schema.users).where(eq(schema.users.email, normalized))
  return user
}

function requireKey() {
  const key = secretKey()
  if (!key) throw new Error(`Missing settings: ${missingSettings().join(', ')}`)
  return key
}

export async function startSession(user: { id: string; email: string }) {
  const token = await new SignJWT({ email: user.email, provider: 'password' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_S}s`)
    .sign(requireKey())
  const jar = await cookies()
  jar.set(COOKIE, token, {
    httpOnly: true,
    secure: isProd(),
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE_S,
  })
}

export async function endSession() {
  const jar = await cookies()
  jar.delete(COOKIE)
}

export type Session = { userId: string; email: string }

export const getSession = cache(async (): Promise<Session | null> => {
  const token = (await cookies()).get(COOKIE)?.value
  const key = secretKey()
  if (!token || !key) return null
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] })
    if (!payload.sub || typeof payload.email !== 'string') return null
    // Removing a coach from AUTH_USERS signs them out on their next request.
    if (payload.provider === 'password' && !staticUsers().has(payload.email)) return null
    return { userId: payload.sub, email: payload.email }
  } catch {
    return null
  }
})

export async function requireSession(): Promise<Session> {
  const s = await getSession()
  if (!s) redirect('/login')
  return s
}

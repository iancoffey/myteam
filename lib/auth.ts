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

// Without AUTH_SECRET in development, sign with a random key made at startup (kept across hot
// reloads), so no signing key is ever published in the source. Restarting the dev server signs you out.
const devKey = globalThis as unknown as { __myteamDevKey?: Uint8Array }

function secretKey() {
  const s = process.env.AUTH_SECRET
  if (!s) {
    if (isProd()) throw new Error('AUTH_SECRET is not set')
    devKey.__myteamDevKey ??= new Uint8Array(randomBytes(32))
    return devKey.__myteamDevKey
  }
  return new TextEncoder().encode(s)
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

export async function startSession(user: { id: string; email: string }) {
  const token = await new SignJWT({ email: user.email, provider: 'password' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_S}s`)
    .sign(secretKey())
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
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ['HS256'] })
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

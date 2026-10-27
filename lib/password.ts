import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto'

// Passwords are stored as scrypt hashes: "scrypt$N$r$p$salt$hash" (base64 salt and hash).
const N = 16384
const R = 8
const P = 1
const KEYLEN = 64
export const MIN_PASSWORD = 10

function derive(password: string, salt: Buffer, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password.normalize('NFKC'), salt, KEYLEN, { ...opts, maxmem: 64 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  )
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await derive(password, salt, { N, r: R, p: P })
  return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$')
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [kind, n, r, p, salt, hash] = stored.split('$')
  if (kind !== 'scrypt' || !salt || !hash) return false
  const expected = Buffer.from(hash, 'base64')
  const key = await derive(password, Buffer.from(salt, 'base64'), { N: Number(n), r: Number(r), p: Number(p) })
  return key.length === expected.length && timingSafeEqual(key, expected)
}

// Spends the same time as a real check, so a missing account can't be told apart by timing.
export async function burnTime(password: string) {
  await derive(password, Buffer.alloc(16), { N, r: R, p: P })
}

export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`
  if (password.length > 200) return 'That password is too long.'
  return null
}

export function normalizeEmail(raw: string): string | null {
  const e = raw.trim().toLowerCase()
  if (!e || e.length > 254) return null
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null
}

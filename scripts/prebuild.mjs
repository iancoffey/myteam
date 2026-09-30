// Runs before `next build`. On Vercel it checks required settings and applies database migrations,
// so a deploy never goes live against missing tables. Locally, with no DATABASE_URL, it does nothing:
// the embedded PGlite database migrates itself on first use.
import { execSync } from 'node:child_process'

const onVercel = !!process.env.VERCEL
const dbUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL

if (onVercel) {
  const missing = []
  if (!dbUrl) missing.push('DATABASE_URL (add a Neon database under Storage)')
  if (!process.env.AUTH_SECRET) missing.push('AUTH_SECRET (run `openssl rand -base64 32`)')
  if (!process.env.AUTH_USERS) missing.push('AUTH_USERS (e.g. you@example.com:a-long-password)')
  if (missing.length) {
    console.error(`\nmyteam can't deploy yet. Set these in Vercel → Settings → Environment Variables:\n  - ${missing.join('\n  - ')}\n`)
    process.exit(1)
  }
}

if (dbUrl) {
  console.log('Applying database migrations…')
  execSync('npx drizzle-kit migrate', { stdio: 'inherit' })
} else {
  console.log('No DATABASE_URL; skipping migrations (local PGlite migrates on first use).')
}

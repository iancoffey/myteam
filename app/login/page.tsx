import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AuthForm } from '@/components/AuthForm'
import { getSession, missingSettings } from '@/lib/auth'

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ invite?: string; deleted?: string }> }) {
  const { invite, deleted } = await searchParams
  if (await getSession()) redirect(invite ? `/join/${encodeURIComponent(invite)}` : '/')
  // Configuration problems go to the server log only, never to the page.
  const missing = missingSettings()
  if (missing.length) console.error(`[myteam] sign-in unavailable, missing settings: ${missing.join(', ')}`)
  const q = invite ? `?invite=${encodeURIComponent(invite)}` : ''
  return (
    <main className="page" style={{ paddingTop: '10vh' }}>
      <h1 className="h1">myteam</h1>
      <p className="muted" style={{ margin: 0 }}>
        Check-in, lineups and fair subs for rec soccer. Sign in once and you stay signed in all season.
      </p>
      {deleted && <p className="msg ok" role="status">Your account was deleted.</p>}
      <AuthForm mode="login" invite={invite} />
      <p className="muted" style={{ margin: 0, textAlign: 'center' }}>
        New here? <Link href={`/signup${q}`}>Create an account</Link>
      </p>
      <p className="note" style={{ textAlign: 'center' }}><Link href="/privacy">Privacy</Link></p>
    </main>
  )
}

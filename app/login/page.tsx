import { redirect } from 'next/navigation'
import { getSession, missingSettings } from '@/lib/auth'
import { LoginForm } from './LoginForm'

export default async function LoginPage() {
  if (await getSession()) redirect('/')
  // Configuration problems go to the server log only, never to the page.
  const missing = missingSettings()
  if (missing.length) console.error(`[myteam] sign-in unavailable, missing settings: ${missing.join(', ')}`)
  return (
    <main className="page" style={{ paddingTop: '10vh' }}>
      <h1 className="h1">myteam</h1>
      <p className="muted" style={{ margin: 0 }}>
        Check-in, lineups and fair subs for rec soccer. Sign in once and you stay signed in all season.
      </p>
      <LoginForm />
    </main>
  )
}

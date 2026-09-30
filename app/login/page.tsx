import { redirect } from 'next/navigation'
import { getSession, missingSettings } from '@/lib/auth'
import { LoginForm } from './LoginForm'

const WHAT: Record<string, string> = {
  DATABASE_URL: 'the Postgres connection string. Adding a Neon database under Storage sets it for you.',
  AUTH_USERS: 'coach logins as email:password, comma-separated, e.g. you@example.com:a-long-password',
  AUTH_SECRET: 'a long random string used to sign sign-ins (openssl rand -base64 32).',
}

export default async function LoginPage() {
  if (await getSession()) redirect('/')
  const missing = missingSettings()
  return (
    <main className="page" style={{ paddingTop: '10vh' }}>
      <h1 className="h1">myteam</h1>
      <p className="muted" style={{ margin: 0 }}>
        Check-in, lineups and fair subs for rec soccer. Sign in once and you stay signed in all season.
      </p>
      {missing.length > 0 ? (
        <section className="card" role="alert">
          <p style={{ margin: 0, fontWeight: 700 }}>Almost ready. This site still needs these settings:</p>
          <ul style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 6 }}>
            {missing.map((m) => (
              <li key={m}>
                <code>{m}</code>: {WHAT[m]}
              </li>
            ))}
          </ul>
          <p className="note">Add them in the hosting project’s Settings → Environment Variables, then redeploy.</p>
        </section>
      ) : (
        <LoginForm />
      )}
    </main>
  )
}

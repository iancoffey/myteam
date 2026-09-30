import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { LoginForm } from './LoginForm'

export default async function LoginPage() {
  if (await getSession()) redirect('/')
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

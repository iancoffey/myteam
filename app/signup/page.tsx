import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AuthForm } from '@/components/AuthForm'
import { getSession } from '@/lib/auth'
import { clubForInvite } from '@/lib/clubs'

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const { invite } = await searchParams
  if (await getSession()) redirect(invite ? `/join/${encodeURIComponent(invite)}` : '/')
  const club = invite ? await clubForInvite(invite) : null
  const q = invite ? `?invite=${encodeURIComponent(invite)}` : ''
  return (
    <main className="page" style={{ paddingTop: '10vh' }}>
      <h1 className="h1">Create account</h1>
      <p className="muted" style={{ margin: 0 }}>
        {club ? `You’ll join ${club.name} and see its teams right away.` : 'Free for coaches. Set up your club or league next.'}
      </p>
      <AuthForm mode="signup" invite={club ? invite : undefined} />
      <p className="muted" style={{ margin: 0, textAlign: 'center' }}>
        Already have an account? <Link href={`/login${q}`}>Sign in</Link>
      </p>
      <p className="note" style={{ textAlign: 'center' }}>
        By creating an account you agree to how we handle data in our <Link href="/privacy">privacy policy</Link>.
      </p>
    </main>
  )
}

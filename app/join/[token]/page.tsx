import Link from 'next/link'
import { joinClub } from '@/app/actions'
import { getSession } from '@/lib/auth'
import { clubForInvite, roleIn } from '@/lib/clubs'

// Where a club's invite link lands: join now if signed in, otherwise sign up or in first.
export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const club = await clubForInvite(token)
  const session = await getSession()
  if (!club) {
    return (
      <main className="page" style={{ paddingTop: '10vh' }}>
        <h1 className="h1">Link expired</h1>
        <p className="muted" style={{ margin: 0 }}>This invite link isn’t valid anymore. Ask your club for a new one.</p>
        <Link href={session ? '/' : '/login'} className="btn primary big">{session ? 'Go to your teams' : 'Sign in'}</Link>
      </main>
    )
  }
  const already = session ? await roleIn(club.id, session.userId) : null
  const q = `?invite=${encodeURIComponent(token)}`
  return (
    <main className="page" style={{ paddingTop: '10vh' }}>
      <h1 className="h1">Join {club.name}</h1>
      <p className="muted" style={{ margin: 0 }}>
        Coaches in {club.name} share its teams, live games, timers and scrimmage teams on their own phones.
      </p>
      {session ? (
        already ? (
          <Link href="/" className="btn primary big">You’re in. Go to the teams</Link>
        ) : (
          <form action={joinClub}>
            <input type="hidden" name="invite" value={token} />
            <button className="btn primary big block">Join {club.name}</button>
          </form>
        )
      ) : (
        <div className="stack">
          <Link href={`/signup${q}`} className="btn primary big">Create account &amp; join</Link>
          <Link href={`/login${q}`} className="btn big">I have an account</Link>
        </div>
      )}
    </main>
  )
}

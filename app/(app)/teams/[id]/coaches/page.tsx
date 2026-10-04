import Link from 'next/link'
import { addCoach, removeCoach } from '@/app/actions'
import { ActionForm } from '@/components/ActionForm'
import { ConfirmButton } from '@/components/ConfirmButton'
import { getCoachTeam, listCoaches } from '@/lib/data'

export default async function CoachesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { team: t, isOwner, session } = await getCoachTeam(id)
  const { owner, assistants } = await listCoaches(t)
  const you = (email: string) => (email === session.email ? ' (you)' : '')

  return (
    <main className="page">
      <header className="topbar">
        <Link href={`/teams/${t.id}`} className="back">← {t.name}</Link>
      </header>
      <h1 className="h1">Coaches</h1>
      <p className="note">
        Every coach here sees the same live game or practice: check-ins, lineups, subs and the clock update on all
        phones within a couple of seconds.
      </p>

      <div className="list">
        <div className="card">
          <div className="kid-head">
            <span className="kid-name">{owner}{you(owner)}</span>
            <span className="pill">Head coach</span>
          </div>
        </div>
        {assistants.map((email) => (
          <div key={email} className="card">
            <div className="kid-head">
              <span className="kid-name" style={{ overflowWrap: 'anywhere' }}>{email}{you(email)}</span>
              {isOwner ? (
                <form action={removeCoach}>
                  <input type="hidden" name="teamId" value={t.id} />
                  <input type="hidden" name="email" value={email} />
                  <ConfirmButton className="btn small danger" confirmLabel="Tap to remove">Remove</ConfirmButton>
                </form>
              ) : (
                <span className="pill practice">Assistant</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {isOwner && (
        <section className="card">
          <ActionForm action={addCoach} submitLabel="Add assistant coach">
            <input type="hidden" name="teamId" value={t.id} />
            <label className="lbl" htmlFor="email">Assistant’s sign-in email</label>
            <input id="email" name="email" type="email" autoComplete="off" autoCapitalize="none" placeholder="assistant@example.com" />
            <p className="note">They sign in with their own login and see this team on their phone.</p>
          </ActionForm>
        </section>
      )}
    </main>
  )
}

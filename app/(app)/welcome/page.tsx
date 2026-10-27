import { createClub } from '@/app/actions'
import { ActionForm } from '@/components/ActionForm'
import { requireSession } from '@/lib/auth'
import { myClubs } from '@/lib/clubs'

export default async function WelcomePage() {
  const session = await requireSession()
  const clubs = await myClubs(session.userId)
  return (
    <main className="page" style={{ paddingTop: '8vh' }}>
      <h1 className="h1">{clubs.length ? 'New club' : 'Welcome'}</h1>
      <p className="muted" style={{ margin: 0 }}>
        Set up your club or league. Its coaches share teams, live games, timers and scrimmage teams. You’ll get an
        invite link to send your assistants.
      </p>
      <section className="card">
        <ActionForm action={createClub} submitLabel="Create club">
          <label className="lbl" htmlFor="name">Club or league name</label>
          <input id="name" name="name" type="text" autoCapitalize="words" autoComplete="organization" placeholder="Riverside Youth Soccer" required />
        </ActionForm>
      </section>
      <p className="note">Got an invite link from your club? Open it on this phone to join instead.</p>
    </main>
  )
}

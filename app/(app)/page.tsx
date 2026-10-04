import Link from 'next/link'
import { logout } from '../actions'
import { StartButtons } from '@/components/StartButtons'
import { getSession } from '@/lib/auth'
import { listTeams, liveByTeam, teamRules, teamSettings } from '@/lib/data'
import { formatLabel } from '@/lib/formats'
import { liveSummary } from '@/lib/summary'

export default async function Home() {
  const session = await getSession()
  const teams = await listTeams()
  const live = await liveByTeam(teams.map((t) => t.id))
  const now = Date.now()

  return (
    <main className="page">
      <header className="topbar">
        <h1 className="h1">Your teams</h1>
        <span className="spacer" />
        <form action={logout}>
          <button className="btn small" title={session?.email}>Sign out</button>
        </form>
      </header>

      {teams.length === 0 && (
        <section className="card">
          <p style={{ margin: 0, fontSize: '1.1rem' }}>
            Add your team once: pick the age group and the rest is filled in. It takes about 30 seconds.
          </p>
          <Link href="/teams/new" className="btn primary big">Add your team</Link>
          <p className="note">Assistant coach? Ask your head coach to add your email to their team.</p>
        </section>
      )}

      {teams.map((t) => {
        const row = live.get(t.id)
        const what = row?.kind === 'practice' ? 'practice' : 'game'
        return (
          <section key={t.id} className="card">
            <Link href={`/teams/${t.id}`} style={{ textDecoration: 'none' }}>
              <div className="event-day">{t.name}</div>
              <div className="muted">
                <span className="badge">{t.age}</span>
                <span className="badge">{formatLabel(teamSettings(t))}</span>
                {row ? ` ${what === 'game' ? 'Game' : 'Practice'} in progress · ${liveSummary(row.state, teamRules(t), now)}` : ''}
              </div>
            </Link>
            {row ? (
              <Link href={`/teams/${t.id}/field`} className="btn primary big">Resume {what}</Link>
            ) : (
              <StartButtons teamId={t.id} />
            )}
          </section>
        )
      })}

      {teams.length > 0 && (
        <Link href="/teams/new" className="link-row">
          <span>+ Add another team</span>
        </Link>
      )}
    </main>
  )
}

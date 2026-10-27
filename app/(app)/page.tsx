import Link from 'next/link'
import { redirect } from 'next/navigation'
import { switchClub } from '../actions'
import { StartButtons } from '@/components/StartButtons'
import { requireSession } from '@/lib/auth'
import { currentClub } from '@/lib/clubs'
import { listTeams, liveByTeam, teamRules, teamSettings } from '@/lib/data'
import { formatLabel } from '@/lib/formats'
import { liveSummary } from '@/lib/summary'

export default async function Home() {
  const session = await requireSession()
  const { club, all } = await currentClub(session)
  if (!club) redirect('/welcome')
  const teams = await listTeams(club.id)
  const live = await liveByTeam(teams.map((t) => t.id))
  const now = Date.now()

  return (
    <main className="page">
      <header className="topbar">
        <h1 className="h1" style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{club.name}</h1>
        <Link href="/club" className="btn small">Club</Link>
        <Link href="/account" className="btn small">Account</Link>
      </header>

      {all.length > 1 && (
        <div className="tag-chips" role="group" aria-label="Your clubs">
          {all.map((c) => (
            <form key={c.id} action={switchClub}>
              <input type="hidden" name="clubId" value={c.id} />
              <button className="tag-chip" aria-pressed={c.id === club.id}>{c.name}</button>
            </form>
          ))}
        </div>
      )}

      {teams.length === 0 && (
        <section className="card">
          <p style={{ margin: 0, fontSize: '1.1rem' }}>
            Add your team once: pick the age group and the rest is filled in. It takes about 30 seconds.
          </p>
          <Link href="/teams/new" className="btn primary big">Add your team</Link>
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
      <p className="note">
        Everyone in {club.name} sees these teams, live games, timers and scrimmage teams.{' '}
        <Link href="/club">Invite your coaches</Link>.
      </p>
    </main>
  )
}

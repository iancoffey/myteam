import Link from 'next/link'
import { logout } from '../actions'
import { getSession } from '@/lib/auth'
import { listTeams, nextEventsByTeam } from '@/lib/data'
import { formatLabel } from '@/lib/formats'
import { formatDay, formatTime } from '@/lib/time'
import type { FormatKey } from '@/lib/formats'

export default async function Home() {
  const session = await getSession()
  const teams = await listTeams()
  const next = await nextEventsByTeam(teams.map((t) => t.id))

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
        </section>
      )}

      {teams.map((t) => {
        const ev = next.get(t.id)
        return (
          <section key={t.id} className="card">
            <Link href={`/teams/${t.id}`} style={{ textDecoration: 'none' }}>
              <div className="event-day">{t.name}</div>
              <div className="muted">
                <span className="badge">{t.age}</span>
                <span className="badge">{formatLabel({ format: t.format as FormatKey, onField: t.onField })}</span>
                {ev
                  ? ` Next: ${ev.kind === 'game' ? 'game' : 'practice'} ${formatDay(ev.startsAt, t.timeZone)}, ${formatTime(ev.startsAt, t.timeZone)}`
                  : ' Nothing scheduled'}
              </div>
            </Link>
            <div className="btn-grid">
              <Link href={`/teams/${t.id}/field`} className="btn primary">Game day</Link>
              <Link href={`/teams/${t.id}`} className="btn">Team</Link>
            </div>
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

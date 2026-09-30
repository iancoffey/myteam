import Link from 'next/link'
import { MessageButtons } from '@/components/MessageButtons'
import { getOwnedTeam, listGuardians, listPlayers, listUpcomingEvents, seasonMinutes } from '@/lib/data'
import { formatLabel, settingsLine, type FormatKey } from '@/lib/formats'
import { eventMessage } from '@/lib/messages'
import { formatDay, formatTime } from '@/lib/time'

export default async function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const t = await getOwnedTeam(id)
  const [kids, parents, upcoming, season] = await Promise.all([
    listPlayers(t.id),
    listGuardians(t.id),
    listUpcomingEvents(t.id),
    seasonMinutes(t.id),
  ])
  const settings = { format: t.format as FormatKey, onField: t.onField, keeper: t.keeper, periods: t.periods, periodMin: t.periodMin, subMin: t.subMin }
  const next = upcoming[0]
  const phones = [...new Set(parents.map((p) => p.phone).filter((p): p is string => !!p))]
  const emails = [...new Set(parents.map((p) => p.email).filter((e): e is string => !!e))]
  const kidName = new Map(kids.map((k) => [k.id, k.firstName]))
  const maxMs = Math.max(1, ...kids.map((k) => season.ms[k.id] ?? 0))

  return (
    <main className="page">
      <header className="topbar">
        <Link href="/" className="back">← Teams</Link>
        <span className="spacer" />
        <Link href={`/teams/${t.id}/edit`} className="btn small">Settings</Link>
      </header>

      <div>
        <h1 className="h1">{t.name}</h1>
        <p className="muted" style={{ margin: '6px 0 0' }}>
          <span className="badge">{t.age}</span>
          <span className="badge">{formatLabel(settings)}</span> {settingsLine(settings)}
        </p>
      </div>

      <Link href={`/teams/${t.id}/field`} className="btn primary big">Game day</Link>

      {next ? (
        <section className="card event">
          <div className="event-when">
            <span className="event-day">
              {formatDay(next.startsAt, t.timeZone)} · {formatTime(next.startsAt, t.timeZone)}
            </span>
            <span className={`pill ${next.kind}`}>{next.kind}</span>
          </div>
          <div>
            {next.kind === 'game' && next.opponent ? `vs ${next.opponent}` : next.kind === 'game' ? 'Game' : 'Practice'}
            {next.location ? ` · ${next.location}` : ''}
          </div>
          {next.kind === 'game' && (
            <div className="muted">
              Snacks: {next.snackPlayerId && kidName.get(next.snackPlayerId) ? `${kidName.get(next.snackPlayerId)}’s family` : 'nobody yet'}
            </div>
          )}
          <MessageButtons
            phones={phones}
            emails={emails}
            subject={`${t.name}: ${next.kind} ${formatDay(next.startsAt, t.timeZone)}`}
            body={eventMessage(t, next, next.snackPlayerId ? kidName.get(next.snackPlayerId) : undefined)}
          />
        </section>
      ) : (
        <section className="card">
          <p style={{ margin: 0 }}>Nothing scheduled yet.</p>
        </section>
      )}

      <div className="stack">
        <Link href={`/teams/${t.id}/schedule`} className="link-row">
          <span>Schedule &amp; snacks<span className="sub">{upcoming.length} upcoming</span></span>
          <span>→</span>
        </Link>
        <Link href={`/teams/${t.id}/roster`} className="link-row">
          <span>Roster &amp; parents<span className="sub">{kids.length} {kids.length === 1 ? 'kid' : 'kids'} · {parents.length} {parents.length === 1 ? 'parent' : 'parents'}</span></span>
          <span>→</span>
        </Link>
      </div>

      <h2 className="h2">Season minutes · {season.games} {season.games === 1 ? 'game' : 'games'}</h2>
      {season.games === 0 ? (
        <p className="note">Minutes show up here after you save your first game from Game day.</p>
      ) : (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table className="minutes-table">
            <tbody>
              {[...kids]
                .sort((a, b) => (season.ms[b.id] ?? 0) - (season.ms[a.id] ?? 0))
                .map((k) => {
                  const ms = season.ms[k.id] ?? 0
                  return (
                    <tr key={k.id}>
                      <td>{k.firstName}</td>
                      <td className="bar-cell">
                        <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.round((ms / maxMs) * 100)}%` }} /></div>
                      </td>
                      <td>{Math.floor(ms / 60000)}′</td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="h2">Message all parents</h2>
      <MessageButtons phones={phones} emails={emails} subject={t.name} body={`Hi ${t.name} parents, `} />
    </main>
  )
}

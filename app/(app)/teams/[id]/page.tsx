import Link from 'next/link'
import { SessionCard } from '@/components/SessionCard'
import { StartButtons } from '@/components/StartButtons'
import { getCoachTeam, getLive, listCoaches, listGames, listPlayers, seasonMinutes, teamRules, teamSettings } from '@/lib/data'
import { cleanGroups, formatLabel, settingsLine } from '@/lib/formats'
import { kickedOff } from '@/lib/live'
import { liveSummary } from '@/lib/summary'
import { formatDay } from '@/lib/time'

export default async function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { team: t } = await getCoachTeam(id)
  const [kids, season, recent, row, coaches] = await Promise.all([
    listPlayers(t.id),
    seasonMinutes(t.id),
    listGames(t.id, 5),
    getLive(t.id),
    listCoaches(t),
  ])
  const settings = teamSettings(t)
  const groups = cleanGroups(t.groups)
  const maxMs = Math.max(1, ...kids.map((k) => season.ms[k.id] ?? 0))
  const now = Date.now()

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
        {groups.length > 0 && (
          <p className="muted" style={{ margin: '4px 0 0' }}>Groups: {groups.map((g) => g.name).join(', ')}</p>
        )}
      </div>

      {row ? (
        <SessionCard
          teamId={t.id}
          sessionId={row.id}
          kind={row.kind === 'practice' ? 'practice' : 'game'}
          summary={liveSummary(row.state, teamRules(t), now)}
          canSave={kickedOff(row.state)}
        />
      ) : (
        <StartButtons teamId={t.id} />
      )}

      <div className="stack">
        <Link href={`/teams/${t.id}/roster`} className="link-row">
          <span>Roster<span className="sub">{kids.length} {kids.length === 1 ? 'kid' : 'kids'}</span></span>
          <span>→</span>
        </Link>
        <Link href={`/teams/${t.id}/coaches`} className="link-row">
          <span>
            Coaches
            <span className="sub">
              {1 + coaches.assistants.length} {coaches.assistants.length ? 'coaches' : 'coach'} · lineups and subs sync live
            </span>
          </span>
          <span>→</span>
        </Link>
      </div>

      <h2 className="h2">Season minutes · {season.games} {season.games === 1 ? 'game' : 'games'}</h2>
      {season.games === 0 ? (
        <p className="note">Minutes show up here after your first saved game.</p>
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

      {recent.length > 0 && (
        <>
          <h2 className="h2">Recent games</h2>
          <div className="stack">
            {recent.map((gm) => (
              <Link key={gm.id} href={`/teams/${t.id}/games/${gm.id}`} className="link-row">
                <span>
                  Us {gm.us} – {gm.them} Them
                  <span className="sub">{formatDay(gm.playedAt, t.timeZone)} · subs by period</span>
                </span>
                <span>→</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </main>
  )
}

import Link from 'next/link'
import { deleteGame } from '@/app/actions'
import { ConfirmButton } from '@/components/ConfirmButton'
import { GameLog } from '@/components/GameLog'
import { getGame, getOwnedTeam, listPlayers } from '@/lib/data'
import { formatDay, formatTime } from '@/lib/time'

export default async function GamePage({ params }: { params: Promise<{ id: string; gameId: string }> }) {
  const { id, gameId } = await params
  const t = await getOwnedTeam(id)
  const [{ game, opponent }, kids] = await Promise.all([getGame(t.id, gameId), listPlayers(t.id)])
  const names = Object.fromEntries(kids.map((k) => [k.id, k.firstName]))
  const periods = game.periods ?? t.periods
  const periodMs = (game.periodMin ?? t.periodMin) * 60000
  const played = Object.entries(game.minutes).sort((a, b) => b[1] - a[1])
  const maxMs = Math.max(1, ...played.map(([, ms]) => ms))

  return (
    <main className="page">
      <header className="topbar">
        <Link href={`/teams/${t.id}`} className="back">← {t.name}</Link>
      </header>
      <div>
        <h1 className="h1">
          Us {game.us} – {game.them} {opponent ?? 'Them'}
        </h1>
        <p className="muted" style={{ margin: '6px 0 0' }}>
          {formatDay(game.playedAt, t.timeZone)} · saved {formatTime(game.playedAt, t.timeZone)}
        </p>
      </div>

      <h2 className="h2">Subs by period</h2>
      <GameLog log={game.log} periods={periods} periodMs={periodMs} names={names} opponent={opponent} />

      <h2 className="h2">Minutes this game</h2>
      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="minutes-table">
          <tbody>
            {played.map(([kid, ms]) => (
              <tr key={kid}>
                <td>{names[kid] ?? 'Removed player'}</td>
                <td className="bar-cell">
                  <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.round((ms / maxMs) * 100)}%` }} /></div>
                </td>
                <td>{Math.floor(ms / 60000)}′</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form action={deleteGame} style={{ marginTop: 16 }}>
        <input type="hidden" name="teamId" value={t.id} />
        <input type="hidden" name="gameId" value={game.id} />
        <ConfirmButton className="btn danger block" confirmLabel="Tap again to delete this game">
          Delete game
        </ConfirmButton>
        <p className="note" style={{ marginTop: 8 }}>Removes its minutes from the season totals.</p>
      </form>
    </main>
  )
}

import { byPeriod, logText, logTime, type GameLogEntry } from '@/lib/gamelog'
import { periodName } from '@/lib/formats'

// Swaps and goals grouped by period. Used in field mode and on a saved game's page.
export function GameLog({
  log,
  periods,
  periodMs,
  names,
  opponent,
}: {
  log: GameLogEntry[]
  periods: number
  periodMs: number
  names: Record<string, string>
  opponent?: string | null
}) {
  if (!log.length) {
    return <p className="note">Swaps, goals and late arrivals are listed here, by period, once the game starts.</p>
  }
  return (
    <div className="stack">
      <p className="note">Times are counted from the start of each period.</p>
      {[...byPeriod(log)].map(([p, entries]) => {
        const swaps = entries.filter((e) => e.k === 'sub').length
        return (
          <section key={p} className="stack" style={{ gap: 4 }}>
            <h3 className="h2">
              {periodName(periods, p)} · {swaps} {swaps === 1 ? 'swap' : 'swaps'}
            </h3>
            <ol className="log-list">
              {entries.map((e, i) => (
                <li key={i} className={e.k === 'goal' ? 'goal' : undefined}>
                  <span className="log-t">{logTime(e.t, periodMs)}</span>
                  <span>{logText(e, names, opponent)}</span>
                </li>
              ))}
            </ol>
          </section>
        )
      })}
    </div>
  )
}

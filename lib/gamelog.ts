// What happened during a game, by period: swaps, goals, late arrivals, keeper changes.
// t is milliseconds into period p. Swaps made at a break are logged at t=0 of the next period.
export type GameLogEntry =
  | { p: number; t: number; k: 'sub'; in: string; out: string }
  | { p: number; t: number; k: 'goal'; side: 'us' | 'them' }
  | { p: number; t: number; k: 'arrive'; id: string }
  | { p: number; t: number; k: 'keeper'; id: string }

const MAX_ENTRIES = 500

// Server-side validation of a log sent from the phone.
export function cleanLog(input: unknown, kidIds: Set<string>, periods: number, periodMs: number): GameLogEntry[] {
  if (!Array.isArray(input)) return []
  const out: GameLogEntry[] = []
  for (const e of input.slice(0, MAX_ENTRIES)) {
    if (!e || typeof e !== 'object') continue
    const p = Number(e.p)
    const t = Number(e.t)
    if (!Number.isInteger(p) || p < 1 || p > periods || !Number.isFinite(t) || t < 0 || t > periodMs) continue
    const base = { p, t: Math.round(t) }
    if (e.k === 'sub' && kidIds.has(e.in) && kidIds.has(e.out)) out.push({ ...base, k: 'sub', in: e.in, out: e.out })
    else if (e.k === 'goal' && (e.side === 'us' || e.side === 'them')) out.push({ ...base, k: 'goal', side: e.side })
    else if ((e.k === 'arrive' || e.k === 'keeper') && kidIds.has(e.id)) out.push({ ...base, k: e.k, id: e.id })
  }
  return out
}

export function logTime(t: number, periodMs: number) {
  if (t <= 0) return 'Start'
  if (t >= periodMs) return 'End'
  const s = Math.floor(t / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function logText(e: GameLogEntry, names: Record<string, string>, opponent?: string | null) {
  const n = (id: string) => names[id] ?? 'Someone'
  switch (e.k) {
    case 'sub':
      return `${n(e.in)} in · ${n(e.out)} out`
    case 'goal':
      return e.side === 'us' ? 'Goal for us' : `Goal for ${opponent ?? 'them'}`
    case 'arrive':
      return `${n(e.id)} arrived`
    case 'keeper':
      return `${n(e.id)} in goal`
  }
}

export function byPeriod(log: GameLogEntry[]) {
  const m = new Map<number, GameLogEntry[]>()
  for (const e of [...log].sort((a, b) => a.p - b.p || a.t - b.t)) {
    if (!m.has(e.p)) m.set(e.p, [])
    m.get(e.p)!.push(e)
  }
  return m
}

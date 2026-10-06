// The shared game/practice engine. Every coach's phone runs it for instant feedback, and the server
// runs it to decide the official order of changes. All times are server-clock milliseconds, so the
// clock reads the same on every phone. The state only stores "elapsed as of `at`"; the time since
// then is added when it's read (see advance), so nothing has to be written while the clock runs.
import { isKeeperGroup, pairsPerSwap, type PositionGroup, type TeamSettings } from './formats'
import type { GameLogEntry } from './gamelog'

export const MIN = 60_000
// A swap made up to a minute before a swap mark counts as that mark's swap.
export const EARLY_SWAP_MS = MIN
export const DRILL_PRESETS_MIN = [5, 10, 15, 20]
export const MAX_TEAMS = 3
const MAX_LOG = 500

export type Kind = 'game' | 'practice'
export type KidState = { here: boolean; on: boolean; gk: boolean; ms: number }
export type Clock = { period: number; elapsed: number; running: boolean; at: number }
export type Drill = { length: number; elapsed: number; running: boolean; at: number }
export type LiveState = {
  v: 2
  kind: Kind
  phase: 'checkin' | 'live'
  kids: Record<string, KidState>
  clock: Clock
  // The current period has ended (a break, or full time when final).
  over: boolean
  final: boolean
  // How many of this period's swap marks have been handled (swapped or skipped).
  marksDone: number
  us: number
  them: number
  log: GameLogEntry[]
  drill: Drill
  // Practice scrimmage: kid ids per side. Late arrivals join the smaller side; kids who leave drop off.
  teams?: string[][] | null
}

export type Action =
  | { t: 'here'; id: string; here: boolean; undo?: boolean }
  | { t: 'allHere'; here: boolean }
  | { t: 'lineup'; on: string[]; gk: string | null }
  | { t: 'toCheckin' }
  | { t: 'swap'; pairs: [string, string][]; undoMarks?: number }
  | { t: 'keeper'; id: string | null; undo?: boolean }
  | { t: 'goal'; side: 'us' | 'them'; d: 1 | -1 }
  | { t: 'start' }
  | { t: 'pause' }
  | { t: 'endPeriod' }
  | { t: 'adjust'; ms: number }
  | { t: 'skipMark' }
  | { t: 'restore'; clock: Clock; over: boolean; final: boolean; marksDone: number; ms: Record<string, number> }
  | { t: 'drillSet'; ms: number }
  | { t: 'drillStart' }
  | { t: 'drillPause' }
  | { t: 'drillReset' }
  | { t: 'teams'; teams: string[][] }
  | { t: 'moveKid'; id: string; to: number }
  | { t: 'clearTeams' }

// An action plus when the coach did it (their estimate of server time), so changes made with no
// signal replay at the right moment once they reach the server.
export type Timed = { a: Action; at: number }

export type Rules = Pick<TeamSettings, 'periods' | 'periodMin' | 'subMin' | 'keeper' | 'onField'>
// A live session as the server sends it to phones.
export type ClientSession = { id: string; kind: Kind; rev: number; state: LiveState }
export type Kid = { id: string; name: string; groups: string[] }

export function newState(kind: Kind, kidIds: string[], now: number): LiveState {
  return {
    v: 2,
    kind,
    phase: 'checkin',
    kids: Object.fromEntries(kidIds.map((id) => [id, { here: false, on: false, gk: false, ms: 0 }])),
    clock: { period: 1, elapsed: 0, running: false, at: now },
    over: false,
    final: false,
    marksDone: 0,
    us: 0,
    them: 0,
    log: [],
    drill: { length: 10 * MIN, elapsed: 0, running: false, at: now },
    teams: null,
  }
}

// Swap times within each period, e.g. 12-min quarters swapping every 6 min -> [6:00].
// Marks less than 2 minutes before the end are skipped; the break is a swap point anyway.
export function subMarks(r: Pick<Rules, 'periodMin' | 'subMin'>) {
  const out: number[] = []
  if (!r.subMin) return out
  for (let m = r.subMin; r.periodMin - m >= 2; m += r.subMin) out.push(m * MIN)
  return out
}

export function kickedOff(st: LiveState) {
  return st.clock.period > 1 || st.clock.elapsed > 0 || st.clock.running || st.over
}

function kid(st: LiveState, id: string) {
  return (st.kids[id] ??= { here: false, on: false, gk: false, ms: 0 })
}

// Bring the clock, every on-field kid's minutes and the drill timer up to `now`.
export function advance(st: LiveState, now: number, r: Rules) {
  const c = st.clock
  const pm = r.periodMin * MIN
  if (c.running && !st.over) {
    const dt = Math.max(0, Math.min(now - c.at, pm - c.elapsed))
    c.elapsed += dt
    for (const k of Object.values(st.kids)) if (k.here && k.on) k.ms += dt
    if (c.elapsed >= pm) {
      c.running = false
      st.over = true
      if (c.period >= r.periods) st.final = true
    }
  }
  c.at = Math.max(c.at, now)
  const d = st.drill
  if (d.running) {
    d.elapsed = Math.min(d.length, d.elapsed + Math.max(0, now - d.at))
    if (d.elapsed >= d.length) d.running = false
  }
  d.at = Math.max(d.at, now)
}

// A read-only copy brought up to `now`, for showing on screen.
export function project(st: LiveState, now: number, r: Rules): LiveState {
  const copy = structuredClone(st)
  advance(copy, now, r)
  return copy
}

// Swaps at a break count as the start of the next period in the log.
function stamp(st: LiveState) {
  return st.over && !st.final ? { p: st.clock.period + 1, t: 0 } : { p: st.clock.period, t: Math.round(st.clock.elapsed) }
}

function log(st: LiveState, e: GameLogEntry) {
  if (st.log.length < MAX_LOG) st.log.push(e)
}

function unlog(st: LiveState, match: (e: GameLogEntry) => boolean) {
  for (let i = st.log.length - 1; i >= 0; i--) {
    if (match(st.log[i])) {
      st.log.splice(i, 1)
      return
    }
  }
}

function removeFromTeams(st: LiveState, id: string) {
  for (const t of st.teams ?? []) {
    const i = t.indexOf(id)
    if (i >= 0) t.splice(i, 1)
  }
}

// Keeps scrimmage sides in step with check-in: arrivals join the smaller side, leavers drop off.
function syncTeams(st: LiveState, id: string) {
  const teams = st.teams
  if (!teams?.length) return
  if (!st.kids[id]?.here) return removeFromTeams(st, id)
  if (teams.some((t) => t.includes(id))) return
  let small = 0
  teams.forEach((t, i) => {
    if (t.length < teams[small].length) small = i
  })
  teams[small].push(id)
}

function nextPeriod(st: LiveState) {
  st.clock.period += 1
  st.clock.elapsed = 0
  st.marksDone = 0
  st.over = false
}

// Applies one action at time `now`, in place. Actions that no longer make sense (a kid who is no
// longer on the bench, a clock that already ended) are ignored rather than failing.
export function apply(st: LiveState, a: Action, now: number, r: Rules, roster: Set<string>) {
  advance(st, now, r)
  const pm = r.periodMin * MIN
  const live = st.phase === 'live'
  switch (a.t) {
    case 'here': {
      if (!roster.has(a.id)) return
      const k = kid(st, a.id)
      if (a.here === k.here) return
      k.here = a.here
      if (!a.here) {
        k.on = false
        k.gk = false
      }
      if (a.undo) unlog(st, (e) => e.k === 'arrive' && e.id === a.id)
      else if (a.here && live && kickedOff(st)) log(st, { ...stamp(st), k: 'arrive', id: a.id })
      syncTeams(st, a.id)
      return
    }
    case 'allHere': {
      for (const id of roster) {
        const k = kid(st, id)
        k.here = a.here
        if (!a.here) {
          k.on = false
          k.gk = false
        }
      }
      if (!a.here) st.teams = null
      else for (const id of roster) syncTeams(st, id)
      return
    }
    case 'lineup': {
      if (st.kind !== 'game') return
      for (const k of Object.values(st.kids)) Object.assign(k, { on: false, gk: false, ms: 0 })
      const on = a.on.filter((id) => roster.has(id) && kid(st, id).here).slice(0, 11)
      for (const id of on) st.kids[id].on = true
      if (r.keeper && a.gk && on.includes(a.gk)) st.kids[a.gk].gk = true
      st.phase = 'live'
      return
    }
    case 'toCheckin': {
      if (kickedOff(st)) return
      st.phase = 'checkin'
      st.clock.running = false
      return
    }
    case 'swap': {
      if (!live) return
      const off = kickedOff(st)
      for (const [inId, outId] of a.pairs) {
        if (!roster.has(inId) || !roster.has(outId) || inId === outId) continue
        const i = kid(st, inId)
        const o = kid(st, outId)
        if (!i.here || i.on || !o.on) continue
        i.on = true
        o.on = false
        if (o.gk) {
          o.gk = false
          i.gk = true
        }
        if (a.undoMarks !== undefined) unlog(st, (e) => e.k === 'sub' && e.in === outId && e.out === inId)
        else if (off) log(st, { ...stamp(st), k: 'sub', in: inId, out: outId })
      }
      if (a.undoMarks !== undefined) st.marksDone = Math.max(0, a.undoMarks)
      else if (off && !st.over) {
        const handled = subMarks(r).filter((m) => m <= st.clock.elapsed + EARLY_SWAP_MS).length
        st.marksDone = Math.max(st.marksDone, handled)
      }
      return
    }
    case 'keeper': {
      if (!live || !r.keeper) return
      if (a.id !== null && (!roster.has(a.id) || !kid(st, a.id).on)) return
      for (const k of Object.values(st.kids)) k.gk = false
      if (a.id) st.kids[a.id].gk = true
      if (a.undo) unlog(st, (e) => e.k === 'keeper')
      else if (a.id && kickedOff(st)) log(st, { ...stamp(st), k: 'keeper', id: a.id })
      return
    }
    case 'goal': {
      if (!live) return
      if (a.d === 1) {
        st[a.side] += 1
        if (kickedOff(st)) log(st, { ...stamp(st), k: 'goal', side: a.side })
      } else if (st[a.side] > 0) {
        st[a.side] -= 1
        unlog(st, (e) => e.k === 'goal' && e.side === a.side)
      }
      return
    }
    case 'start': {
      if (!live || st.final) return
      if (st.over) nextPeriod(st)
      st.clock.running = true
      st.clock.at = now
      return
    }
    case 'pause': {
      st.clock.running = false
      return
    }
    case 'endPeriod': {
      if (!live || st.final) return
      if (st.over) nextPeriod(st)
      if (st.clock.elapsed === 0 && !st.clock.running) {
        // The clock wasn't used this period (the ref kept time): count it as full for kids on the field.
        for (const k of Object.values(st.kids)) if (k.here && k.on) k.ms += pm
        st.clock.elapsed = pm
      }
      st.clock.running = false
      st.over = true
      if (st.clock.period >= r.periods) st.final = true
      return
    }
    case 'adjust': {
      if (!live || st.over || st.final) return
      const d = Math.max(-st.clock.elapsed, Math.min(a.ms, pm - st.clock.elapsed))
      if (!d) return
      st.clock.elapsed += d
      for (const k of Object.values(st.kids)) if (k.here && k.on) k.ms = Math.max(0, k.ms + d)
      return
    }
    case 'skipMark': {
      st.marksDone = Math.max(st.marksDone, subMarks(r).filter((m) => m <= st.clock.elapsed).length)
      return
    }
    case 'restore': {
      st.clock = {
        period: Math.min(r.periods, Math.max(1, a.clock.period)),
        elapsed: Math.min(pm, Math.max(0, a.clock.elapsed)),
        running: a.clock.running,
        at: Math.min(now, a.clock.at),
      }
      st.over = a.over
      st.final = a.final
      st.marksDone = a.marksDone
      for (const [id, ms] of Object.entries(a.ms)) if (st.kids[id]) st.kids[id].ms = ms
      // If the clock was running, the time since the mistaken tap still counts.
      advance(st, now, r)
      return
    }
    case 'drillSet': {
      st.drill = { length: Math.min(60 * MIN, Math.max(MIN, Math.round(a.ms))), elapsed: 0, running: false, at: now }
      return
    }
    case 'drillStart': {
      if (st.drill.elapsed >= st.drill.length) st.drill.elapsed = 0
      st.drill.running = true
      st.drill.at = now
      return
    }
    case 'drillPause': {
      st.drill.running = false
      return
    }
    case 'drillReset': {
      st.drill.elapsed = 0
      st.drill.running = false
      return
    }
    case 'teams': {
      if (st.kind !== 'practice') return
      const seen = new Set<string>()
      const teams = a.teams.slice(0, MAX_TEAMS).map((t) =>
        t.filter((id) => {
          if (seen.has(id) || !roster.has(id) || !kid(st, id).here) return false
          seen.add(id)
          return true
        }),
      )
      st.teams = teams.length >= 2 ? teams : null
      for (const id of roster) syncTeams(st, id)
      return
    }
    case 'moveKid': {
      const to = Math.floor(a.to)
      if (!st.teams || !roster.has(a.id) || !kid(st, a.id).here || to < 0 || to >= st.teams.length) return
      removeFromTeams(st, a.id)
      st.teams[to].push(a.id)
      return
    }
    case 'clearTeams': {
      st.teams = null
      return
    }
  }
}

// Applies a batch in order, each at the time the coach acted (never before the last applied action and
// never in the future). The result is left as of the last action, not as of `now`: the time since is
// added when it's read, and a tap that was waiting behind this batch still lands at its own time.
export function applyAll(st: LiveState, actions: Timed[], now: number, r: Rules, roster: Set<string>): LiveState {
  const s = structuredClone(st)
  for (const { a, at } of actions) {
    const t = Math.min(now, Math.max(s.clock.at, Number.isFinite(at) ? at : now))
    apply(s, a, t, r, roster)
  }
  return s
}

// What undoes an action, worked out from the state just before it. Applied like any other action,
// so it works no matter what other coaches did in the meantime.
export function inverseOf(before: LiveState, a: Action): Action[] {
  switch (a.t) {
    case 'swap':
      return [{ t: 'swap', pairs: a.pairs.map(([i, o]) => [o, i] as [string, string]), undoMarks: before.marksDone }]
    case 'here':
      return [{ t: 'here', id: a.id, here: !a.here, undo: true }]
    case 'keeper': {
      const prev = Object.entries(before.kids).find(([, k]) => k.gk)?.[0] ?? null
      return [{ t: 'keeper', id: prev, undo: true }]
    }
    case 'goal':
      return [{ t: 'goal', side: a.side, d: a.d === 1 ? -1 : 1 }]
    case 'endPeriod':
      return [
        {
          t: 'restore',
          clock: { ...before.clock },
          over: before.over,
          final: before.final,
          marksDone: before.marksDone,
          ms: Object.fromEntries(Object.entries(before.kids).map(([id, k]) => [id, k.ms])),
        },
      ]
    default:
      return []
  }
}

// ---------- lineups and suggested swaps (worked out on a phone, then sent as plain actions) ----------

export function keeperGroupIds(groups: PositionGroup[]) {
  return new Set(groups.filter((g) => isKeeperGroup(g.name)).map((g) => g.id))
}

function shuffle<T>(a: T[], rand: () => number) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Fewest season minutes start (ties broken randomly); spots are filled round-robin across position
// groups so each group is covered; a Goalie/Keeper group supplies the keeper.
export function buildLineup(
  st: LiveState,
  kids: Kid[],
  r: Rules,
  groups: PositionGroup[],
  seasonMs: Record<string, number>,
  rand: () => number = Math.random,
): { on: string[]; gk: string | null } {
  const keeperIds = keeperGroupIds(groups)
  const fieldGroups = groups.filter((g) => !keeperIds.has(g.id))
  const pool = shuffle(kids.filter((k) => st.kids[k.id]?.here), rand).sort(
    (a, b) => (seasonMs[a.id] ?? 0) - (seasonMs[b.id] ?? 0),
  )
  const starters: Kid[] = []
  const take = (k: Kid) => {
    starters.push(k)
    pool.splice(pool.indexOf(k), 1)
  }
  let keeper: Kid | undefined
  if (r.keeper) {
    keeper = pool.find((k) => k.groups.some((id) => keeperIds.has(id)))
    if (keeper) take(keeper)
  }
  for (let progress = true; progress && starters.length < r.onField; ) {
    progress = false
    for (const grp of fieldGroups) {
      if (starters.length >= r.onField) break
      const k = pool.find((kd) => kd.groups.includes(grp.id))
      if (k) {
        take(k)
        progress = true
      }
    }
  }
  while (starters.length < r.onField && pool.length) take(pool[0])
  if (r.keeper && starters.length && !keeper) keeper = starters[Math.floor(rand() * starters.length)]
  return { on: starters.map((k) => k.id), gk: r.keeper && keeper ? keeper.id : null }
}

// Fewest minutes come in; each replaces the most-played field player from a shared position group,
// or the most-played field player overall when nobody shares one. The keeper stays in.
export function suggestSwaps(st: LiveState, kids: Kid[], r: Rules, groups: PositionGroup[]): [Kid, Kid][] {
  const keeperIds = keeperGroupIds(groups)
  const k = (id: string) => st.kids[id] ?? { here: false, on: false, gk: false, ms: 0 }
  const bench = kids.filter((x) => k(x.id).here && !k(x.id).on).sort((a, b) => k(a.id).ms - k(b.id).ms)
  const out = kids.filter((x) => k(x.id).here && k(x.id).on && !k(x.id).gk).sort((a, b) => k(b.id).ms - k(a.id).ms)
  const n = Math.min(pairsPerSwap(r.onField), bench.length, out.length)
  const used = new Set<string>()
  return bench.slice(0, n).map((inK) => {
    const free = out.filter((x) => !used.has(x.id))
    const shares = (x: Kid) => x.groups.some((id) => !keeperIds.has(id) && inK.groups.includes(id))
    const outK = free.find(shares) ?? free[0]
    used.add(outK.id)
    return [inK, outK] as [Kid, Kid]
  })
}

// Splits the kids who are here into even scrimmage sides. Kids tagged Goalie go one per side first;
// everyone else is dealt group by group (by their first position group) to whichever side is
// smallest, so sizes differ by at most one and each position group spreads across the sides.
export function splitTeams(st: LiveState, kids: Kid[], groups: PositionGroup[], count = 2, rand: () => number = Math.random): string[][] {
  const n = Math.max(2, Math.min(MAX_TEAMS, Math.floor(count)))
  const keeperIds = keeperGroupIds(groups)
  const fieldGroups = groups.filter((g) => !keeperIds.has(g.id))
  const here = shuffle(kids.filter((k) => st.kids[k.id]?.here), rand)
  const teams: string[][] = Array.from({ length: n }, () => [])
  let turn = Math.floor(rand() * n)
  const deal = (id: string) => {
    // the smallest side, taking turns among ties so no side always gets the extra kid
    let pick = turn % n
    for (let i = 0; i < n; i++) {
      const j = (turn + i) % n
      if (teams[j].length < teams[pick].length) pick = j
    }
    teams[pick].push(id)
    turn = pick + 1
  }
  const keepers = here.filter((k) => k.groups.some((id) => keeperIds.has(id))).slice(0, n)
  for (const k of keepers) deal(k.id)
  const bucket = (k: Kid) => {
    const i = fieldGroups.findIndex((g) => k.groups.includes(g.id))
    return i < 0 ? fieldGroups.length : i
  }
  for (const k of here.filter((x) => !keepers.includes(x)).sort((a, b) => bucket(a) - bucket(b))) deal(k.id)
  return teams
}

// ---------- validating actions from the network ----------

const isId = (x: unknown): x is string => typeof x === 'string' && x.length > 0 && x.length <= 64
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)

export function parseTimed(x: unknown): Timed | null {
  if (!x || typeof x !== 'object') return null
  const { a, at } = x as { a?: unknown; at?: unknown }
  const action = parseAction(a)
  return action && isNum(at) ? { a: action, at } : null
}

export function parseAction(x: unknown): Action | null {
  if (!x || typeof x !== 'object') return null
  const a = x as Record<string, unknown>
  switch (a.t) {
    case 'here':
      return isId(a.id) && typeof a.here === 'boolean' ? { t: 'here', id: a.id, here: a.here, undo: a.undo === true } : null
    case 'allHere':
      return typeof a.here === 'boolean' ? { t: 'allHere', here: a.here } : null
    case 'lineup':
      return Array.isArray(a.on) && a.on.length <= 11 && a.on.every(isId) && (a.gk === null || isId(a.gk))
        ? { t: 'lineup', on: a.on as string[], gk: a.gk as string | null }
        : null
    case 'swap': {
      if (!Array.isArray(a.pairs) || a.pairs.length > 11) return null
      const pairs = a.pairs.filter((p): p is [string, string] => Array.isArray(p) && p.length === 2 && isId(p[0]) && isId(p[1]))
      if (pairs.length !== a.pairs.length) return null
      return { t: 'swap', pairs, ...(isNum(a.undoMarks) ? { undoMarks: Math.max(0, Math.floor(a.undoMarks)) } : {}) }
    }
    case 'keeper':
      return a.id === null || isId(a.id) ? { t: 'keeper', id: a.id as string | null, undo: a.undo === true } : null
    case 'goal':
      return (a.side === 'us' || a.side === 'them') && (a.d === 1 || a.d === -1) ? { t: 'goal', side: a.side, d: a.d } : null
    case 'adjust':
      return isNum(a.ms) && Math.abs(a.ms) <= 10 * MIN ? { t: 'adjust', ms: a.ms } : null
    case 'drillSet':
      return isNum(a.ms) ? { t: 'drillSet', ms: a.ms } : null
    case 'teams':
      return Array.isArray(a.teams) &&
        a.teams.length >= 2 &&
        a.teams.length <= MAX_TEAMS &&
        a.teams.every((t) => Array.isArray(t) && t.length <= 40 && t.every(isId))
        ? { t: 'teams', teams: a.teams as string[][] }
        : null
    case 'moveKid':
      return isId(a.id) && isNum(a.to) ? { t: 'moveKid', id: a.id, to: a.to } : null
    case 'restore': {
      const c = a.clock as Record<string, unknown> | undefined
      const ms = a.ms as Record<string, unknown> | undefined
      if (!c || !isNum(c.period) || !isNum(c.elapsed) || typeof c.running !== 'boolean' || !isNum(c.at)) return null
      if (typeof a.over !== 'boolean' || typeof a.final !== 'boolean' || !isNum(a.marksDone) || !ms || typeof ms !== 'object') return null
      const cleanMs: Record<string, number> = {}
      for (const [id, v] of Object.entries(ms).slice(0, 60)) if (isId(id) && isNum(v) && v >= 0) cleanMs[id] = v
      return {
        t: 'restore',
        clock: { period: Math.max(1, Math.floor(c.period)), elapsed: Math.max(0, c.elapsed), running: c.running, at: c.at },
        over: a.over,
        final: a.final,
        marksDone: Math.max(0, Math.floor(a.marksDone)),
        ms: cleanMs,
      }
    }
    case 'toCheckin':
    case 'start':
    case 'pause':
    case 'endPeriod':
    case 'skipMark':
    case 'drillStart':
    case 'drillPause':
    case 'drillReset':
    case 'clearTeams':
      return { t: a.t }
    default:
      return null
  }
}

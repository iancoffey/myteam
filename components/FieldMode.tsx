'use client'

import Link from 'next/link'
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { saveGame } from '@/app/actions'
import { GameLog } from '@/components/GameLog'
import {
  breakName,
  endPeriodLabel,
  formatLabel,
  isKeeperGroup,
  pairsPerSwap,
  periodName,
  type PositionGroup,
  type TeamSettings,
} from '@/lib/formats'
import type { GameLogEntry } from '@/lib/gamelog'

type Kid = { id: string; name: string; groups: string[] }
type PState = { here: boolean; on: boolean; gk: boolean; ms: number }
type ClockSnap = {
  period: number
  elapsed: number
  running: boolean
  over: boolean
  final: boolean
  at: number
  ms: Record<string, number>
}
type Snap = {
  label: string
  flags: [string, boolean, boolean, boolean][]
  us: number
  them: number
  marksDone: number
  logLen: number
  clock?: ClockSnap
}
type Game = {
  v: 1
  clientId: string
  phase: 'checkin' | 'game'
  p: Record<string, PState>
  period: number
  elapsed: number
  running: boolean
  lastTick: number
  // How many of this period's swap marks have been handled (swapped or skipped).
  marksDone: number
  us: number
  them: number
  undo: Snap[]
  log: GameLogEntry[]
  over: boolean
  final: boolean
  saved: boolean
}

type Props = {
  teamId: string
  teamName: string
  age: string
  settings: TeamSettings
  groups: PositionGroup[]
  kids: Kid[]
  seasonMs: Record<string, number>
  eventId: string | null
  opponent: string | null
}

const M = 60000
// A swap made up to a minute before a swap mark counts as that mark's swap.
const EARLY_SWAP_MS = 60000

function newId() {
  try {
    return crypto.randomUUID()
  } catch {
    return `g${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
  }
}
function fresh(): Game {
  return {
    v: 1, clientId: newId(), phase: 'checkin', p: {}, period: 1, elapsed: 0, running: false, lastTick: 0,
    marksDone: 0, us: 0, them: 0, undo: [], log: [], over: false, final: false, saved: false,
  }
}
// Swap times within each period, e.g. 12-min quarters swapping every 6 min -> [6:00].
// Marks less than 2 minutes before the end are skipped; the break is a swap point anyway.
function subMarks(periodMin: number, subMin: number) {
  const out: number[] = []
  if (!subMin) return out
  for (let m = subMin; periodMin - m >= 2; m += subMin) out.push(m * M)
  return out
}
function mmss(ms: number) {
  const t = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}
function mins(ms: number) {
  return Math.floor(ms / M)
}
function shuffle<T>(a: T[]) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function FieldMode({ teamId, teamName, age, settings: S, groups, kids, seasonMs, eventId, opponent }: Props) {
  const key = `myteam.game.${teamId}`
  const gRef = useRef<Game | null>(null)
  const [, force] = useReducer((x: number) => x + 1, 0)
  const [selected, setSelected] = useState<string | null>(null)
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [discardArmed, setDiscardArmed] = useState(false)
  const [showLog, setShowLog] = useState(false)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const lastSave = useRef(0)
  const audio = useRef<AudioContext | null>(null)
  const wake = useRef<WakeLockSentinel | null>(null)

  const periodMs = S.periodMin * M
  const marks = subMarks(S.periodMin, S.subMin)
  const keeperGroupIds = new Set(groups.filter((g) => isKeeperGroup(g.name)).map((g) => g.id))
  const fieldGroups = groups.filter((g) => !keeperGroupIds.has(g.id))
  const names = Object.fromEntries(kids.map((k) => [k.id, k.name]))

  // ---------- persistence ----------
  const persist = useCallback(() => {
    try {
      localStorage.setItem(key, JSON.stringify(gRef.current))
    } catch {}
    lastSave.current = Date.now()
  }, [key])

  useEffect(() => {
    // After a server refresh only the roster may have changed; keep the game in memory.
    let g: Game | null = gRef.current
    if (!g) {
      try {
        const raw = JSON.parse(localStorage.getItem(key) ?? 'null')
        if (raw && raw.v === 1) g = raw as Game
      } catch {}
    }
    g ??= fresh()
    g.marksDone ??= 0
    g.log ??= []
    for (const k of kids) g.p[k.id] ??= { here: false, on: false, gk: false, ms: 0 }
    gRef.current = g
    force()
  }, [key, kids])

  // ---------- feedback ----------
  function toast(msg: string) {
    setToastMsg(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToastMsg(null), 2200)
  }
  function buzz(p: number | number[]) {
    try {
      navigator.vibrate?.(p)
    } catch {}
  }
  function unlockAudio() {
    if (audio.current) return
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      audio.current = new Ctx()
    } catch {}
  }
  function beep() {
    const ac = audio.current
    if (!ac) return
    try {
      for (const t of [0, 0.22]) {
        const o = ac.createOscillator()
        const gain = ac.createGain()
        const t0 = ac.currentTime + t
        o.type = 'square'
        o.frequency.value = 1760
        gain.gain.setValueAtTime(0.0001, t0)
        gain.gain.exponentialRampToValueAtTime(0.25, t0 + 0.01)
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.15)
        o.connect(gain)
        gain.connect(ac.destination)
        o.start(t0)
        o.stop(t0 + 0.16)
      }
    } catch {}
  }
  function requestWake() {
    try {
      navigator.wakeLock?.request('screen').then((l) => (wake.current = l)).catch(() => {})
    } catch {}
  }
  function releaseWake() {
    try {
      wake.current?.release()
    } catch {}
    wake.current = null
  }

  // ---------- helpers over current state ----------
  const g = gRef.current
  const ps = (id: string) => gRef.current!.p[id]
  const present = () => kids.filter((k) => ps(k.id).here)
  const kickedOff = (x: Game) => x.period > 1 || x.elapsed > 0 || x.running
  const groupNames = (k: Kid) => groups.filter((gr) => k.groups.includes(gr.id)).map((gr) => gr.name)
  const sharesFieldGroup = (a: Kid, b: Kid) => a.groups.some((id) => !keeperGroupIds.has(id) && b.groups.includes(id))

  // Fewest minutes come in; each replaces the most-played field player from a shared position group,
  // or the most-played field player overall when nobody shares one. The keeper stays in.
  function suggestion(): [Kid, Kid][] {
    const bench = kids.filter((k) => ps(k.id).here && !ps(k.id).on).sort((a, b) => ps(a.id).ms - ps(b.id).ms)
    const out = kids.filter((k) => ps(k.id).here && ps(k.id).on && !ps(k.id).gk).sort((a, b) => ps(b.id).ms - ps(a.id).ms)
    const n = Math.min(pairsPerSwap(S.onField), bench.length, out.length)
    const used = new Set<string>()
    return bench.slice(0, n).map((inK) => {
      const free = out.filter((k) => !used.has(k.id))
      const outK = free.find((k) => sharesFieldGroup(inK, k)) ?? free[0]
      used.add(outK.id)
      return [inK, outK] as [Kid, Kid]
    })
  }

  // ---------- clock ----------
  const tick = useCallback(() => {
    const x = gRef.current
    if (!x || !x.running) return
    const now = Date.now()
    let dt = now - x.lastTick
    x.lastTick = now
    if (dt <= 0) return
    const pm = S.periodMin * M
    dt = Math.max(0, Math.min(dt, pm - x.elapsed))
    const before = x.elapsed
    x.elapsed += dt
    for (const k of kids) if (x.p[k.id]?.here && x.p[k.id].on) x.p[k.id].ms += dt
    const hasBench = kids.some((k) => x.p[k.id]?.here && !x.p[k.id].on)
    if (hasBench && subMarks(S.periodMin, S.subMin).some((m) => before < m && x.elapsed >= m)) {
      buzz([200, 100, 200])
      beep()
    }
    if (x.elapsed >= pm) {
      x.running = false
      x.over = true
      if (x.period >= S.periods) x.final = true
      buzz([400, 150, 400])
      beep()
      releaseWake()
      persist()
    } else if (now - lastSave.current > 2000) {
      persist()
    }
    force()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [S.periodMin, S.subMin, S.periods, kids, persist])

  useEffect(() => {
    const iv = setInterval(tick, 250)
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        tick()
        if (gRef.current?.running) requestWake()
      } else persist()
    }
    document.addEventListener('visibilitychange', onVis)
    document.addEventListener('pointerdown', unlockAudio)
    return () => {
      clearInterval(iv)
      document.removeEventListener('visibilitychange', onVis)
      document.removeEventListener('pointerdown', unlockAudio)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, persist])

  useEffect(() => {
    if (!discardArmed) return
    const t = setTimeout(() => setDiscardArmed(false), 3000)
    return () => clearTimeout(t)
  }, [discardArmed])

  // ---------- actions ----------
  function commit() {
    persist()
    force()
  }
  // Where a log entry lands: swaps at a break count as the start of the next period.
  function stamp(x: Game) {
    return x.over && !x.final ? { p: x.period + 1, t: 0 } : { p: x.period, t: Math.round(x.elapsed) }
  }
  function act(label: string, fn: (x: Game) => void, withClock = false) {
    tick()
    const x = gRef.current!
    const snap: Snap = {
      label,
      flags: kids.map((k) => [k.id, x.p[k.id].here, x.p[k.id].on, x.p[k.id].gk]),
      us: x.us,
      them: x.them,
      marksDone: x.marksDone,
      logLen: x.log.length,
      clock: withClock
        ? {
            period: x.period, elapsed: x.elapsed, running: x.running, over: x.over, final: x.final, at: Date.now(),
            ms: Object.fromEntries(kids.map((k) => [k.id, x.p[k.id].ms])),
          }
        : undefined,
    }
    fn(x)
    x.undo.push(snap)
    if (x.undo.length > 25) x.undo.shift()
    buzz(40)
    toast(label)
    commit()
  }
  function undo() {
    tick()
    const x = gRef.current!
    const s = x.undo.pop()
    if (!s) return
    for (const [id, here, on, gk] of s.flags) if (x.p[id]) Object.assign(x.p[id], { here, on, gk })
    x.us = s.us
    x.them = s.them
    x.marksDone = s.marksDone ?? x.marksDone
    if (typeof s.logLen === 'number') x.log.length = Math.min(x.log.length, s.logLen)
    if (s.clock) {
      const c = s.clock
      for (const [id, ms] of Object.entries(c.ms)) if (x.p[id]) x.p[id].ms = ms
      Object.assign(x, { period: c.period, elapsed: c.elapsed, over: c.over, final: c.final, running: c.running })
      // If the clock was running, the time since the mistaken tap still counts.
      if (c.running) {
        x.lastTick = c.at
        requestWake()
      }
    }
    setSelected(null)
    toast(`Undone: ${s.label}`)
    commit()
    if (s.clock?.running) tick()
  }
  function doSwaps(pairs: [Kid, Kid][], label: string) {
    act(label, (x) => {
      for (const [i, o] of pairs) {
        x.p[i.id].on = true
        x.p[o.id].on = false
        if (x.p[o.id].gk) {
          x.p[o.id].gk = false
          x.p[i.id].gk = true
        }
        if (kickedOff(x)) x.log.push({ ...stamp(x), k: 'sub', in: i.id, out: o.id })
      }
      if (kickedOff(x) && !x.over) {
        x.marksDone = Math.max(x.marksDone, marks.filter((m) => m <= x.elapsed + EARLY_SWAP_MS).length)
      }
    })
  }
  function skipMark() {
    const x = gRef.current!
    x.marksDone = Math.max(x.marksDone, marks.filter((m) => m <= x.elapsed).length)
    toast('Skipped this swap')
    commit()
  }
  function makeLineup() {
    const x = gRef.current!
    // Fewest season minutes start (ties broken randomly).
    const pool = shuffle(present()).sort((a, b) => (seasonMs[a.id] ?? 0) - (seasonMs[b.id] ?? 0))
    for (const k of kids) Object.assign(x.p[k.id], { on: false, gk: false, ms: 0 })
    const starters: Kid[] = []
    const take = (k: Kid) => {
      starters.push(k)
      pool.splice(pool.indexOf(k), 1)
    }
    let keeper: Kid | undefined
    if (S.keeper) {
      keeper = pool.find((k) => k.groups.some((id) => keeperGroupIds.has(id)))
      if (keeper) take(keeper)
    }
    // Fill spots round-robin across position groups so every group is covered.
    for (let progress = true; progress && starters.length < S.onField; ) {
      progress = false
      for (const grp of fieldGroups) {
        if (starters.length >= S.onField) break
        const k = pool.find((kid) => kid.groups.includes(grp.id))
        if (k) {
          take(k)
          progress = true
        }
      }
    }
    while (starters.length < S.onField && pool.length) take(pool[0])
    for (const k of starters) x.p[k.id].on = true
    if (S.keeper && starters.length) {
      keeper ??= starters[Math.floor(Math.random() * starters.length)]
      x.p[keeper.id].gk = true
    }
  }
  function toggleClock() {
    const x = gRef.current!
    if (x.final) return
    // During a break, tapping the clock kicks off the next period.
    if (x.over) return startNextPeriod()
    if (x.running) {
      tick()
      x.running = false
      releaseWake()
    } else {
      x.running = true
      x.lastTick = Date.now()
      requestWake()
    }
    commit()
  }
  // Ends the current period, or, during a break, the next one without its clock ever running.
  function endPeriod() {
    const x = gRef.current!
    if (x.final) return
    act(
      endPeriodLabel(S.periods, x.over ? x.period + 1 : x.period),
      (y) => {
        if (y.over) {
          y.period += 1
          y.elapsed = 0
          y.marksDone = 0
          y.over = false
        }
        if (y.elapsed === 0 && !y.running) {
          // The clock wasn't used this period (the ref kept time): count a full period for kids on the field.
          for (const k of kids) if (y.p[k.id].here && y.p[k.id].on) y.p[k.id].ms += periodMs
          y.elapsed = periodMs
        }
        y.running = false
        y.over = true
        if (y.period >= S.periods) y.final = true
        releaseWake()
      },
      true,
    )
  }
  // Nudge the clock to match the ref's; kids on the field gain or lose the same time.
  function adjust(delta: number) {
    tick()
    const x = gRef.current!
    if (x.over || x.final) return
    const d = Math.max(-x.elapsed, Math.min(delta, periodMs - x.elapsed))
    if (!d) return
    x.elapsed += d
    for (const k of kids) if (x.p[k.id].here && x.p[k.id].on) x.p[k.id].ms = Math.max(0, x.p[k.id].ms + d)
    toast(`Clock ${d > 0 ? '+' : '−'}${mmss(Math.abs(d))}`)
    commit()
  }
  function startNextPeriod() {
    const x = gRef.current!
    x.period += 1
    x.elapsed = 0
    x.marksDone = 0
    x.over = false
    x.running = true
    x.lastTick = Date.now()
    requestWake()
    commit()
  }
  function tapPlayer(id: string) {
    const p = ps(id)
    const kid = kids.find((k) => k.id === id)!
    if (!p.here) {
      setSelected(null)
      act(`${kid.name} is here`, (x) => {
        Object.assign(x.p[id], { here: true, on: false, gk: false })
        if (kickedOff(x)) x.log.push({ ...stamp(x), k: 'arrive', id })
      })
      return
    }
    if (selected === null || selected === id) {
      setSelected(selected === id ? null : id)
      return
    }
    const a = ps(selected)
    if (!a || !a.here || a.on === p.on) {
      setSelected(id)
      return
    }
    const aKid = kids.find((k) => k.id === selected)!
    const [inK, outK] = a.on ? [kid, aKid] : [aKid, kid]
    setSelected(null)
    doSwaps([[inK, outK]], `${inK.name} in for ${outK.name}`)
  }
  function goal(side: 'us' | 'them') {
    act(side === 'us' ? 'Goal for us' : `Goal for ${opponent ?? 'them'}`, (x) => {
      x[side] += 1
      if (kickedOff(x)) x.log.push({ ...stamp(x), k: 'goal', side })
    })
  }
  async function save() {
    const x = gRef.current!
    if (x.saved || saving) return
    setSaving(true)
    const minutes: Record<string, number> = {}
    for (const k of kids) if (x.p[k.id].here) minutes[k.id] = x.p[k.id].ms
    try {
      const res = await saveGame({ teamId, clientId: x.clientId, eventId, us: x.us, them: x.them, minutes, log: x.log })
      if (res.ok) {
        x.saved = true
        toast('Game saved')
        commit()
      } else toast(res.error)
    } catch {
      toast('No signal. The game is kept on this phone. Tap Save again later.')
    } finally {
      setSaving(false)
    }
  }
  function newGame() {
    const x = gRef.current!
    if (x.final && !x.saved && !discardArmed) {
      setDiscardArmed(true)
      return
    }
    releaseWake()
    const next = fresh()
    for (const k of kids) next.p[k.id] = { here: false, on: false, gk: false, ms: 0 }
    gRef.current = next
    setSelected(null)
    setDiscardArmed(false)
    setShowLog(false)
    commit()
  }

  // Retry an unsaved finished game as soon as the phone is back online.
  useEffect(() => {
    const onOnline = () => {
      const x = gRef.current
      if (x?.final && !x.saved) void save()
    }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  })

  if (!g) return <main className="field-app checkin" aria-busy="true" />

  const toastEl = (
    <div className={`toast${toastMsg ? '' : ' off'}`} role="status">
      {toastMsg}
    </div>
  )

  // ================= CHECK-IN =================
  if (g.phase === 'checkin') {
    const n = present().length
    const allHere = kids.length > 0 && kids.every((k) => ps(k.id).here)
    return (
      <main className="field-app checkin">
        <header className="f-top">
          <h1 className="f-title">Who’s here?</h1>
          <Link href={`/teams/${teamId}`} className="icon-btn" aria-label="Back to team">✕</Link>
        </header>
        <div className="team-chip">
          <span className="name">{teamName}{opponent ? ` vs ${opponent}` : ''}</span>
          <span className="line">
            <span className="badge">{age}</span>
            <span className="badge">{formatLabel(S)}</span> {S.periods} × {S.periodMin} min
            {marks.length ? ` · swaps at ${marks.map((m) => `${m / M}′`).join(', ')} + breaks` : ' · swaps at breaks'}
          </span>
        </div>
        <div className="roster">
          <div className="group-h">
            <span>Tap each kid as they arrive</span>
            <button
              className="btn small"
              onClick={() => {
                for (const k of kids) ps(k.id).here = !allHere
                commit()
              }}
            >
              {allHere ? 'Clear all' : 'Everyone’s here'}
            </button>
          </div>
          {kids.length === 0 ? (
            <p className="empty">
              No kids on this team yet. <Link href={`/teams/${teamId}/roster`}>Add them on the Roster page.</Link>
            </p>
          ) : (
            <div className="tiles">
              {kids.map((k) => {
                const here = ps(k.id).here
                return (
                  <button
                    key={k.id}
                    className={`tile${here ? ' here' : ''}`}
                    aria-pressed={here}
                    onClick={() => {
                      ps(k.id).here = !here
                      buzz(20)
                      commit()
                    }}
                  >
                    <span className="t-name">{k.name}</span>
                    <span className="t-min">{here ? '✓' : ''}</span>
                    <span className="t-tag">{here ? 'Here' : 'Not here yet'}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
        <div className="cta">
          <button
            className="go-btn"
            disabled={n === 0}
            onClick={() => {
              makeLineup()
              g.phase = 'game'
              g.undo = []
              setSelected(null)
              commit()
            }}
          >
            {n ? `Make lineup · ${n} here` : 'Make lineup'}
          </button>
          <p className="cta-note">
            {n === 0
              ? 'Mark who showed up first.'
              : n < S.onField
                ? `Only ${n} here. You’ll play short, ${n} on the field.`
                : n === S.onField
                  ? `Exactly ${S.onField}. Everyone starts, no subs.`
                  : `${S.onField} start, ${n - S.onField} on the bench. Fewest season minutes start.`}
          </p>
        </div>
        {toastEl}
      </main>
    )
  }

  // ================= GAME =================
  const pre = !kickedOff(g)
  const pairs = suggestion()
  const nextMark = marks[g.marksDone]
  const due = !pre && !g.over && !g.final && nextMark !== undefined && g.elapsed >= nextMark && pairs.length > 0
  const hereKids = present()
  const total = hereKids.reduce((s, k) => s + ps(k.id).ms, 0)
  const maxMs = Math.max(1, ...hereKids.map((k) => ps(k.id).ms))
  const avg = hereKids.length ? total / hereKids.length : 0
  const sel = selected ? kids.find((k) => k.id === selected) : undefined
  const selP = selected ? ps(selected) : undefined
  const keeper = kids.find((k) => ps(k.id).here && ps(k.id).gk)
  const onField = kids.filter((k) => ps(k.id).here && ps(k.id).on)
  // Field players per position group; the keeper is in goal, so doesn't count toward Left/Center/etc.
  const outfield = onField.filter((k) => !ps(k.id).gk)
  const coverage = fieldGroups.map((gr) => `${gr.name} ${outfield.filter((k) => k.groups.includes(gr.id)).length}`).join(' · ')
  const inPeriod = !g.over && !g.final

  const tileGroups: { title: string; hint?: string; empty: string; list: Kid[] }[] = [
    { title: 'On field', hint: 'Tap two players to swap', empty: 'Nobody on the field.', list: onField },
    { title: 'Bench', empty: 'Nobody on the bench.', list: kids.filter((k) => ps(k.id).here && !ps(k.id).on) },
    { title: 'Not here', hint: 'Tap a late arrival', empty: 'Everyone showed up.', list: kids.filter((k) => !ps(k.id).here) },
  ]

  let call: React.ReactNode
  if (sel && selP) {
    const canKeep = S.keeper && selP.on && !selP.gk
    const matches = fieldGroups.length > 0 && kids.some((k) => ps(k.id).here && ps(k.id).on !== selP.on && sharesFieldGroup(sel, k))
    call = (
      <>
        <p>
          <b>{sel.name}</b> selected. Tap a player {selP.on ? 'on the bench' : 'on the field'} to swap
          {matches ? '. Outlined players share a position group.' : '.'}
        </p>
        <div className="btn-grid">
          {canKeep && (
            <button
              className="ghost-btn"
              onClick={() => {
                setSelected(null)
                act(`${sel.name} in goal`, (x) => {
                  for (const k of kids) x.p[k.id].gk = false
                  x.p[sel.id].gk = true
                  if (kickedOff(x)) x.log.push({ ...stamp(x), k: 'keeper', id: sel.id })
                })
              }}
            >
              Put in goal
            </button>
          )}
          <button className="ghost-btn" style={canKeep ? undefined : { gridColumn: '1 / -1' }} onClick={() => setSelected(null)}>
            Cancel
          </button>
        </div>
      </>
    )
  } else if (g.final) {
    call = (
      <>
        <div className="call-top">
          <span className="eyebrow">Full time</span>
          <span className="countdown">Us {g.us} – {g.them} {opponent ?? 'Them'}</span>
        </div>
        {g.saved ? (
          <p>Saved. Minutes are added to the season totals.</p>
        ) : (
          <button className="go-btn" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save game'}</button>
        )}
        <div className="btn-grid">
          <button className="ghost-btn" onClick={() => setShowLog(true)}>Subs by {S.periods === 2 ? 'half' : S.periods === 4 ? 'quarter' : 'period'}</button>
          <button className="ghost-btn" onClick={newGame}>{discardArmed ? 'Not saved. Tap again' : 'New game'}</button>
        </div>
      </>
    )
  } else if (pre) {
    call = (
      <>
        <div className="call-top">
          <span className="eyebrow">Starting lineup</span>
          <span className="countdown">{keeper ? `Keeper: ${keeper.name}` : ''}</span>
        </div>
        <p>
          Tap two players to switch them{S.keeper ? ', or one field player to put them in goal' : ''}. Press Start at
          kickoff. Not keeping time? Tap {endPeriodLabel(S.periods, 1)} at the whistle.
        </p>
        <div className="btn-grid">
          <button
            className="ghost-btn"
            onClick={() => {
              makeLineup()
              g.undo = []
              setSelected(null)
              toast('New lineup')
              commit()
            }}
          >
            Reshuffle
          </button>
          <button
            className="ghost-btn"
            onClick={() => {
              g.phase = 'checkin'
              g.running = false
              setSelected(null)
              commit()
            }}
          >
            Back to check-in
          </button>
        </div>
      </>
    )
  } else {
    const countdown = !pairs.length
      ? ''
      : g.over
        ? 'Swap now'
        : due
          ? 'Swap now'
          : nextMark !== undefined
            ? `in ${mmss(nextMark - g.elapsed)}`
            : 'at the break'
    call = (
      <>
        <div className="call-top">
          <span className="eyebrow">{g.over ? breakName(S.periods) : 'Next swap'}</span>
          <span className="countdown">{countdown}</span>
        </div>
        {pairs.length > 0 ? (
          <>
            <div className="pairs">
              <span className="h">In</span>
              <span />
              <span className="h" style={{ textAlign: 'right' }}>Out</span>
              {pairs.map(([i, o]) => (
                <PairRow key={i.id + o.id} inName={i.name} inMin={mins(ps(i.id).ms)} outName={o.name} outMin={mins(ps(o.id).ms)} />
              ))}
            </div>
            <button
              className="go-btn"
              onClick={() => doSwaps(pairs, pairs.length === 1 ? `${pairs[0][0].name} in for ${pairs[0][1].name}` : `${pairs.length} players swapped`)}
            >
              Swap{pairs.length > 1 ? ` ${pairs.length}` : ''}
            </button>
            {due && (
              <button className="ghost-btn" onClick={skipMark}>
                Skip this swap
              </button>
            )}
          </>
        ) : (
          !g.over && <p>No one on the bench. Everyone plays.</p>
        )}
      </>
    )
  }

  return (
    <main className="field-app game">
      <header className="f-top">
        <div className="score" aria-live="polite">
          <span>Us</span>
          <span className="num">{g.us}</span>
          <span className="num">–</span>
          <span className="num">{g.them}</span>
          <span className="opp">{opponent ?? 'Them'}</span>
        </div>
        <button className="icon-btn log-btn" onClick={() => setShowLog(true)} aria-label="Game log: subs by period">
          Log
        </button>
        <Link href={`/teams/${teamId}`} className="icon-btn" aria-label="Back to team (the game keeps running)">✕</Link>
      </header>

      <div className="clock-wrap">
        <div className={`clock${g.running ? ' running' : ''}`} role="timer" aria-label={`${periodName(S.periods, g.period)}, ${mmss(periodMs - g.elapsed)} left`}>
          <span className="period">
            {g.final ? 'Full time' : g.over ? `End of ${periodName(S.periods, g.period)}` : periodName(S.periods, g.period)}
          </span>
          <span className="time">{mmss(periodMs - g.elapsed)}</span>
          <span className={`state${!g.running && !g.final ? ' paused' : ''}`}>
            {g.final ? 'Game over' : g.over ? 'Break' : g.running ? 'Running' : pre ? 'Ready' : 'Paused'}
          </span>
          <span className="clock-bar" aria-hidden="true">
            <i style={{ width: `${Math.min(100, (g.elapsed / periodMs) * 100)}%` }} />
            {marks.map((m, i) => (
              <b key={m} className={i < g.marksDone ? 'done' : undefined} style={{ left: `${(m / periodMs) * 100}%` }} />
            ))}
          </span>
        </div>
        {!g.final && (
          <button className={`start-btn${g.running ? ' pause' : ''}`} onClick={toggleClock}>
            {g.running
              ? 'Pause'
              : g.over
                ? `Start ${periodName(S.periods, g.period + 1)}`
                : pre
                  ? `Start ${periodName(S.periods, 1)}`
                  : 'Resume'}
          </button>
        )}
        {!g.final && (
          <div className="clock-strip">
            {inPeriod && (
              <>
                <button onClick={() => adjust(-M)} aria-label="Take a minute off the clock">−1′</button>
                <button onClick={() => adjust(M)} aria-label="Add a minute to the clock">+1′</button>
              </>
            )}
            <span className="spacer" />
            <button className="end" onClick={endPeriod}>
              {endPeriodLabel(S.periods, g.over ? g.period + 1 : g.period)}
            </button>
          </div>
        )}
      </div>

      <section className={`call${due && !sel ? ' due' : ''}`} aria-live="polite">
        {call}
      </section>

      <div className="roster">
        {tileGroups.map((grp) => (
          <div key={grp.title} className="stack">
            <div className="group-h">
              <span>{grp.title} · {grp.list.length}</span>
              {grp.hint && <span className="hint">{grp.hint}</span>}
            </div>
            {grp.title === 'On field' && coverage && <p className="coverage">{coverage}</p>}
            {grp.list.length === 0 ? (
              <p className="empty" style={{ margin: 0 }}>{grp.empty}</p>
            ) : (
              <div className="tiles">
                {grp.list.map((k) => {
                  const p = ps(k.id)
                  const owed = p.here && !p.on && avg > M && p.ms < avg - Math.max(M, avg * 0.2)
                  const match = !!sel && !!selP && p.here && p.on !== selP.on && sharesFieldGroup(sel, k)
                  const cls = ['tile', p.here && p.on && 'on', !p.here && 'away', owed && 'owed', match && 'match', selected === k.id && 'selected']
                    .filter(Boolean)
                    .join(' ')
                  const gn = groupNames(k)
                  return (
                    <button
                      key={k.id}
                      className={cls}
                      onClick={() => tapPlayer(k.id)}
                      aria-label={`${k.name}${gn.length ? ` (${gn.join(', ')})` : ''}${p.here ? `, ${mins(p.ms)} minutes, ${p.on ? 'on field' : 'on bench'}` : ', not here'}${p.gk ? ', keeper' : ''}${owed ? ', needs time' : ''}`}
                    >
                      <span className="t-name">{k.name}</span>
                      <span className="t-min">{p.here ? `${mins(p.ms)}′` : ''}</span>
                      {groups.length > 0 && <span className="t-groups">{gn.join(' · ')}</span>}
                      <span className="t-tag">{!p.here ? 'Tap if here' : p.gk ? 'Keeper' : owed ? 'Needs time' : ''}</span>
                      <span className="t-bar"><i style={{ width: `${Math.round((p.ms / maxMs) * 100)}%` }} /></span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      <nav className="thumbbar">
        <button onClick={undo} disabled={!g.undo.length}>↶ Undo</button>
        <button className="goal" onClick={() => goal('us')}>+ Us</button>
        <button className="goal" onClick={() => goal('them')}>+ Them</button>
      </nav>

      {showLog && (
        <div className="sheet-wrap" onClick={(e) => e.target === e.currentTarget && setShowLog(false)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="logTitle">
            <div className="f-top">
              <h2 id="logTitle" className="f-title">Game log</h2>
              <button className="icon-btn" onClick={() => setShowLog(false)} aria-label="Close">✕</button>
            </div>
            <GameLog log={g.log} periods={S.periods} periodMs={periodMs} names={names} opponent={opponent} />
          </div>
        </div>
      )}
      {toastEl}
    </main>
  )
}

function PairRow({ inName, inMin, outName, outMin }: { inName: string; inMin: number; outName: string; outMin: number }) {
  return (
    <>
      <span className="in">
        {inName} <span className="m">{inMin}′</span>
      </span>
      <span className="arrow">⇄</span>
      <span className="out">
        <span className="m">{outMin}′</span> {outName}
      </span>
    </>
  )
}

'use client'

import Link from 'next/link'
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { saveGame } from '@/app/actions'
import { breakName, formatLabel, pairsPerSwap, periodName, type TeamSettings } from '@/lib/formats'

type Kid = { id: string; name: string }
type PState = { here: boolean; on: boolean; gk: boolean; ms: number }
type Snap = { label: string; flags: [string, boolean, boolean, boolean][]; us: number; them: number; since: number; after: number }
type Game = {
  v: 1
  clientId: string
  phase: 'checkin' | 'game'
  p: Record<string, PState>
  period: number
  elapsed: number
  running: boolean
  lastTick: number
  since: number
  us: number
  them: number
  undo: Snap[]
  over: boolean
  final: boolean
  saved: boolean
}

type Props = {
  teamId: string
  teamName: string
  age: string
  settings: TeamSettings
  kids: Kid[]
  seasonMs: Record<string, number>
  eventId: string | null
  opponent: string | null
}

const M = 60000

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
    since: 0, us: 0, them: 0, undo: [], over: false, final: false, saved: false,
  }
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

export function FieldMode({ teamId, teamName, age, settings: S, kids, seasonMs, eventId, opponent }: Props) {
  const key = `myteam.game.${teamId}`
  const gRef = useRef<Game | null>(null)
  const [, force] = useReducer((x: number) => x + 1, 0)
  const [selected, setSelected] = useState<string | null>(null)
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [discardArmed, setDiscardArmed] = useState(false)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const lastSave = useRef(0)
  const audio = useRef<AudioContext | null>(null)
  const wake = useRef<WakeLockSentinel | null>(null)
  const sound = useRef(true)

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
    if (!g) try {
      const raw = JSON.parse(localStorage.getItem(key) ?? 'null')
      if (raw && raw.v === 1) g = raw as Game
    } catch {}
    g ??= fresh()
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
    if (!sound.current || !ac) return
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
  const bench = () => kids.filter((k) => ps(k.id).here && !ps(k.id).on)
  const kickedOff = (x: Game) => x.period > 1 || x.elapsed > 0 || x.running

  function suggestion(): [Kid, Kid][] {
    const b = bench().sort((a, c) => ps(a.id).ms - ps(c.id).ms)
    const out = kids.filter((k) => ps(k.id).here && ps(k.id).on && !ps(k.id).gk).sort((a, c) => ps(c.id).ms - ps(a.id).ms)
    const n = Math.min(pairsPerSwap(S.onField), b.length, out.length)
    return Array.from({ length: n }, (_, i) => [b[i], out[i]] as [Kid, Kid])
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
    const subMs = S.subMin * M
    dt = Math.max(0, Math.min(dt, pm - x.elapsed))
    const before = x.since
    x.elapsed += dt
    x.since += dt
    for (const k of kids) if (x.p[k.id]?.here && x.p[k.id].on) x.p[k.id].ms += dt
    const hasBench = kids.some((k) => x.p[k.id]?.here && !x.p[k.id].on)
    if (subMs && before < subMs && x.since >= subMs && hasBench) {
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
  function act(label: string, fn: (x: Game) => void) {
    tick()
    const x = gRef.current!
    const snap: Snap = {
      label,
      flags: kids.map((k) => [k.id, x.p[k.id].here, x.p[k.id].on, x.p[k.id].gk]),
      us: x.us, them: x.them, since: x.since, after: 0,
    }
    fn(x)
    snap.after = x.since
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
    x.since = s.since + (x.since - s.after)
    setSelected(null)
    toast(`Undone: ${s.label}`)
    commit()
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
      }
      if (kickedOff(x)) x.since = 0
    })
  }
  function makeLineup() {
    const x = gRef.current!
    // Kids with the fewest season minutes start; ties are broken randomly.
    const here = shuffle(present()).sort((a, b) => (seasonMs[a.id] ?? 0) - (seasonMs[b.id] ?? 0))
    for (const k of kids) Object.assign(x.p[k.id], { on: false, gk: false, ms: 0 })
    here.forEach((k, i) => (x.p[k.id].on = i < S.onField))
    if (S.keeper) {
      const starters = here.slice(0, S.onField)
      if (starters.length) x.p[starters[Math.floor(Math.random() * starters.length)].id].gk = true
    }
  }
  function toggleClock() {
    const x = gRef.current!
    if (x.over) return
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
  function startNextPeriod() {
    const x = gRef.current!
    x.period += 1
    x.elapsed = 0
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
      act(`${kid.name} is here`, (x) => Object.assign(x.p[id], { here: true, on: false, gk: false }))
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
  async function save() {
    const x = gRef.current!
    if (x.saved || saving) return
    setSaving(true)
    const minutes: Record<string, number> = {}
    for (const k of kids) if (x.p[k.id].here) minutes[k.id] = x.p[k.id].ms
    try {
      const res = await saveGame({ teamId, clientId: x.clientId, eventId, us: x.us, them: x.them, minutes })
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
  const atBreaks = !S.subMin
  const subLeft = S.subMin * M - g.since
  const due = !atBreaks && !pre && !g.over && !g.final && subLeft <= 0 && pairs.length > 0
  const hereKids = present()
  const total = hereKids.reduce((s, k) => s + ps(k.id).ms, 0)
  const maxMs = Math.max(1, ...hereKids.map((k) => ps(k.id).ms))
  const avg = hereKids.length ? total / hereKids.length : 0
  const sel = selected ? kids.find((k) => k.id === selected) : undefined
  const selP = selected ? ps(selected) : undefined
  const keeper = kids.find((k) => ps(k.id).here && ps(k.id).gk)

  const groups: { title: string; hint?: string; empty: string; list: Kid[] }[] = [
    { title: 'On field', hint: 'Tap two players to swap', empty: 'Nobody on the field.', list: kids.filter((k) => ps(k.id).here && ps(k.id).on) },
    { title: 'Bench', empty: 'Nobody on the bench.', list: kids.filter((k) => ps(k.id).here && !ps(k.id).on) },
    { title: 'Not here', hint: 'Tap a late arrival', empty: 'Everyone showed up.', list: kids.filter((k) => !ps(k.id).here) },
  ]

  let call: React.ReactNode
  if (sel && selP) {
    const canKeep = S.keeper && selP.on && !selP.gk
    call = (
      <>
        <p>
          <b>{sel.name}</b> selected. Tap a player {selP.on ? 'on the bench' : 'on the field'} to swap.
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
        <button className="ghost-btn" onClick={newGame}>
          {discardArmed ? 'Not saved. Tap again to discard' : 'New game'}
        </button>
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
          Tap two players to switch them{S.keeper ? ', or tap a field player to put them in goal' : ''}. Tap the clock at kickoff.
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
    call = (
      <>
        <div className="call-top">
          {g.over ? (
            <>
              <span className="eyebrow">{breakName(S.periods)}</span>
              <span className="countdown">{pairs.length ? 'Swap now' : ''}</span>
            </>
          ) : (
            <>
              <span className="eyebrow">Next swap</span>
              <span className="countdown">
                {!pairs.length ? '' : atBreaks ? 'at the break' : due ? 'Swap now' : `in ${mmss(subLeft)}`}
              </span>
            </>
          )}
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
          </>
        ) : (
          !g.over && <p>No one on the bench. Everyone plays.</p>
        )}
        {g.over && (
          <button className="ghost-btn" onClick={startNextPeriod}>
            Start {periodName(S.periods, g.period + 1)}
          </button>
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
        <Link href={`/teams/${teamId}`} className="icon-btn" aria-label="Back to team (the game keeps running)">✕</Link>
      </header>

      <button className={`clock${g.running ? ' running' : ''}`} onClick={toggleClock} aria-label="Start or pause the clock">
        <span className="period">
          {g.final ? 'Full time' : g.over ? `End of ${periodName(S.periods, g.period)}` : periodName(S.periods, g.period)}
        </span>
        <span className="time">{mmss(S.periodMin * M - g.elapsed)}</span>
        <span className={`state${!g.running && !g.over ? ' paused' : ''}`}>
          {g.final ? 'Game over' : g.over ? 'Break' : g.running ? 'Tap to pause' : pre ? 'Tap to kick off' : 'Paused · tap to resume'}
        </span>
      </button>

      <section className={`call${due && !sel ? ' due' : ''}`} aria-live="polite">
        {call}
      </section>

      <div className="roster">
        {groups.map((grp) => (
          <div key={grp.title} className="stack">
            <div className="group-h">
              <span>{grp.title} · {grp.list.length}</span>
              {grp.hint && <span className="hint">{grp.hint}</span>}
            </div>
            {grp.list.length === 0 ? (
              <p className="empty" style={{ margin: 0 }}>{grp.empty}</p>
            ) : (
              <div className="tiles">
                {grp.list.map((k) => {
                  const p = ps(k.id)
                  const owed = p.here && !p.on && avg > M && p.ms < avg - Math.max(M, avg * 0.2)
                  const cls = ['tile', p.here && p.on && 'on', !p.here && 'away', owed && 'owed', selected === k.id && 'selected']
                    .filter(Boolean)
                    .join(' ')
                  return (
                    <button
                      key={k.id}
                      className={cls}
                      onClick={() => tapPlayer(k.id)}
                      aria-label={`${k.name}${p.here ? `, ${mins(p.ms)} minutes, ${p.on ? 'on field' : 'on bench'}` : ', not here'}${p.gk ? ', keeper' : ''}${owed ? ', needs time' : ''}`}
                    >
                      <span className="t-name">{k.name}</span>
                      <span className="t-min">{p.here ? `${mins(p.ms)}′` : ''}</span>
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
        <button className="goal" onClick={() => act('Goal for us', (x) => (x.us += 1))}>+ Us</button>
        <button className="goal" onClick={() => act(`Goal for ${opponent ?? 'them'}`, (x) => (x.them += 1))}>+ Them</button>
      </nav>
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

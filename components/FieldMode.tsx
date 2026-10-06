'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { GameLog } from '@/components/GameLog'
import { useLive, type Initial } from '@/components/useLive'
import { breakName, endPeriodLabel, formatLabel, periodName, type PositionGroup, type TeamSettings } from '@/lib/formats'
import {
  DRILL_PRESETS_MIN,
  MIN,
  buildLineup,
  inverseOf,
  keeperGroupIds,
  kickedOff,
  splitTeams,
  subMarks,
  suggestSwaps,
  type Action,
  type Kid,
  type KidState,
  type Rules,
} from '@/lib/live'

type Props = {
  teamId: string
  teamName: string
  age: string
  settings: TeamSettings
  groups: PositionGroup[]
  kids: Kid[]
  seasonMs: Record<string, number>
  initial: Initial
}

const EMPTY: KidState = { here: false, on: false, gk: false, ms: 0 }
const TEAM_NAMES = ['Team A', 'Team B', 'Team C']

function mmss(ms: number) {
  const t = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}
const mins = (ms: number) => Math.floor(ms / MIN)

export function FieldMode({ teamId, teamName, age, settings: S, groups, kids, seasonMs, initial }: Props) {
  const router = useRouter()
  const rules: Rules = useMemo(
    () => ({ periods: S.periods, periodMin: S.periodMin, subMin: S.subMin, keeper: S.keeper, onField: S.onField }),
    [S.periods, S.periodMin, S.subMin, S.keeper, S.onField],
  )
  const roster = useMemo(() => new Set(kids.map((k) => k.id)), [kids])
  const live = useLive(teamId, initial, rules, roster)
  const [, tick] = useReducer((x: number) => x + 1, 0)
  const [selected, setSelected] = useState<string | null>(null)
  const [sheet, setSheet] = useState<null | 'menu' | 'log'>(null)
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [armed, setArmed] = useState<null | 'discard'>(null)
  const [practiceTab, setPracticeTab] = useState<'here' | 'scrimmage'>('here')
  const [teamCount, setTeamCount] = useState(2)
  const undoStack = useRef<{ label: string; inverse: Action[] }[]>([])
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const audio = useRef<AudioContext | null>(null)
  const wake = useRef<WakeLockSentinel | null>(null)
  const prev = useRef<{ period: number; elapsed: number; over: boolean; drillDone: boolean } | null>(null)

  const st = live.state
  const periodMs = S.periodMin * MIN
  const marks = subMarks(rules)
  const keeperIds = keeperGroupIds(groups)
  const fieldGroups = groups.filter((g) => !keeperIds.has(g.id))
  const names = Object.fromEntries(kids.map((k) => [k.id, k.name]))
  const ks = (id: string) => st?.kids[id] ?? EMPTY

  // Redraw four times a second so clocks move.
  useEffect(() => {
    const iv = setInterval(tick, 250)
    return () => clearInterval(iv)
  }, [])

  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(null), 3000)
    return () => clearTimeout(t)
  }, [armed])

  // ---------- feedback: buzz, beep, keep the screen on ----------
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
  useEffect(() => {
    const unlock = () => {
      if (audio.current) return
      try {
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        audio.current = new Ctx()
      } catch {}
    }
    document.addEventListener('pointerdown', unlock)
    return () => document.removeEventListener('pointerdown', unlock)
  }, [])

  const running = !!st && (st.clock.running || st.drill.running)
  useEffect(() => {
    if (running) {
      try {
        navigator.wakeLock?.request('screen').then((l) => (wake.current = l)).catch(() => {})
      } catch {}
    } else {
      try {
        wake.current?.release()
      } catch {}
      wake.current = null
    }
  }, [running])

  // Every coach's phone buzzes at swap marks, period ends and when a drill finishes.
  useEffect(() => {
    if (!st) return
    const p = prev.current
    const c = st.clock
    const drillDone = st.drill.elapsed >= st.drill.length
    if (p) {
      const hasBench = kids.some((k) => ks(k.id).here && !ks(k.id).on)
      if (st.kind === 'game' && c.period === p.period && hasBench && marks.some((m) => p.elapsed < m && c.elapsed >= m)) {
        buzz([200, 100, 200])
        beep()
      }
      if (st.kind === 'game' && !p.over && st.over) {
        buzz([400, 150, 400])
        beep()
      }
      if (st.kind === 'practice' && !p.drillDone && drillDone) {
        buzz([400, 150, 400, 150, 400])
        beep()
      }
    }
    prev.current = { period: c.period, elapsed: c.elapsed, over: st.over, drillDone }
  })

  // ---------- actions ----------
  function act(label: string, a: Action) {
    if (!st) return
    const inverse = inverseOf(st, a)
    live.dispatch([a])
    if (inverse.length) {
      undoStack.current.push({ label, inverse })
      if (undoStack.current.length > 25) undoStack.current.shift()
    }
    buzz(40)
    toast(label)
  }
  function undo() {
    const u = undoStack.current.pop()
    if (!u) return
    live.dispatch(u.inverse)
    setSelected(null)
    toast(`Undone: ${u.label}`)
  }
  function makeLineup() {
    if (!st) return
    live.dispatch([{ t: 'lineup', ...buildLineup(st, kids, rules, groups, seasonMs) }])
    undoStack.current = []
    setSelected(null)
  }
  function swap(pairs: [Kid, Kid][]) {
    const label = pairs.length === 1 ? `${pairs[0][0].name} in for ${pairs[0][1].name}` : `${pairs.length} players swapped`
    act(label, { t: 'swap', pairs: pairs.map(([i, o]) => [i.id, o.id] as [string, string]) })
  }
  function tapPlayer(id: string) {
    const p = ks(id)
    const kid = kids.find((k) => k.id === id)!
    if (!p.here) {
      setSelected(null)
      act(`${kid.name} is here`, { t: 'here', id, here: true })
      return
    }
    if (selected === null || selected === id) {
      setSelected(selected === id ? null : id)
      return
    }
    const a = ks(selected)
    if (!a.here || a.on === p.on) {
      setSelected(id)
      return
    }
    const other = kids.find((k) => k.id === selected)!
    setSelected(null)
    swap(a.on ? [[kid, other]] : [[other, kid]])
  }
  async function endSession(op: 'finish' | 'discard') {
    setBusy(true)
    const ok = await live.end(op)
    setBusy(false)
    if (!ok) {
      toast('No signal. Try again when you’re back online.')
      return
    }
    router.push(`/teams/${teamId}`)
    router.refresh()
  }

  // ---------- shared pieces ----------
  const toastEl = (
    <div className={`toast${toastMsg ? '' : ' off'}`} role="status">
      {toastMsg}
    </div>
  )
  const sync = (
    <span className={`sync${live.online ? '' : ' off'}`} title={live.online ? 'Up to date with your other coaches' : 'No signal'}>
      {live.online ? (live.waiting ? 'Saving…' : 'Live') : `Offline${live.waiting ? ` · ${live.waiting} waiting` : ''}`}
    </span>
  )
  const topButtons = (
    <>
      <button className="icon-btn" onClick={() => setSheet('menu')} aria-label="Menu">⋯</button>
      <Link href={`/teams/${teamId}`} className="icon-btn" aria-label="Back to team (keeps running)">✕</Link>
    </>
  )
  const isGame = live.kind === 'game'
  const off = !!st && kickedOff(st)

  const menu = sheet === 'menu' && (
    <div className="sheet-wrap" onClick={(e) => e.target === e.currentTarget && setSheet(null)}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="menuTitle">
        <div className="f-top">
          <h2 id="menuTitle" className="f-title">{isGame ? 'Game' : 'Practice'}</h2>
          <button className="icon-btn" onClick={() => setSheet(null)} aria-label="Close">✕</button>
        </div>
        {isGame && off && (
          <button className="go-btn" disabled={busy} onClick={() => endSession('finish')}>
            End game &amp; save
          </button>
        )}
        {!isGame && (
          <button className="go-btn" disabled={busy} onClick={() => endSession('finish')}>
            End practice
          </button>
        )}
        {isGame && st?.phase === 'live' && !off && (
          <button
            className="ghost-btn"
            onClick={() => {
              live.dispatch([{ t: 'toCheckin' }])
              setSheet(null)
            }}
          >
            Back to check-in
          </button>
        )}
        {isGame && st?.phase === 'live' && (
          <button className="ghost-btn" onClick={() => setSheet('log')}>
            Game log
          </button>
        )}
        <button
          className="ghost-btn danger"
          disabled={busy}
          onClick={() => (armed === 'discard' ? endSession('discard') : setArmed('discard'))}
        >
          {armed === 'discard' ? 'Tap again to discard' : isGame ? 'Discard this game' : 'Discard this practice'}
        </button>
        <p className="note">
          {isGame
            ? 'Ending saves the score and everyone’s minutes. Discarding throws this game away for every coach.'
            : 'Ending or discarding closes this practice for every coach.'}
        </p>
      </div>
    </div>
  )

  if (live.ended || !st) {
    return (
      <main className="page" style={{ paddingTop: '10vh' }}>
        <h1 className="h1">{isGame ? 'Game ended' : 'Practice ended'}</h1>
        <p className="muted" style={{ margin: 0 }}>This session was ended, maybe by another coach.</p>
        <Link href={`/teams/${teamId}`} className="btn primary big">Back to {teamName}</Link>
      </main>
    )
  }

  // ================= CHECK-IN (games and practices) =================
  const checkInTiles = (
    <div className="tiles">
      {kids.map((k) => {
        const here = ks(k.id).here
        return (
          <button
            key={k.id}
            className={`tile${here ? ' here' : ''}`}
            aria-pressed={here}
            onClick={() => {
              live.dispatch([{ t: 'here', id: k.id, here: !here }])
              buzz(20)
            }}
          >
            <span className="t-name">{k.name}</span>
            <span className="t-min">{here ? '✓' : ''}</span>
            <span className="t-tag">{here ? 'Here' : 'Not here yet'}</span>
          </button>
        )
      })}
    </div>
  )
  const n = kids.filter((k) => ks(k.id).here).length
  const allHere = kids.length > 0 && kids.every((k) => ks(k.id).here)
  const checkInHeader = (
    <div className="group-h">
      <span>{isGame ? 'Tap each kid as they arrive' : `Here · ${n} of ${kids.length}`}</span>
      <button className="btn small" onClick={() => live.dispatch([{ t: 'allHere', here: !allHere }])}>
        {allHere ? 'Clear all' : 'Everyone’s here'}
      </button>
    </div>
  )
  const noKids = (
    <p className="empty">
      No kids on this team yet. <Link href={`/teams/${teamId}/roster`}>Add them on the Roster page.</Link>
    </p>
  )

  // ================= PRACTICE =================
  const teams = st.teams?.length ? st.teams : null
  function split() {
    if (!st) return
    live.dispatch([{ t: 'teams', teams: splitTeams(st, kids, groups, teams?.length ?? teamCount) }])
    buzz(40)
    toast(teams ? 'Reshuffled' : 'Teams made')
  }
  if (!isGame) {
    const d = st.drill
    const left = d.length - d.elapsed
    const done = left <= 0
    return (
      <main className="field-app practice">
        <header className="f-top">
          <h1 className="f-title">Practice</h1>
          {sync}
          {topButtons}
        </header>
        <div className="clock-wrap">
          <div className={`clock${d.running ? ' running' : ''}`} role="timer" aria-label={`Drill timer, ${mmss(left)} left`}>
            <span className="period">Drill timer</span>
            <span className="time">{mmss(left)}</span>
            <span className={`state${!d.running ? ' paused' : ''}`}>
              {done ? 'Time!' : d.running ? 'Running' : d.elapsed > 0 ? 'Paused' : 'Ready'}
            </span>
            <span className="clock-bar" aria-hidden="true">
              <i style={{ width: `${Math.min(100, (d.elapsed / d.length) * 100)}%` }} />
            </span>
          </div>
          <button
            className={`start-btn${d.running ? ' pause' : ''}`}
            onClick={() => live.dispatch([{ t: d.running ? 'drillPause' : 'drillStart' }])}
          >
            {d.running ? 'Pause' : done ? 'Start again' : d.elapsed > 0 ? 'Resume' : 'Start'}
          </button>
          <div className="clock-strip">
            {DRILL_PRESETS_MIN.map((m) => (
              <button
                key={m}
                aria-pressed={d.length === m * MIN}
                className={d.length === m * MIN ? 'on' : undefined}
                onClick={() => live.dispatch([{ t: 'drillSet', ms: m * MIN }])}
              >
                {m}′
              </button>
            ))}
            <span className="spacer" />
            <button className="end" onClick={() => live.dispatch([{ t: 'drillReset' }])}>Reset</button>
          </div>
        </div>
        <div className="seg-tabs" role="tablist" aria-label="Practice">
          <button role="tab" aria-selected={practiceTab === 'here'} onClick={() => setPracticeTab('here')}>
            Who’s here · {n}
          </button>
          <button role="tab" aria-selected={practiceTab === 'scrimmage'} onClick={() => setPracticeTab('scrimmage')}>
            Scrimmage{teams ? ` · ${teams.length === 2 ? teams.map((t) => t.length).join(' v ') : `${teams.length} teams`}` : ''}
          </button>
        </div>
        <div className="roster">
          {practiceTab === 'here' ? (
            <>
              {checkInHeader}
              {kids.length === 0 ? noKids : checkInTiles}
            </>
          ) : teams ? (
            <>
              <div className="group-h">
                <span>{teams.map((t) => t.length).join(' v ')}</span>
                <span className="hint">Tap a kid to move them</span>
              </div>
              <div className={`teams n${teams.length}`}>
                {teams.map((side, i) => {
                  const sideKids = side.map((id) => kids.find((k) => k.id === id)).filter((k): k is Kid => !!k)
                  const mix = fieldGroups
                    .map((g) => [g.name, sideKids.filter((k) => k.groups.includes(g.id)).length] as const)
                    .filter(([, c]) => c > 0)
                    .map(([name, c]) => `${name} ${c}`)
                    .join(' · ')
                  return (
                    <section key={i} className={`team-col t${i}`} aria-label={TEAM_NAMES[i]}>
                      <h3 className="team-h">
                        {TEAM_NAMES[i]} · {sideKids.length}
                      </h3>
                      {mix && <p className="coverage">{mix}</p>}
                      {sideKids.map((k) => {
                        const gn = groups.filter((g) => k.groups.includes(g.id)).map((g) => g.name)
                        const to = (i + 1) % teams.length
                        return (
                          <button
                            key={k.id}
                            className="team-kid"
                            onClick={() => {
                              live.dispatch([{ t: 'moveKid', id: k.id, to }])
                              buzz(20)
                              toast(`${k.name} to ${TEAM_NAMES[to]}`)
                            }}
                            aria-label={`${k.name}${gn.length ? ` (${gn.join(', ')})` : ''}, on ${TEAM_NAMES[i]}. Tap to move to ${TEAM_NAMES[to]}.`}
                          >
                            <span className="t-name">{k.name}</span>
                            {gn.length > 0 && <span className="t-groups">{gn.join(' · ')}</span>}
                          </button>
                        )
                      })}
                    </section>
                  )
                })}
              </div>
              <div className="btn-grid">
                <button className="ghost-btn" onClick={split}>Reshuffle</button>
                <button className="ghost-btn" onClick={() => live.dispatch([{ t: 'clearTeams' }])}>Clear teams</button>
              </div>
            </>
          ) : (
            <div className="stack">
              <p className="note">
                {n < 2
                  ? 'Check in at least 2 kids, then split them into teams here.'
                  : `Split the ${n} kids who are here into even teams${groups.length ? ', with position groups spread across them and Goalies on different teams' : ''}. Late arrivals join the smaller team.`}
              </p>
              <div className="chips pair">
                {[2, 3].map((c) => (
                  <button key={c} className="chip" aria-pressed={teamCount === c} onClick={() => setTeamCount(c)}>
                    {c} teams
                  </button>
                ))}
              </div>
              <button className="go-btn" disabled={n < 2} onClick={split}>
                Split {n} into {teamCount} teams
              </button>
            </div>
          )}
        </div>
        <div className="cta">
          <button className="go-btn" disabled={busy} onClick={() => endSession('finish')}>
            End practice
          </button>
        </div>
        {menu}
        {toastEl}
      </main>
    )
  }

  // ================= GAME: CHECK-IN =================
  if (st.phase === 'checkin') {
    return (
      <main className="field-app checkin">
        <header className="f-top">
          <h1 className="f-title">Who’s here?</h1>
          {sync}
          {topButtons}
        </header>
        <div className="team-chip">
          <span className="name">{teamName}</span>
          <span className="line">
            <span className="badge">{age}</span>
            <span className="badge">{formatLabel(S)}</span> {S.periods} × {S.periodMin} min
            {marks.length ? ` · swaps at ${marks.map((m) => `${m / MIN}′`).join(', ')} + breaks` : ' · swaps at breaks'}
          </span>
        </div>
        <div className="roster">
          {checkInHeader}
          {kids.length === 0 ? noKids : checkInTiles}
        </div>
        <div className="cta">
          <button className="go-btn" disabled={n === 0} onClick={makeLineup}>
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
        {menu}
        {toastEl}
      </main>
    )
  }

  // ================= GAME =================
  const c = st.clock
  const pre = !off
  const pairs = suggestSwaps(st, kids, rules, groups)
  const nextMark = marks[st.marksDone]
  const due = !pre && !st.over && !st.final && nextMark !== undefined && c.elapsed >= nextMark && pairs.length > 0
  const hereKids = kids.filter((k) => ks(k.id).here)
  const total = hereKids.reduce((s, k) => s + ks(k.id).ms, 0)
  const maxMs = Math.max(1, ...hereKids.map((k) => ks(k.id).ms))
  const avg = hereKids.length ? total / hereKids.length : 0
  const sel = selected ? kids.find((k) => k.id === selected) : undefined
  const selP = selected ? ks(selected) : undefined
  const keeper = kids.find((k) => ks(k.id).here && ks(k.id).gk)
  const onField = kids.filter((k) => ks(k.id).here && ks(k.id).on)
  const outfield = onField.filter((k) => !ks(k.id).gk)
  const coverage = fieldGroups.map((gr) => `${gr.name} ${outfield.filter((k) => k.groups.includes(gr.id)).length}`).join(' · ')
  const sharesFieldGroup = (a: Kid, b: Kid) => a.groups.some((id) => !keeperIds.has(id) && b.groups.includes(id))
  const groupNames = (k: Kid) => groups.filter((gr) => k.groups.includes(gr.id)).map((gr) => gr.name)

  const tileGroups: { title: string; hint?: string; empty: string; list: Kid[] }[] = [
    { title: 'On field', hint: 'Tap two players to swap', empty: 'Nobody on the field.', list: onField },
    { title: 'Bench', empty: 'Nobody on the bench.', list: kids.filter((k) => ks(k.id).here && !ks(k.id).on) },
    { title: 'Not here', hint: 'Tap a late arrival', empty: 'Everyone showed up.', list: kids.filter((k) => !ks(k.id).here) },
  ]

  let call: React.ReactNode
  if (sel && selP) {
    const canKeep = S.keeper && selP.on && !selP.gk
    const matches = fieldGroups.length > 0 && kids.some((k) => ks(k.id).here && ks(k.id).on !== selP.on && sharesFieldGroup(sel, k))
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
                act(`${sel.name} in goal`, { t: 'keeper', id: sel.id })
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
  } else if (st.final) {
    call = (
      <>
        <div className="call-top">
          <span className="eyebrow">Full time</span>
          <span className="countdown">Us {st.us} – {st.them} Them</span>
        </div>
        <button className="go-btn" onClick={() => endSession('finish')} disabled={busy}>
          {busy ? 'Saving…' : 'Save game'}
        </button>
        <div className="btn-grid">
          <button className="ghost-btn" onClick={() => setSheet('log')}>
            Subs by {S.periods === 2 ? 'half' : S.periods === 4 ? 'quarter' : 'period'}
          </button>
          <button className="ghost-btn" onClick={() => (armed === 'discard' ? endSession('discard') : setArmed('discard'))}>
            {armed === 'discard' ? 'Tap again to discard' : 'Discard'}
          </button>
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
          <button className="ghost-btn" onClick={makeLineup}>Reshuffle</button>
          <button className="ghost-btn" onClick={() => live.dispatch([{ t: 'toCheckin' }])}>Back to check-in</button>
        </div>
      </>
    )
  } else {
    const countdown = !pairs.length ? '' : st.over || due ? 'Swap now' : nextMark !== undefined ? `in ${mmss(nextMark - c.elapsed)}` : 'at the break'
    call = (
      <>
        <div className="call-top">
          <span className="eyebrow">{st.over ? breakName(S.periods) : 'Next swap'}</span>
          <span className="countdown">{countdown}</span>
        </div>
        {pairs.length > 0 ? (
          <>
            <div className="pairs">
              <span className="h">In</span>
              <span />
              <span className="h" style={{ textAlign: 'right' }}>Out</span>
              {pairs.map(([i, o]) => (
                <PairRow key={i.id + o.id} inName={i.name} inMin={mins(ks(i.id).ms)} outName={o.name} outMin={mins(ks(o.id).ms)} />
              ))}
            </div>
            <button className="go-btn" onClick={() => swap(pairs)}>
              Swap{pairs.length > 1 ? ` ${pairs.length}` : ''}
            </button>
            {due && (
              <button className="ghost-btn" onClick={() => live.dispatch([{ t: 'skipMark' }])}>
                Skip this swap
              </button>
            )}
          </>
        ) : (
          !st.over && <p>No one on the bench. Everyone plays.</p>
        )}
      </>
    )
  }

  return (
    <main className="field-app game">
      <header className="f-top">
        <div className="score" aria-live="polite">
          <span>Us</span>
          <span className="num">{st.us}</span>
          <span className="num">–</span>
          <span className="num">{st.them}</span>
        </div>
        {sync}
        {topButtons}
      </header>

      <div className="clock-wrap">
        <div className={`clock${c.running ? ' running' : ''}`} role="timer" aria-label={`${periodName(S.periods, c.period)}, ${mmss(periodMs - c.elapsed)} left`}>
          <span className="period">
            {st.final ? 'Full time' : st.over ? `End of ${periodName(S.periods, c.period)}` : periodName(S.periods, c.period)}
          </span>
          <span className="time">{mmss(periodMs - c.elapsed)}</span>
          <span className={`state${!c.running && !st.final ? ' paused' : ''}`}>
            {st.final ? 'Game over' : st.over ? 'Break' : c.running ? 'Running' : pre ? 'Ready' : 'Paused'}
          </span>
          <span className="clock-bar" aria-hidden="true">
            <i style={{ width: `${Math.min(100, (c.elapsed / periodMs) * 100)}%` }} />
            {marks.map((m, i) => (
              <b key={m} className={i < st.marksDone ? 'done' : undefined} style={{ left: `${(m / periodMs) * 100}%` }} />
            ))}
          </span>
        </div>
        {!st.final && (
          <button className={`start-btn${c.running ? ' pause' : ''}`} onClick={() => live.dispatch([{ t: c.running ? 'pause' : 'start' }])}>
            {c.running
              ? 'Pause'
              : st.over
                ? `Start ${periodName(S.periods, c.period + 1)}`
                : pre
                  ? `Start ${periodName(S.periods, 1)}`
                  : 'Resume'}
          </button>
        )}
        {!st.final && (
          <div className="clock-strip">
            {!st.over && (
              <>
                <button onClick={() => live.dispatch([{ t: 'adjust', ms: -MIN }])} aria-label="Take a minute off the clock">−1′</button>
                <button onClick={() => live.dispatch([{ t: 'adjust', ms: MIN }])} aria-label="Add a minute to the clock">+1′</button>
              </>
            )}
            <span className="spacer" />
            <button className="end" onClick={() => act(endPeriodLabel(S.periods, st.over ? c.period + 1 : c.period), { t: 'endPeriod' })}>
              {endPeriodLabel(S.periods, st.over ? c.period + 1 : c.period)}
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
                  const p = ks(k.id)
                  const owed = p.here && !p.on && avg > MIN && p.ms < avg - Math.max(MIN, avg * 0.2)
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
        <button onClick={undo} disabled={!undoStack.current.length}>↶ Undo</button>
        <button className="goal" onClick={() => act('Goal for us', { t: 'goal', side: 'us', d: 1 })}>+ Us</button>
        <button className="goal" onClick={() => act('Goal for them', { t: 'goal', side: 'them', d: 1 })}>+ Them</button>
      </nav>

      {sheet === 'log' && (
        <div className="sheet-wrap" onClick={(e) => e.target === e.currentTarget && setSheet(null)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="logTitle">
            <div className="f-top">
              <h2 id="logTitle" className="f-title">Game log</h2>
              <button className="icon-btn" onClick={() => setSheet(null)} aria-label="Close">✕</button>
            </div>
            <GameLog log={st.log} periods={S.periods} periodMs={periodMs} names={names} />
          </div>
        </div>
      )}
      {menu}
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

import { periodName } from './formats'
import { MIN, kickedOff, project, type LiveState, type Rules } from './live'

// One line describing a live session, for the team and home pages.
export function liveSummary(state: LiveState, rules: Rules, now: number) {
  const st = project(state, now, rules)
  const here = Object.values(st.kids).filter((k) => k.here).length
  if (st.kind === 'practice') return `${here} here`
  if (st.phase === 'checkin') return `Checking in · ${here} here`
  if (st.final) return `Full time · ${st.us}–${st.them}`
  const left = Math.max(0, rules.periodMin * MIN - st.clock.elapsed)
  const clock = `${Math.floor(left / MIN)}:${String(Math.floor((left % MIN) / 1000)).padStart(2, '0')} left`
  const where = st.over ? `Break after ${periodName(rules.periods, st.clock.period)}` : `${periodName(rules.periods, st.clock.period)} · ${clock}`
  const status = st.over ? '' : st.clock.running ? ' · running' : kickedOff(st) ? ' · paused' : ' · not started'
  return `${where}${status} · ${st.us}–${st.them} · ${here} here`
}

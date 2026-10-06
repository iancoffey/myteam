import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  MIN,
  apply,
  applyAll,
  buildLineup,
  inverseOf,
  newState,
  parseAction,
  parseTimed,
  project,
  splitTeams,
  subMarks,
  suggestSwaps,
  type Action,
  type Kid,
  type LiveState,
  type Rules,
} from './live'

const r7: Rules = { periods: 2, periodMin: 25, subMin: 6, keeper: true, onField: 7 }
const r4: Rules = { periods: 8, periodMin: 4, subMin: 0, keeper: false, onField: 4 }
const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']
const roster = new Set(ids)
const T0 = 1_000_000

function liveGame(r: Rules, here = ids, on = ids.slice(0, r.onField), gk: string | null = r.keeper ? on[0] : null) {
  const st = newState('game', ids, T0)
  for (const id of here) apply(st, { t: 'here', id, here: true }, T0, r, roster)
  apply(st, { t: 'lineup', on, gk }, T0, r, roster)
  return st
}
const step = (st: LiveState, a: Action, at: number, r: Rules) => apply(st, a, at, r, roster)

test('swap marks within a period skip ones near the end', () => {
  assert.deepEqual(subMarks({ periodMin: 25, subMin: 6 }), [6 * MIN, 12 * MIN, 18 * MIN])
  assert.deepEqual(subMarks({ periodMin: 12, subMin: 6 }), [6 * MIN])
  assert.deepEqual(subMarks({ periodMin: 4, subMin: 0 }), [])
})

test('clock and on-field minutes advance only while running, and read the same from any phone', () => {
  const st = liveGame(r7)
  step(st, { t: 'start' }, T0, r7)
  const at3 = project(st, T0 + 3 * MIN, r7)
  assert.equal(at3.clock.elapsed, 3 * MIN)
  assert.equal(at3.kids.a.ms, 3 * MIN)
  assert.equal(at3.kids.h.ms, 0, 'bench kid gains nothing')
  step(st, { t: 'pause' }, T0 + 3 * MIN, r7)
  assert.equal(project(st, T0 + 10 * MIN, r7).clock.elapsed, 3 * MIN, 'paused clock holds')
})

test('the period ends by itself at zero, and the last one is full time', () => {
  const st = liveGame(r7)
  step(st, { t: 'start' }, T0, r7)
  const end1 = project(st, T0 + 30 * MIN, r7)
  assert.equal(end1.over, true)
  assert.equal(end1.final, false)
  assert.equal(end1.clock.elapsed, 25 * MIN)
  assert.equal(end1.kids.a.ms, 25 * MIN, 'minutes stop at the end of the period')
  step(st, { t: 'start' }, T0 + 31 * MIN, r7) // start 2nd half
  assert.equal(st.clock.period, 2)
  assert.equal(st.marksDone, 0)
  assert.equal(project(st, T0 + 60 * MIN, r7).final, true)
})

test('a swap at a mark handles it; an early swap counts for the mark ahead', () => {
  const st = liveGame(r7)
  step(st, { t: 'start' }, T0, r7)
  step(st, { t: 'swap', pairs: [['h', 'b']] }, T0 + 6 * MIN + 2000, r7)
  assert.equal(st.marksDone, 1)
  step(st, { t: 'swap', pairs: [['i', 'c']] }, T0 + 11 * MIN + 30_000, r7) // 30s before the 12:00 mark
  assert.equal(st.marksDone, 2)
  assert.equal(st.log.filter((e) => e.k === 'sub').length, 2)
})

test('invalid swaps are ignored and the keeper role moves with the swap', () => {
  const st = liveGame(r7)
  step(st, { t: 'swap', pairs: [['b', 'c']] }, T0, r7) // both on the field
  assert.equal(st.kids.b.on && st.kids.c.on, true)
  step(st, { t: 'swap', pairs: [['h', 'a']] }, T0, r7) // a is keeper
  assert.equal(st.kids.h.gk, true)
  assert.equal(st.kids.a.gk, false)
})

test('undoing a swap swaps back, removes it from the log and restores the mark', () => {
  const st = liveGame(r7)
  step(st, { t: 'start' }, T0, r7)
  const a: Action = { t: 'swap', pairs: [['h', 'b']] }
  const before = project(st, T0 + 6 * MIN + 1000, r7)
  step(st, a, T0 + 6 * MIN + 1000, r7)
  for (const inv of inverseOf(before, a)) step(st, inv, T0 + 6 * MIN + 5000, r7)
  assert.equal(st.kids.b.on, true)
  assert.equal(st.kids.h.on, false)
  assert.equal(st.marksDone, 0)
  assert.equal(st.log.length, 0)
})

test('ending a period the clock never ran credits a full period; undo restores it', () => {
  const st = liveGame(r7)
  const before = project(st, T0 + 1000, r7)
  step(st, { t: 'endPeriod' }, T0 + 1000, r7)
  assert.equal(st.over, true)
  assert.equal(st.kids.a.ms, 25 * MIN)
  for (const inv of inverseOf(before, { t: 'endPeriod' })) step(st, inv, T0 + 2000, r7)
  assert.equal(st.over, false)
  assert.equal(st.kids.a.ms, 0)
  // During a break, End ends the next period untimed too (coach who never keeps time).
  step(st, { t: 'endPeriod' }, T0 + 3000, r7)
  step(st, { t: 'endPeriod' }, T0 + 4000, r7)
  assert.equal(st.final, true)
  assert.equal(st.kids.a.ms, 50 * MIN)
})

test('clock nudges move on-field minutes with them', () => {
  const st = liveGame(r7)
  step(st, { t: 'start' }, T0, r7)
  step(st, { t: 'adjust', ms: MIN }, T0 + 2 * MIN, r7)
  const p = project(st, T0 + 2 * MIN, r7)
  assert.equal(p.clock.elapsed, 3 * MIN)
  assert.equal(p.kids.a.ms, 3 * MIN)
  step(st, { t: 'adjust', ms: -10 * MIN }, T0 + 2 * MIN, r7)
  assert.equal(st.clock.elapsed, 0, 'never below zero')
})

test('changes made with no signal replay at the time they happened', () => {
  const st = liveGame(r4)
  const server = applyAll(
    st,
    [
      { a: { t: 'start' }, at: T0 + 1000 },
      { a: { t: 'swap', pairs: [['e', 'a']] }, at: T0 + 2 * MIN },
    ],
    T0 + 3 * MIN, // reached the server later
    r4,
    roster,
  )
  const now = project(server, T0 + 3 * MIN, r4)
  assert.equal(now.clock.elapsed, 3 * MIN - 1000)
  assert.equal(now.kids.a.ms, 2 * MIN - 1000, 'a played until the swap')
  assert.equal(now.kids.e.ms, MIN, 'e played from the swap')
  const sub = server.log.find((e) => e.k === 'sub')
  assert.equal(sub?.t, 2 * MIN - 1000)
})

test('timestamps from the future or before the state are clamped', () => {
  const st = liveGame(r4)
  const s = applyAll(st, [{ a: { t: 'start' }, at: T0 + 99 * MIN }], T0 + MIN, r4, roster)
  assert.equal(project(s, T0 + MIN, r4).clock.elapsed, 0, 'future start is applied at server time')
  const s2 = applyAll(st, [{ a: { t: 'start' }, at: 0 }], T0 + MIN, r4, roster)
  assert.equal(project(s2, T0 + MIN, r4).clock.elapsed, MIN, 'stale start is applied no earlier than the state')
})

test('a tap waiting behind an earlier request still lands at its own time', () => {
  const st = liveGame(r4)
  const afterLineup = applyAll(st, [{ a: { t: 'here', id: 'h', here: true }, at: T0 + 1000 }], T0 + 3000, r4, roster) // slow request
  const s = applyAll(afterLineup, [{ a: { t: 'start' }, at: T0 + 1500 }], T0 + 4000, r4, roster)
  assert.equal(project(s, T0 + 4000, r4).clock.elapsed, 2500, 'clock starts at the tap, not when the first request finished')
})

test('late arrival is logged and can be undone', () => {
  const st = liveGame(r4, ids.slice(0, 6))
  step(st, { t: 'start' }, T0, r4)
  const a: Action = { t: 'here', id: 'j', here: true }
  const before = project(st, T0 + MIN, r4)
  step(st, a, T0 + MIN, r4)
  assert.equal(st.log.at(-1)?.k, 'arrive')
  for (const inv of inverseOf(before, a)) step(st, inv, T0 + MIN, r4)
  assert.equal(st.kids.j.here, false)
  assert.equal(st.log.length, 0)
})

test('goals and their undo', () => {
  const st = liveGame(r4)
  step(st, { t: 'start' }, T0, r4)
  step(st, { t: 'goal', side: 'us', d: 1 }, T0 + MIN, r4)
  step(st, { t: 'goal', side: 'us', d: -1 }, T0 + MIN, r4)
  step(st, { t: 'goal', side: 'us', d: -1 }, T0 + MIN, r4)
  assert.equal(st.us, 0)
  assert.equal(st.log.length, 0)
})

test('back to check-in only before kickoff', () => {
  const st = liveGame(r4)
  step(st, { t: 'toCheckin' }, T0, r4)
  assert.equal(st.phase, 'checkin')
  apply(st, { t: 'lineup', on: ['a', 'b', 'c', 'd'], gk: null }, T0, r4, roster)
  step(st, { t: 'start' }, T0, r4)
  step(st, { t: 'toCheckin' }, T0 + 1000, r4)
  assert.equal(st.phase, 'live')
})

test('drill timer counts down, stops at zero and restarts from full', () => {
  const st = newState('practice', ids, T0)
  apply(st, { t: 'drillSet', ms: 5 * MIN }, T0, r4, roster)
  apply(st, { t: 'drillStart' }, T0, r4, roster)
  assert.equal(project(st, T0 + 2 * MIN, r4).drill.elapsed, 2 * MIN)
  const done = project(st, T0 + 9 * MIN, r4)
  assert.equal(done.drill.elapsed, 5 * MIN)
  assert.equal(done.drill.running, false)
  apply(st, { t: 'drillStart' }, T0 + 9 * MIN, r4, roster)
  assert.equal(st.drill.elapsed, 0)
})

test('lineup covers every position group, keeper from the Goalie group, fewest minutes first', () => {
  const groups = [
    { id: 'L', name: 'Left' },
    { id: 'C', name: 'Center' },
    { id: 'R', name: 'Right' },
    { id: 'G', name: 'Goalie' },
  ]
  const kids: Kid[] = ids.map((id, n) => ({ id, name: id, groups: [['L', 'C', 'R'][n % 3]].concat(id === 'j' ? ['G'] : []) }))
  const st = newState('game', ids, T0)
  for (const id of ids) apply(st, { t: 'here', id, here: true }, T0, r7, roster)
  const lu = buildLineup(st, kids, r7, groups, { a: 99 * MIN })
  assert.equal(lu.on.length, 7)
  assert.equal(lu.gk, 'j')
  assert.ok(!lu.on.includes('a'), 'the kid with the most season minutes sits first')
  for (const g of ['L', 'C', 'R']) assert.ok(lu.on.filter((id) => id !== 'j').some((id) => kids.find((k) => k.id === id)!.groups.includes(g)))
})

test('suggested swaps prefer the same position group and never the keeper', () => {
  const groups = [
    { id: 'L', name: 'Left' },
    { id: 'R', name: 'Right' },
  ]
  const kids: Kid[] = ids.map((id) => ({ id, name: id, groups: ['a', 'b', 'h'].includes(id) ? ['L'] : ['R'] }))
  const st = liveGame(r7)
  step(st, { t: 'start' }, T0, r7)
  const p = project(st, T0 + 6 * MIN, r7)
  const pairs = suggestSwaps(p, kids, r7, groups)
  const hPair = pairs.find(([i]) => i.id === 'h')!
  assert.equal(hPair[1].id, 'b', 'h (Left) replaces b (Left), not a keeper or a Right player')
  assert.ok(pairs.every(([, o]) => o.id !== 'a'))
})

test('network input is validated', () => {
  assert.equal(parseAction({ t: 'nuke' }), null)
  assert.equal(parseAction({ t: 'here', id: 'x'.repeat(65), here: true }), null)
  assert.equal(parseAction({ t: 'adjust', ms: 99 * MIN }), null)
  assert.equal(parseAction({ t: 'swap', pairs: [['a']] }), null)
  assert.deepEqual(parseAction({ t: 'goal', side: 'us', d: 1, extra: 'x' }), { t: 'goal', side: 'us', d: 1 })
  assert.equal(parseTimed({ a: { t: 'start' }, at: 'soon' }), null)
})

test('scrimmage: 9 kids split 5 v 4, goalies one per side, position groups spread', () => {
  const groups = [
    { id: 'L', name: 'Left' },
    { id: 'C', name: 'Center' },
    { id: 'R', name: 'Right' },
    { id: 'G', name: 'Goalie' },
  ]
  const nine = ids.slice(0, 9)
  const kids: Kid[] = nine.map((id, n) => ({ id, name: id, groups: id === 'a' || id === 'b' ? ['G'] : [['L', 'C', 'R'][n % 3]] }))
  const st = newState('practice', ids, T0)
  for (const id of nine) apply(st, { t: 'here', id, here: true }, T0, r4, roster)
  for (let seed = 1; seed < 40; seed++) {
    let x = seed
    const rand = () => ((x = (x * 9301 + 49297) % 233280) / 233280)
    const teams = splitTeams(st, kids, groups, 2, rand)
    assert.deepEqual(teams.map((t) => t.length).sort(), [4, 5])
    assert.equal(new Set(teams.flat()).size, 9, 'everyone placed once')
    for (const t of teams) assert.equal(t.filter((id) => id === 'a' || id === 'b').length, 1, 'one goalie each')
    for (const g of ['L', 'C', 'R']) {
      const per = teams.map((t) => t.filter((id) => kids.find((k) => k.id === id)!.groups.includes(g)).length)
      assert.ok(Math.abs(per[0] - per[1]) <= 1, `group ${g} spread ${per}`)
    }
  }
  assert.deepEqual(splitTeams(st, kids, [], 3).map((t) => t.length).sort(), [3, 3, 3])
})

test('scrimmage sides follow check-in, and a tap moves a kid across', () => {
  const st = newState('practice', ids, T0)
  for (const id of ids.slice(0, 5)) apply(st, { t: 'here', id, here: true }, T0, r4, roster)
  apply(st, { t: 'teams', teams: [['a', 'b', 'c'], ['d', 'e'], ['zz']] }, T0, r4, roster)
  assert.deepEqual(st.teams, [['a', 'b', 'c'], ['d', 'e'], []], 'unknown kids dropped')
  apply(st, { t: 'clearTeams' }, T0, r4, roster)
  apply(st, { t: 'teams', teams: [['a', 'b', 'c'], ['d', 'e']] }, T0, r4, roster)
  apply(st, { t: 'here', id: 'f', here: true }, T0, r4, roster)
  assert.deepEqual(st.teams![1], ['d', 'e', 'f'], 'late arrival joins the smaller side')
  apply(st, { t: 'here', id: 'b', here: false }, T0, r4, roster)
  assert.deepEqual(st.teams![0], ['a', 'c'], 'a kid who leaves drops off')
  apply(st, { t: 'moveKid', id: 'a', to: 1 }, T0, r4, roster)
  assert.deepEqual(st.teams, [['c'], ['d', 'e', 'f', 'a']])
  apply(st, { t: 'allHere', here: false }, T0, r4, roster)
  assert.equal(st.teams, null)
  const game = liveGame(r4)
  apply(game, { t: 'teams', teams: [['a'], ['b']] }, T0, r4, roster)
  assert.equal(game.teams, null, 'games have no scrimmage sides')
  assert.equal(parseAction({ t: 'teams', teams: [['a']] }), null)
  assert.deepEqual(parseAction({ t: 'moveKid', id: 'a', to: 1 }), { t: 'moveKid', id: 'a', to: 1 })
})

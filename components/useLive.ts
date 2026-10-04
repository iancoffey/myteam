'use client'

import { useCallback, useEffect, useReducer, useRef } from 'react'
import { advance, apply, type Action, type ClientSession, type LiveState, type Rules, type Timed } from '@/lib/live'

type Pending = Timed & { n: number }
type Stored = { sid: string; confirmed: ClientSession; pending: Pending[] }
export type Initial = { session: ClientSession | null; now: number }

const POLL_MS = 2000

// Keeps one live game or practice in sync across every coach's phone.
// - Your taps apply instantly (on top of the last state the server confirmed) and are sent in order.
// - Other coaches' changes arrive by polling every couple of seconds.
// - With no signal, taps wait on this phone (surviving a reload) and are sent when it's back;
//   each carries the time it happened, so the clock and minutes still come out right.
// - Clocks use server time, so every phone shows the same countdown.
export function useLive(teamId: string, initial: Initial, rules: Rules, roster: Set<string>) {
  const key = `myteam.live.${teamId}`
  const [, force] = useReducer((x: number) => x + 1, 0)
  const data = useRef<{ confirmed: ClientSession | null; pending: Pending[] }>({ confirmed: initial.session, pending: [] })
  const offset = useRef(initial.now - Date.now())
  const seq = useRef(0)
  const inflight = useRef(false)
  const ended = useRef(initial.session === null)
  const online = useRef(true)

  const serverNow = useCallback(() => Date.now() + offset.current, [])

  const save = useCallback(() => {
    try {
      const c = data.current.confirmed
      if (c && !ended.current) localStorage.setItem(key, JSON.stringify({ sid: c.id, confirmed: c, pending: data.current.pending } satisfies Stored))
      else localStorage.removeItem(key)
    } catch {}
  }, [key])

  const markEnded = useCallback(() => {
    ended.current = true
    data.current.pending = []
    save()
    force()
  }, [save])

  const syncClock = (body: { now?: number } | null, t0: number, header?: string | null) => {
    const now = body?.now ?? Number(header)
    if (now) offset.current = now - (t0 + Date.now()) / 2
  }

  const flush = useCallback(async (): Promise<void> => {
    const c = data.current.confirmed
    if (inflight.current || !c || !data.current.pending.length || ended.current) return
    inflight.current = true
    const batch = data.current.pending.slice(0, 50)
    const t0 = Date.now()
    let again = false
    try {
      const res = await fetch(`/api/teams/${teamId}/live/${c.id}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ actions: batch.map(({ a, at }) => ({ a, at })) }),
      })
      if (res.status === 404) return markEnded()
      if (!res.ok) throw new Error(String(res.status))
      const body = (await res.json()) as { session: ClientSession | null; now: number }
      syncClock(body, t0)
      const sent = batch[batch.length - 1].n
      data.current.pending = data.current.pending.filter((p) => p.n > sent)
      if (!body.session) return markEnded()
      data.current.confirmed = body.session
      online.current = true
      again = data.current.pending.length > 0
      save()
      force()
    } catch {
      online.current = false
      force()
    } finally {
      inflight.current = false
    }
    if (again) await flush()
  }, [teamId, markEnded, save])

  const poll = useCallback(async () => {
    if (inflight.current || ended.current || document.visibilityState !== 'visible') return
    if (data.current.pending.length) return flush()
    const c = data.current.confirmed
    const t0 = Date.now()
    try {
      const res = await fetch(`/api/teams/${teamId}/live?rev=${c?.rev ?? -1}`, { cache: 'no-store' })
      if (res.status === 404) return markEnded()
      if (res.status === 204) {
        syncClock(null, t0, res.headers.get('x-now'))
        online.current = true
        return
      }
      if (!res.ok) throw new Error(String(res.status))
      const body = (await res.json()) as { session: ClientSession | null; now: number }
      syncClock(body, t0)
      online.current = true
      if (!body.session || (c && body.session.id !== c.id)) return markEnded()
      data.current.confirmed = body.session
      save()
      force()
    } catch {
      online.current = false
      force()
    }
  }, [teamId, flush, markEnded, save])

  // Pick up taps that were waiting on this phone for this same session.
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(key) ?? 'null') as Stored | null
      if (s && initial.session && s.sid === initial.session.id) {
        if (s.confirmed.rev > (data.current.confirmed?.rev ?? -1)) data.current.confirmed = s.confirmed
        data.current.pending = s.pending ?? []
        seq.current = Math.max(0, ...data.current.pending.map((p) => p.n))
        force()
        void flush()
      } else if (s) {
        localStorage.removeItem(key)
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const iv = setInterval(poll, POLL_MS)
    const wake = () => void poll()
    document.addEventListener('visibilitychange', wake)
    window.addEventListener('online', wake)
    return () => {
      clearInterval(iv)
      document.removeEventListener('visibilitychange', wake)
      window.removeEventListener('online', wake)
    }
  }, [poll])

  const dispatch = useCallback(
    (actions: Action[]) => {
      if (ended.current || !actions.length) return
      for (const a of actions) data.current.pending.push({ a, at: serverNow(), n: ++seq.current })
      save()
      force()
      void flush()
    },
    [flush, save, serverNow],
  )

  // Finish (a game is saved) or discard. Waiting taps are sent first so nothing is lost.
  const end = useCallback(
    async (op: 'finish' | 'discard'): Promise<boolean> => {
      const c = data.current.confirmed
      if (!c) return true
      if (op === 'finish') {
        for (let i = 0; i < 5 && data.current.pending.length; i++) await flush()
        if (data.current.pending.length) return false
      }
      try {
        const res = await fetch(`/api/teams/${teamId}/live/${c.id}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ op }),
        })
        if (!res.ok && res.status !== 404) return false
        markEnded()
        return true
      } catch {
        return false
      }
    },
    [teamId, flush, markEnded],
  )

  // What to show: the confirmed state plus this phone's waiting taps, brought up to now.
  const c = data.current.confirmed
  let state: LiveState | null = null
  if (c && !ended.current) {
    state = structuredClone(c.state)
    const now = serverNow()
    for (const p of data.current.pending) apply(state, p.a, Math.max(state.clock.at, Math.min(p.at, now)), rules, roster)
    advance(state, now, rules)
  }

  return {
    state,
    kind: c?.kind ?? 'game',
    ended: ended.current,
    online: online.current,
    waiting: data.current.pending.length,
    dispatch,
    end,
  }
}

'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

// The game or practice in progress: resume it, end it (a game is saved) or throw it away.
export function SessionCard({
  teamId,
  sessionId,
  kind,
  summary,
  canSave,
}: {
  teamId: string
  sessionId: string
  kind: 'game' | 'practice'
  summary: string
  canSave: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [armed, setArmed] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 3000)
    return () => clearTimeout(t)
  }, [armed])

  async function end(op: 'finish' | 'discard') {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/teams/${teamId}/live/${sessionId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ op }),
      })
      if (!res.ok && res.status !== 404) throw new Error(String(res.status))
      router.refresh()
    } catch {
      setError('Couldn’t reach the server. Try again.')
    } finally {
      setBusy(false)
      setArmed(false)
    }
  }

  const what = kind === 'game' ? 'Game' : 'Practice'
  return (
    <section className="card live-card">
      <div className="event-when">
        <span className="event-day">{what} in progress</span>
        <span className="pill">Live</span>
      </div>
      <p style={{ margin: 0 }}>{summary}</p>
      <Link href={`/teams/${teamId}/field`} className="btn primary big">Resume {what.toLowerCase()}</Link>
      <div className="btn-grid">
        <button className="btn" disabled={busy} onClick={() => end('finish')}>
          {kind === 'game' && canSave ? 'End & save' : 'End'}
        </button>
        <button className="btn danger" disabled={busy} onClick={() => (armed ? end('discard') : setArmed(true))}>
          {armed ? 'Tap again to discard' : 'Discard'}
        </button>
      </div>
      {error && <p className="msg error" role="alert">{error}</p>}
    </section>
  )
}

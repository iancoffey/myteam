'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

// One tap from the team to check-in: starts a game or practice that every coach on the team shares.
export function StartButtons({ teamId }: { teamId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState<null | 'game' | 'practice'>(null)
  const [error, setError] = useState<string | null>(null)

  async function start(kind: 'game' | 'practice') {
    setBusy(kind)
    setError(null)
    try {
      const res = await fetch(`/api/teams/${teamId}/live`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind }),
      })
      if (!res.ok) throw new Error(String(res.status))
      router.push(`/teams/${teamId}/field`)
    } catch {
      setError('Couldn’t start. Check your connection and try again.')
      setBusy(null)
    }
  }

  return (
    <div className="stack">
      <div className="btn-grid">
        <button className="btn primary big" disabled={!!busy} onClick={() => start('game')}>
          {busy === 'game' ? 'Starting…' : 'Start game'}
        </button>
        <button className="btn big" disabled={!!busy} onClick={() => start('practice')}>
          {busy === 'practice' ? 'Starting…' : 'Practice'}
        </button>
      </div>
      {error && <p className="msg error" role="alert">{error}</p>}
    </div>
  )
}

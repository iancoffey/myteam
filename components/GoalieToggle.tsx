'use client'

import { startTransition, useOptimistic, useState } from 'react'
import { setPlayerGoalie } from '@/app/actions'

// One tap: does this kid play goalie? Off means they're never put in goal.
export function GoalieToggle({ teamId, playerId, playsGoalie }: { teamId: string; playerId: string; playsGoalie: boolean }) {
  const [on, setOn] = useOptimistic(playsGoalie)
  const [error, setError] = useState<string | null>(null)
  function toggle() {
    const next = !on
    setError(null)
    startTransition(async () => {
      setOn(next)
      try {
        const res = await setPlayerGoalie({ teamId, playerId, playsGoalie: next })
        if (!res.ok) setError(res.error)
      } catch {
        setError('Couldn’t save. Check your connection and tap again.')
      }
    })
  }
  return (
    <div className="stack" style={{ gap: 6 }}>
      <button type="button" className="switch-row" role="switch" aria-checked={on} onClick={toggle}>
        <span>Plays goalie</span>
        <span className="switch" aria-hidden="true"><i /></span>
      </button>
      {error && <p className="msg error" role="alert">{error}</p>}
    </div>
  )
}

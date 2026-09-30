'use client'

import { startTransition, useOptimistic, useState } from 'react'
import { setPlayerGroups } from '@/app/actions'
import type { PositionGroup } from '@/lib/formats'

// Tap a chip to tag or untag a kid; the change shows immediately and saves in the background.
export function GroupChips({
  teamId,
  playerId,
  groups,
  selected,
}: {
  teamId: string
  playerId: string
  groups: PositionGroup[]
  selected: string[]
}) {
  const [optimistic, setOptimistic] = useOptimistic(selected)
  const [error, setError] = useState<string | null>(null)

  function toggle(id: string) {
    const next = optimistic.includes(id) ? optimistic.filter((x) => x !== id) : [...optimistic, id]
    setError(null)
    startTransition(async () => {
      setOptimistic(next)
      try {
        const res = await setPlayerGroups({ teamId, playerId, groupIds: next })
        if (!res.ok) setError(res.error)
      } catch {
        setError('Couldn’t save. Check your connection and tap again.')
      }
    })
  }

  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="tag-chips" role="group" aria-label="Position groups">
        {groups.map((g) => (
          <button key={g.id} type="button" className="tag-chip" aria-pressed={optimistic.includes(g.id)} onClick={() => toggle(g.id)}>
            {g.name}
          </button>
        ))}
      </div>
      {error && <p className="msg error" role="alert">{error}</p>}
    </div>
  )
}

'use client'

import { setSnack } from '@/app/actions'

export function SnackSelect({
  teamId,
  eventId,
  value,
  kids,
}: {
  teamId: string
  eventId: string
  value: string | null
  kids: { id: string; firstName: string }[]
}) {
  return (
    <form action={setSnack}>
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="eventId" value={eventId} />
      <label className="lbl" htmlFor={`snack-${eventId}`}>Snacks</label>
      <select
        // Remount when the saved value changes (e.g. after "Fill snack rotation") so the default updates.
        key={value ?? 'none'}
        id={`snack-${eventId}`}
        name="playerId"
        defaultValue={value ?? ''}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      >
        <option value="">Nobody yet</option>
        {kids.map((k) => (
          <option key={k.id} value={k.id}>{k.firstName}’s family</option>
        ))}
      </select>
    </form>
  )
}

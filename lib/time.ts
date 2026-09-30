// Event times are entered and shown in the team's time zone, regardless of where the server runs.

function offsetMs(utcMs: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs))
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return asUtc - utcMs
}

// "2026-10-04" + "09:00" in America/Chicago -> Date
export function zonedToDate(date: string, time: string, timeZone: string): Date | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  const tm = /^(\d{2}):(\d{2})$/.exec(time)
  if (!dm || !tm) return null
  const naive = Date.UTC(+dm[1], +dm[2] - 1, +dm[3], +tm[1], +tm[2])
  let utc = naive - offsetMs(naive, timeZone)
  // Second pass settles DST boundaries.
  utc = naive - offsetMs(utc, timeZone)
  return new Date(utc)
}

export function dateInputValue(d: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

export function timeInputValue(d: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d)
}

export function formatDay(d: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric' }).format(d)
}

export function formatTime(d: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(d)
}

export function isValidTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

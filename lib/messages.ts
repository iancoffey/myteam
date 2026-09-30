import type { Event, Team } from './db/schema'
import { formatDay, formatTime } from './time'

export function eventMessage(team: Team, e: Event, snackKid?: string) {
  const when = `${formatDay(e.startsAt, team.timeZone)} at ${formatTime(e.startsAt, team.timeZone)}`
  const what = e.kind === 'game' ? (e.opponent ? `Game vs ${e.opponent}` : 'Game') : 'Practice'
  const lines = [`${team.name}: ${what} ${when}${e.location ? ` at ${e.location}` : ''}.`]
  if (e.kind === 'game' && snackKid) lines.push(`Snacks: ${snackKid}’s family. Thank you!`)
  return lines.join('\n')
}

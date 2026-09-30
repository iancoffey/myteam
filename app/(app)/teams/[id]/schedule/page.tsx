import Link from 'next/link'
import { createEvent, deleteEvent, fillSnackRotation } from '@/app/actions'
import { ActionForm } from '@/components/ActionForm'
import { ConfirmButton } from '@/components/ConfirmButton'
import { MessageButtons } from '@/components/MessageButtons'
import { SnackSelect } from '@/components/SnackSelect'
import { getOwnedTeam, listGuardians, listPlayers, listUpcomingEvents } from '@/lib/data'
import { eventMessage } from '@/lib/messages'
import { dateInputValue, formatDay, formatTime } from '@/lib/time'

export default async function SchedulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const t = await getOwnedTeam(id)
  const [kids, parents, upcoming] = await Promise.all([listPlayers(t.id), listGuardians(t.id), listUpcomingEvents(t.id)])
  const phones = [...new Set(parents.map((p) => p.phone).filter((p): p is string => !!p))]
  const emails = [...new Set(parents.map((p) => p.email).filter((e): e is string => !!e))]
  const kidName = new Map(kids.map((k) => [k.id, k.firstName]))
  const needSnacks = upcoming.some((e) => e.kind === 'game' && !e.snackPlayerId)

  return (
    <main className="page">
      <header className="topbar">
        <Link href={`/teams/${t.id}`} className="back">← {t.name}</Link>
      </header>
      <h1 className="h1">Schedule</h1>

      <section className="card">
        <ActionForm action={createEvent} submitLabel="Add to schedule">
          <input type="hidden" name="teamId" value={t.id} />
          <div className="two">
            <div>
              <label className="lbl" htmlFor="kind">What</label>
              <select id="kind" name="kind" defaultValue="game">
                <option value="game">Game</option>
                <option value="practice">Practice</option>
              </select>
            </div>
            <div>
              <label className="lbl" htmlFor="opponent">Opponent</label>
              <input id="opponent" name="opponent" type="text" placeholder="Tigers" autoCapitalize="words" autoComplete="off" />
            </div>
          </div>
          <div className="two">
            <div>
              <label className="lbl" htmlFor="date">Date</label>
              <input id="date" name="date" type="date" defaultValue={dateInputValue(new Date(), t.timeZone)} required />
            </div>
            <div>
              <label className="lbl" htmlFor="time">Start</label>
              <input id="time" name="time" type="time" defaultValue="09:00" required />
            </div>
          </div>
          <div>
            <label className="lbl" htmlFor="location">Where</label>
            <input id="location" name="location" type="text" placeholder="Riverside Park, Field 3" autoComplete="off" />
          </div>
          <p className="note">Times are in {t.timeZone.replace(/_/g, ' ')}. Opponent is ignored for practices.</p>
        </ActionForm>
      </section>

      {needSnacks && kids.length > 0 && (
        <form action={fillSnackRotation}>
          <input type="hidden" name="teamId" value={t.id} />
          <button className="btn block">Fill snack rotation for open games</button>
        </form>
      )}

      <h2 className="h2">Upcoming · {upcoming.length}</h2>
      {upcoming.length === 0 && <p className="note">Add your games and practices above.</p>}
      <div className="list">
        {upcoming.map((e) => (
          <section key={e.id} className="card event">
            <div className="event-when">
              <span className="event-day">{formatDay(e.startsAt, t.timeZone)} · {formatTime(e.startsAt, t.timeZone)}</span>
              <span className={`pill ${e.kind}`}>{e.kind}</span>
            </div>
            <div>
              {e.kind === 'game' ? (e.opponent ? `vs ${e.opponent}` : 'Game') : 'Practice'}
              {e.location ? ` · ${e.location}` : ''}
            </div>
            {e.kind === 'game' && kids.length > 0 && (
              <SnackSelect teamId={t.id} eventId={e.id} value={e.snackPlayerId} kids={kids} />
            )}
            <MessageButtons
              phones={phones}
              emails={emails}
              subject={`${t.name}: ${e.kind} ${formatDay(e.startsAt, t.timeZone)}`}
              body={eventMessage(t, e, e.snackPlayerId ? kidName.get(e.snackPlayerId) : undefined)}
            />
            <form action={deleteEvent}>
              <input type="hidden" name="teamId" value={t.id} />
              <input type="hidden" name="eventId" value={e.id} />
              <ConfirmButton className="btn small danger" confirmLabel="Tap again to delete">Delete</ConfirmButton>
            </form>
          </section>
        ))}
      </div>
    </main>
  )
}

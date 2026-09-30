import type { Metadata } from 'next'
import { FieldMode } from '@/components/FieldMode'
import { getOwnedTeam, listPlayers, listUpcomingEvents, seasonMinutes } from '@/lib/data'
import { cleanGroups, type FormatKey } from '@/lib/formats'

export const metadata: Metadata = { title: 'Game day · myteam' }

export default async function FieldPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const t = await getOwnedTeam(id)
  const [kids, upcoming, season] = await Promise.all([listPlayers(t.id), listUpcomingEvents(t.id), seasonMinutes(t.id)])
  // Link the game to today's scheduled game if it starts within the next 12 hours (or started in the last 3).
  const groups = cleanGroups(t.groups)
  const groupIds = new Set(groups.map((g) => g.id))
  const soon = upcoming.find((e) => e.kind === 'game' && e.startsAt.getTime() < Date.now() + 12 * 60 * 60 * 1000)

  return (
    <FieldMode
      teamId={t.id}
      teamName={t.name}
      age={t.age}
      settings={{ format: t.format as FormatKey, onField: t.onField, keeper: t.keeper, periods: t.periods, periodMin: t.periodMin, subMin: t.subMin }}
      groups={groups}
      kids={kids.map((k) => ({ id: k.id, name: k.firstName, groups: k.groupIds.filter((id) => groupIds.has(id)) }))}
      seasonMs={season.ms}
      eventId={soon?.id ?? null}
      opponent={soon?.opponent ?? null}
    />
  )
}

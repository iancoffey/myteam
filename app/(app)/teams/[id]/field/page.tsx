import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { FieldMode } from '@/components/FieldMode'
import { getCoachTeam, getLive, seasonMinutes, sessionKids, teamSettings } from '@/lib/data'
import { toClient } from '@/lib/live-server'

export const metadata: Metadata = { title: 'Game day · myteam' }

export default async function FieldPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { team: t } = await getCoachTeam(id)
  const [row, { groups, kids }, season] = await Promise.all([getLive(t.id), sessionKids(t), seasonMinutes(t.id)])
  // Nothing running: start one from the team page.
  if (!row) redirect(`/teams/${t.id}`)
  return (
    <FieldMode
      teamId={t.id}
      teamName={t.name}
      age={t.age}
      settings={teamSettings(t)}
      groups={groups}
      kids={kids}
      seasonMs={season.ms}
      initial={{ session: toClient(row), now: Date.now() }}
    />
  )
}

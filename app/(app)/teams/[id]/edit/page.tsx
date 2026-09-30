import Link from 'next/link'
import { deleteTeam } from '@/app/actions'
import { ConfirmButton } from '@/components/ConfirmButton'
import { TeamForm } from '@/components/TeamForm'
import { getOwnedTeam } from '@/lib/data'
import { cleanGroups, isAge, type FormatKey } from '@/lib/formats'

export default async function EditTeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const t = await getOwnedTeam(id)
  return (
    <main className="page">
      <header className="topbar">
        <Link href={`/teams/${t.id}`} className="back">← {t.name}</Link>
      </header>
      <h1 className="h1">Team settings</h1>
      <TeamForm
        mode="edit"
        teamId={t.id}
        name={t.name}
        age={isAge(t.age) ? t.age : 'U6'}
        groups={cleanGroups(t.groups)}
        settings={{
          format: t.format as FormatKey,
          onField: t.onField,
          keeper: t.keeper,
          periods: t.periods,
          periodMin: t.periodMin,
          subMin: t.subMin,
        }}
      />
      <form action={deleteTeam} style={{ marginTop: 24 }}>
        <input type="hidden" name="teamId" value={t.id} />
        <ConfirmButton className="btn danger block" confirmLabel={`Tap again to delete ${t.name}`}>
          Delete team
        </ConfirmButton>
        <p className="note" style={{ marginTop: 8 }}>Deletes the roster, parents, schedule and game history.</p>
      </form>
    </main>
  )
}

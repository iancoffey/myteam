import Link from 'next/link'
import { addPlayers, removePlayer, renamePlayer } from '@/app/actions'
import { ActionForm } from '@/components/ActionForm'
import { ConfirmButton } from '@/components/ConfirmButton'
import { GroupChips } from '@/components/GroupChips'
import { getCoachTeam, listPlayers } from '@/lib/data'
import { cleanGroups } from '@/lib/formats'

export default async function RosterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { team: t } = await getCoachTeam(id)
  const kids = await listPlayers(t.id)
  const groups = cleanGroups(t.groups)

  return (
    <main className="page">
      <header className="topbar">
        <Link href={`/teams/${t.id}`} className="back">← {t.name}</Link>
      </header>
      <h1 className="h1">Roster</h1>
      <p className="note">Kids are first names only.</p>

      <section className="card">
        <ActionForm action={addPlayers} submitLabel="Add kids">
          <input type="hidden" name="teamId" value={t.id} />
          <label className="lbl" htmlFor="names">Add kids</label>
          <textarea id="names" name="names" placeholder={'Maya\nLeo\nAva'} autoCapitalize="words" autoComplete="off" spellCheck={false} style={{ minHeight: 96 }} />
          <p className="note">One first name per line. Two kids with the same name? Add an initial: “Liam B”.</p>
        </ActionForm>
      </section>

      <h2 className="h2">{kids.length} kids</h2>
      {groups.length === 0 ? (
        <p className="note">
          Want position groups like Left/Center/Right or Offense/Defense? Set them up in{' '}
          <Link href={`/teams/${t.id}/edit`}>Team settings</Link>, then tag kids here.
        </p>
      ) : (
        <p className="note">Tap the groups each kid can play. A kid can be in more than one.</p>
      )}
      <div className="list">
        {kids.map((k) => (
          <section key={k.id} className="card kid">
            <div className="kid-head">
              <span className="kid-name">{k.firstName}</span>
              <form action={removePlayer}>
                <input type="hidden" name="teamId" value={t.id} />
                <input type="hidden" name="playerId" value={k.id} />
                <ConfirmButton className="btn small danger" confirmLabel="Tap to remove">Remove</ConfirmButton>
              </form>
            </div>

            {groups.length > 0 && (
              <GroupChips teamId={t.id} playerId={k.id} groups={groups} selected={k.groupIds.filter((gid) => groups.some((g) => g.id === gid))} />
            )}

            <details>
              <summary>Rename</summary>
              <form action={renamePlayer} className="row">
                <input type="hidden" name="teamId" value={t.id} />
                <input type="hidden" name="playerId" value={k.id} />
                <input name="firstName" type="text" defaultValue={k.firstName} aria-label={`New name for ${k.firstName}`} style={{ flex: 1, minWidth: 0 }} />
                <button className="btn">Save</button>
              </form>
            </details>
          </section>
        ))}
      </div>
    </main>
  )
}

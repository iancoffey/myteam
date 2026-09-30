import Link from 'next/link'
import { addGuardian, addPlayers, removeGuardian, removePlayer, renamePlayer } from '@/app/actions'
import { ActionForm } from '@/components/ActionForm'
import { ConfirmButton } from '@/components/ConfirmButton'
import { GroupChips } from '@/components/GroupChips'
import { getOwnedTeam, listGuardians, listPlayers } from '@/lib/data'
import { cleanGroups } from '@/lib/formats'
import { formatPhone } from '@/lib/phone'

export default async function RosterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const t = await getOwnedTeam(id)
  const [kids, parents] = await Promise.all([listPlayers(t.id), listGuardians(t.id)])
  const groups = cleanGroups(t.groups)

  return (
    <main className="page">
      <header className="topbar">
        <Link href={`/teams/${t.id}`} className="back">← {t.name}</Link>
      </header>
      <h1 className="h1">Roster</h1>
      <p className="note">Kids are first names only. Parents need a first name and a phone or email so you can text the group.</p>

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
        {kids.map((k) => {
          const mine = parents.filter((p) => p.playerId === k.id)
          return (
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
                <GroupChips teamId={t.id} playerId={k.id} groups={groups} selected={k.groupIds.filter((id) => groups.some((g) => g.id === id))} />
              )}

              {mine.map((g) => (
                <div key={g.id} className="guardian">
                  <div className="who">
                    <b>{g.firstName}</b>
                    <span>{[g.phone && formatPhone(g.phone), g.email].filter(Boolean).join(' · ')}</span>
                  </div>
                  <form action={removeGuardian}>
                    <input type="hidden" name="teamId" value={t.id} />
                    <input type="hidden" name="guardianId" value={g.id} />
                    <ConfirmButton className="btn small" confirmLabel="Tap to remove">✕</ConfirmButton>
                  </form>
                </div>
              ))}

              <details>
                <summary>+ Add a parent</summary>
                <ActionForm action={addGuardian} submitLabel={`Add ${k.firstName}’s parent`}>
                  <input type="hidden" name="teamId" value={t.id} />
                  <input type="hidden" name="playerId" value={k.id} />
                  <input name="firstName" type="text" placeholder="Parent’s first name" autoCapitalize="words" autoComplete="off" aria-label="Parent’s first name" />
                  <input name="phone" type="tel" placeholder="Mobile number" autoComplete="off" aria-label="Mobile number" />
                  <input name="email" type="email" placeholder="Email (optional)" autoComplete="off" aria-label="Email" />
                </ActionForm>
              </details>

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
          )
        })}
      </div>
    </main>
  )
}

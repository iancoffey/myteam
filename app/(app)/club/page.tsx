import Link from 'next/link'
import { redirect } from 'next/navigation'
import { newInviteLink, removeMember, renameClub, setMemberRole } from '@/app/actions'
import { ActionForm } from '@/components/ActionForm'
import { ConfirmButton } from '@/components/ConfirmButton'
import { InviteShare } from '@/components/InviteShare'
import { requireSession } from '@/lib/auth'
import { currentClub, inviteToken, listMembers } from '@/lib/clubs'

export default async function ClubPage() {
  const session = await requireSession()
  const { club } = await currentClub(session)
  if (!club) redirect('/welcome')
  const isAdmin = club.role === 'admin'
  const [members, token] = await Promise.all([listMembers(club.id), inviteToken(club.id)])

  return (
    <main className="page">
      <header className="topbar">
        <Link href="/" className="back">← Teams</Link>
      </header>
      <h1 className="h1">{club.name}</h1>

      <section className="card">
        <h2 className="h2" style={{ margin: 0 }}>Invite coaches</h2>
        <p style={{ margin: 0 }}>Send this link to your assistant coaches. They create an account and see every team in {club.name}.</p>
        <InviteShare token={token} clubName={club.name} />
        {isAdmin && (
          <form action={newInviteLink}>
            <input type="hidden" name="clubId" value={club.id} />
            <ConfirmButton className="btn small" confirmLabel="Tap again: old link stops working">New link</ConfirmButton>
          </form>
        )}
      </section>

      <h2 className="h2">Coaches · {members.length}</h2>
      <div className="list">
        {members.map((m) => {
          const me = m.userId === session.userId
          return (
            <div key={m.userId} className="card">
              <div className="kid-head">
                <span className="kid-name" style={{ overflowWrap: 'anywhere' }}>
                  {m.email}
                  {me ? ' (you)' : ''}
                </span>
                <span className={`pill${m.role === 'admin' ? '' : ' practice'}`}>{m.role === 'admin' ? 'Admin' : 'Coach'}</span>
              </div>
              {isAdmin && !me && (
                <div className="row">
                  <form action={setMemberRole}>
                    <input type="hidden" name="clubId" value={club.id} />
                    <input type="hidden" name="userId" value={m.userId} />
                    <input type="hidden" name="role" value={m.role === 'admin' ? 'coach' : 'admin'} />
                    <button className="btn small">{m.role === 'admin' ? 'Make coach' : 'Make admin'}</button>
                  </form>
                  <form action={removeMember}>
                    <input type="hidden" name="clubId" value={club.id} />
                    <input type="hidden" name="userId" value={m.userId} />
                    <ConfirmButton className="btn small danger" confirmLabel="Tap to remove">Remove</ConfirmButton>
                  </form>
                </div>
              )}
            </div>
          )
        })}
      </div>
      <p className="note">Admins can rename the club, manage coaches, make a new invite link and delete teams.</p>

      {isAdmin && (
        <section className="card">
          <ActionForm action={renameClub} submitLabel="Save name">
            <input type="hidden" name="clubId" value={club.id} />
            <label className="lbl" htmlFor="name">Club name</label>
            <input id="name" name="name" type="text" defaultValue={club.name} autoCapitalize="words" />
          </ActionForm>
        </section>
      )}

      <form action={removeMember}>
        <input type="hidden" name="clubId" value={club.id} />
        <input type="hidden" name="userId" value={session.userId} />
        {members.length === 1 ? (
          <>
            <ConfirmButton className="btn danger block" confirmLabel={`Tap again to delete ${club.name}`}>
              Delete {club.name}
            </ConfirmButton>
            <p className="note" style={{ marginTop: 8 }}>You’re the only coach, so this deletes the club with its teams and games.</p>
          </>
        ) : (
          <ConfirmButton className="btn danger block" confirmLabel={`Tap again to leave ${club.name}`}>
            Leave {club.name}
          </ConfirmButton>
        )}
      </form>
      <Link href="/welcome" className="link-row">
        <span>+ Start another club</span>
      </Link>
    </main>
  )
}

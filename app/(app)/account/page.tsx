import Link from 'next/link'
import { changePassword, deleteAccount, logout } from '@/app/actions'
import { ActionForm } from '@/components/ActionForm'
import { ConfirmButton } from '@/components/ConfirmButton'
import { requireSession } from '@/lib/auth'

export default async function AccountPage() {
  const session = await requireSession()
  return (
    <main className="page">
      <header className="topbar">
        <Link href="/" className="back">← Teams</Link>
      </header>
      <h1 className="h1">Account</h1>
      <p className="muted" style={{ margin: 0, overflowWrap: 'anywhere' }}>Signed in as {session.email}</p>

      <form action={logout}>
        <button className="btn block">Sign out</button>
      </form>

      <section className="card">
        <ActionForm action={changePassword} submitLabel="Change password">
          <label className="lbl" htmlFor="current">Current password</label>
          <input id="current" name="current" type="password" autoComplete="current-password" required />
          <label className="lbl" htmlFor="next">New password</label>
          <input id="next" name="next" type="password" autoComplete="new-password" minLength={10} required />
          <p className="note">At least 10 characters. Changing it signs out your other phones.</p>
        </ActionForm>
      </section>

      <h2 className="h2">Delete account</h2>
      <p className="note">
        Removes your account right away. Clubs where you’re the only coach are deleted with their teams and games;
        clubs with other coaches keep everything.
      </p>
      <form action={deleteAccount}>
        <ConfirmButton className="btn danger block" confirmLabel="Tap again to delete your account">
          Delete my account
        </ConfirmButton>
      </form>
      <p className="note"><Link href="/privacy">Privacy policy</Link></p>
    </main>
  )
}

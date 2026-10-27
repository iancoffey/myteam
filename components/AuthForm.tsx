'use client'

import { useKeptForm } from '@/components/ActionForm'
import { login, signup } from '@/app/actions'

// Sign in or create an account. An invite token (from a club's link) rides along so the coach lands
// in that club afterwards.
export function AuthForm({ mode, invite }: { mode: 'login' | 'signup'; invite?: string }) {
  const { state, pending, ref, onSubmit } = useKeptForm(mode === 'login' ? login : signup)
  const creating = mode === 'signup'
  return (
    <form ref={ref} onSubmit={onSubmit} className="card">
      {invite && <input type="hidden" name="invite" value={invite} />}
      <div>
        <label className="lbl" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete={creating ? 'email' : 'username'} autoCapitalize="none" required />
      </div>
      <div>
        <label className="lbl" htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete={creating ? 'new-password' : 'current-password'} minLength={creating ? 10 : undefined} required />
        {creating && <p className="note" style={{ marginTop: 6 }}>At least 10 characters.</p>}
      </div>
      {state?.error && <p className="msg error" role="alert">{state.error}</p>}
      <button className="btn primary big" disabled={pending}>
        {pending ? (creating ? 'Creating…' : 'Signing in…') : creating ? 'Create account' : 'Sign in'}
      </button>
    </form>
  )
}

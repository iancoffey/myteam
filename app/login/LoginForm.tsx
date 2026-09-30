'use client'

import { useKeptForm } from '@/components/ActionForm'
import { login } from '../actions'

export function LoginForm() {
  const { state, pending, ref, onSubmit } = useKeptForm(login)
  return (
    <form ref={ref} onSubmit={onSubmit} className="card">
      <div>
        <label className="lbl" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="username" required />
      </div>
      <div>
        <label className="lbl" htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {state?.error && <p className="msg error" role="alert">{state.error}</p>}
      <button className="btn primary big" disabled={pending}>
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}

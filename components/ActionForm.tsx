'use client'

import { startTransition, useActionState, useEffect, useRef } from 'react'
import type { FormState } from '@/app/actions'

// Submit a form to a server action without React's automatic reset, so input survives a validation
// error. The form clears only when the action reports success.
export function useKeptForm(action: (state: FormState, fd: FormData) => Promise<FormState>) {
  const [state, formAction, pending] = useActionState(action, undefined)
  const ref = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (state?.ok) ref.current?.reset()
  }, [state])
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(() => formAction(fd))
  }
  return { state, pending, ref, onSubmit }
}

export function ActionForm({
  action,
  children,
  submitLabel,
  className = 'stack',
}: {
  action: (state: FormState, fd: FormData) => Promise<FormState>
  children: React.ReactNode
  submitLabel: string
  className?: string
}) {
  const { state, pending, ref, onSubmit } = useKeptForm(action)
  return (
    <form ref={ref} onSubmit={onSubmit} className={className}>
      {children}
      {state?.error && <p className="msg error" role="alert">{state.error}</p>}
      {state?.ok && <p className="msg ok" role="status">{state.ok}</p>}
      <button className="btn primary block" disabled={pending}>{pending ? 'Saving…' : submitLabel}</button>
    </form>
  )
}
